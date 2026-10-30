"""Opt-in contract test using a real, disposable BetterAuth service and database."""

import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi.testclient import TestClient

from app.main import app


@unittest.skipUnless(os.getenv("RUN_AUTH_INTEGRATION") == "1", "Set RUN_AUTH_INTEGRATION=1 after building auth-service")
class BetterAuthContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service_dir = Path(__file__).resolve().parents[2] / "auth-service"
        cls.node = shutil.which("node")
        if not cls.node or not (cls.service_dir / "dist/server.js").exists():
            raise RuntimeError("Install and build auth-service before running the live contract test")
        cls.directory = tempfile.TemporaryDirectory(prefix="quizpop-auth-contract-")
        cls.addClassCleanup(cls.directory.cleanup)
        with socket.socket() as available_port:
            available_port.bind(("127.0.0.1", 0))
            port = available_port.getsockname()[1]
        cls.auth_url = f"http://127.0.0.1:{port}/api/auth"
        env = dict(os.environ)
        env.pop("AUTH_DATABASE_URL", None)
        env.update({
            "NODE_ENV": "test", "HOST": "127.0.0.1", "PORT": str(port),
            "BETTER_AUTH_URL": cls.auth_url, "BETTER_AUTH_SECRET": secrets.token_urlsafe(48),
            "AUTH_SQLITE_PATH": str(Path(cls.directory.name) / "auth.db"),
            "FRONTEND_ORIGINS": "http://localhost:5173",
        })
        cls.run_command("migrate.js", env)
        cls.email = "contract-admin@example.test"
        cls.password = secrets.token_urlsafe(24)
        provisioning_env = {**env, "PROVISION_ADMIN_EMAIL": cls.email,
                            "PROVISION_ADMIN_NAME": "Contract test admin", "PROVISION_ADMIN_PASSWORD": cls.password}
        output = cls.run_command("provision-admin.js", provisioning_env)
        cls.admin_id = output.strip().split("ADMIN_USER_IDS: ")[-1]
        if not cls.admin_id or "\n" in cls.admin_id or " " in cls.admin_id:
            raise RuntimeError("Provisioning did not return a user ID")
        cls.service = subprocess.Popen(
            [cls.node, "dist/server.js"], cwd=cls.service_dir, env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        cls.addClassCleanup(cls.stop_service)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if cls.service.poll() is not None:
                raise RuntimeError("Disposable auth service exited during startup")
            try:
                with urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as response:
                    if response.status == 200:
                        return
            except (URLError, OSError):
                time.sleep(0.1)
        raise RuntimeError("Disposable auth service did not start")

    @classmethod
    def run_command(cls, script, env):
        result = subprocess.run([cls.node, f"dist/{script}"], cwd=cls.service_dir, env=env,
                                capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise RuntimeError(f"Auth service {script} failed; check setup (output withheld to protect credentials)")
        return result.stdout

    @classmethod
    def stop_service(cls):
        cls.service.terminate()
        try:
            cls.service.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.service.kill()
            cls.service.wait(timeout=5)

    def test_real_session_allows_only_allowlisted_admin_and_logout_revokes_access(self):
        request = Request(f"{self.auth_url}/sign-in/email", method="POST", headers={
            "Content-Type": "application/json", "Origin": "http://localhost:5173",
        }, data=json.dumps({"email": self.email, "password": self.password}).encode())
        with urlopen(request, timeout=10) as response:
            token = response.headers.get("set-auth-token")
            self.assertTrue(token, "Sign-in must return a signed bearer token")
        headers = {"Authorization": f"Bearer {token}"}
        # Do not enter the lifespan context: only auth endpoints are exercised.
        client = TestClient(app)
        self.addCleanup(client.close)
        with patch.dict(os.environ, {"BETTER_AUTH_URL": self.auth_url, "ADMIN_USER_IDS": self.admin_id}):
            authenticated = client.get("/api/admin/me", headers=headers)
            self.assertEqual(authenticated.status_code, 200)
            self.assertEqual(authenticated.json(), {"id": self.admin_id})
            with patch.dict(os.environ, {"ADMIN_USER_IDS": "a-different-provisioned-user"}):
                self.assertEqual(client.get("/api/admin/me", headers=headers).status_code, 403)
            self.assertEqual(client.get("/api/admin/me").status_code, 401)
            self.assertEqual(client.get("/api/admin/me", headers={"Authorization": "Bearer invalid"}).status_code, 401)
            logout = Request(f"{self.auth_url}/sign-out", method="POST", headers={
                **headers, "Content-Type": "application/json", "Origin": "http://localhost:5173",
            }, data=b"{}")
            with urlopen(logout, timeout=10) as response:
                self.assertEqual(response.status, 200)
            self.assertEqual(client.get("/api/admin/me", headers=headers).status_code, 401)


if __name__ == "__main__":
    unittest.main()
