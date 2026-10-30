"""BetterAuth session verification and server-owned admin authorization."""

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from http.client import HTTPException as HTTPProtocolError
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


bearer_scheme = HTTPBearer(auto_error=False)
MAX_SESSION_RESPONSE_BYTES = 64 * 1024


@dataclass(frozen=True)
class AdminIdentity:
    id: str


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward a session credential to a redirected destination.
        return None


def invalid_session() -> HTTPException:
    return HTTPException(
        status_code=401, detail="Invalid or expired admin session",
        headers={"WWW-Authenticate": "Bearer"},
    )


def auth_unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="Admin authentication unavailable")


def session_endpoint() -> str:
    base_url = os.getenv("BETTER_AUTH_URL", "").strip().rstrip("/")
    try:
        parsed = urlsplit(base_url)
        # HTTP is only permitted for loopback development.
        secure = parsed.scheme == "https" or (
            parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        )
        if not secure or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Invalid auth service URL")
        _ = parsed.port
    except ValueError:
        raise auth_unavailable() from None
    return f"{base_url}/get-session?disableCookieCache=true"


def fetch_session(token: str):
    request = Request(session_endpoint(), headers={
        "Authorization": f"Bearer {token}", "Accept": "application/json",
    })
    try:
        with build_opener(NoRedirects()).open(request, timeout=5) as response:
            if response.status != 200:
                raise auth_unavailable()
            body = response.read(MAX_SESSION_RESPONSE_BYTES + 1)
            if len(body) > MAX_SESSION_RESPONSE_BYTES:
                raise auth_unavailable()
            return json.loads(body)
    except HTTPError as error:
        if error.code in {401, 403}:
            raise invalid_session() from None
        raise auth_unavailable() from None
    except (URLError, OSError, ValueError, HTTPProtocolError):
        # Keep upstream responses and credentials out of errors and logs.
        raise auth_unavailable() from None


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AdminIdentity:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise invalid_session()
    token = credentials.credentials
    if not token or len(token) > 4096 or any(char.isspace() or ord(char) < 33 or ord(char) > 126 for char in token):
        raise invalid_session()

    admin_ids = {value.strip() for value in os.getenv("ADMIN_USER_IDS", "").split(",") if value.strip()}
    if not admin_ids:
        raise auth_unavailable()
    payload = fetch_session(token)
    if payload is None:
        raise invalid_session()
    try:
        user_id = payload["user"]["id"]
        session = payload["session"]
        expires_at = datetime.fromisoformat(session["expiresAt"].replace("Z", "+00:00"))
        if not isinstance(user_id, str) or not user_id or session["userId"] != user_id:
            raise ValueError("Inconsistent identity")
        if expires_at.tzinfo is None:
            raise ValueError("Session expiry must include a timezone")
    except (KeyError, TypeError, ValueError, AttributeError):
        raise auth_unavailable() from None
    if expires_at <= datetime.now(timezone.utc):
        raise invalid_session()
    if user_id not in admin_ids:
        raise HTTPException(status_code=403, detail="Admin access required")
    return AdminIdentity(id=user_id)
