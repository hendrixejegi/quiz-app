import os
import secrets
import uuid
import asyncio
import smtplib
import ssl
import logging
from html import escape
from email.message import EmailMessage
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field, BaseModel
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, schemas
from fastapi_users.authentication import AuthenticationBackend, CookieTransport
from fastapi_users.authentication.strategy.db import DatabaseStrategy
from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID, SQLAlchemyBaseOAuthAccountTableUUID, SQLAlchemyUserDatabase
from fastapi_users_db_sqlalchemy.access_token import SQLAlchemyBaseAccessTokenTableUUID, SQLAlchemyAccessTokenDatabase
from sqlalchemy import String, delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, DATABASE_URL

SECURE = os.getenv('AUTH_COOKIE_SECURE', 'true').lower() != 'false'
SECRET = os.getenv('AUTH_SECRET')
if not SECRET:
    raise RuntimeError('Set AUTH_SECRET to a persistent random secret before starting the API')
FRONTEND = os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')
SESSION_SECONDS = 86400

class OAuthAccount(SQLAlchemyBaseOAuthAccountTableUUID, Base):
    pass

class User(SQLAlchemyBaseUserTableUUID, Base):
    display_name: Mapped[str] = mapped_column(String(80), default='', nullable=False)
    oauth_accounts: Mapped[list[OAuthAccount]] = relationship('OAuthAccount', lazy='selectin', cascade='all, delete-orphan')

class AccessToken(SQLAlchemyBaseAccessTokenTableUUID, Base):
    pass

async_url = DATABASE_URL.replace('sqlite://', 'sqlite+aiosqlite://').replace('postgresql://', 'postgresql+psycopg://')
auth_engine = create_async_engine(async_url, pool_pre_ping=True)
AuthSession = async_sessionmaker(auth_engine, expire_on_commit=False)

async def get_auth_db():
    async with AuthSession() as session:
        yield session

async def get_user_db(session=Depends(get_auth_db)):
    yield SQLAlchemyUserDatabase(session, User, OAuthAccount)

async def get_token_db(session=Depends(get_auth_db)):
    yield SQLAlchemyAccessTokenDatabase(session, AccessToken)

def get_strategy(db=Depends(get_token_db)):
    return DatabaseStrategy(db, lifetime_seconds=SESSION_SECONDS)

async def send_account_email(email, token, action):
    host = os.getenv('SMTP_HOST', '').strip()
    sender = os.getenv('SMTP_FROM', '').strip()
    username = os.getenv('SMTP_USERNAME', '')
    password = os.getenv('SMTP_PASSWORD', '')
    starttls = os.getenv('SMTP_STARTTLS', 'true').lower() == 'true'
    if not host or not sender or (username and (not password or password.startswith('<'))):
        raise HTTPException(503, 'Email delivery is not configured. Please contact the administrator.')
    try:
        port = int(os.getenv('SMTP_PORT', '587'))
        if not 1 <= port <= 65535:
            raise ValueError
    except ValueError:
        raise HTTPException(503, 'Email delivery is not configured. Please contact the administrator.') from None
    if host.lower() == 'live.smtp.mailtrap.io' and not starttls:
        raise HTTPException(503, 'Email delivery requires a secure SMTP connection. Please contact the administrator.')
    if action not in {'verify', 'reset'}:
        raise ValueError('Unsupported account email action')
    link = f'{FRONTEND}/account/{action}?token={quote(token, safe="")}'
    instruction = 'Verify your email' if action == 'verify' else 'Reset your password'
    message = EmailMessage()
    message['From'] = sender
    message['To'] = email
    message['Subject'] = 'Verify your QuizPop email' if action == 'verify' else 'Reset your QuizPop password'
    message.set_content(f'{instruction}: {link}\nIf you did not request this, ignore this email.')
    message.add_alternative(
        f'<html><body><h1>{instruction}</h1><p><a href="{escape(link, quote=True)}">'
        f'{instruction}</a></p><p>If you did not request this, ignore this email.</p></body></html>',
        subtype='html',
    )
    def deliver():
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            if starttls:
                smtp.starttls(context=ssl.create_default_context())
            if username:
                smtp.login(username, password)
            refused = smtp.send_message(message)
            if refused:
                raise smtplib.SMTPRecipientsRefused(refused)
    try:
        await asyncio.to_thread(deliver)
    except (smtplib.SMTPException, OSError) as error:
        # Provider exceptions can contain recipients, credentials or message data.
        logging.getLogger(__name__).warning('Account email delivery failed (%s)', type(error).__name__)
        raise HTTPException(503, 'Email delivery is temporarily unavailable. Please try again later or contact the administrator.') from None

class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET

    async def validate_password(self, password, user):
        if len(password) < 12 or len(password) > 128:
            from fastapi_users.exceptions import InvalidPasswordException
            raise InvalidPasswordException(reason='Use a password with 12 to 128 characters.')

    async def on_after_request_verify(self, user, token, request=None):
        await send_account_email(user.email, token, 'verify')

    async def on_after_forgot_password(self, user, token, request=None):
        await send_account_email(user.email, token, 'reset')

    async def on_after_reset_password(self, user, request=None):
        async with AuthSession() as session:
            await session.execute(delete(AccessToken).where(AccessToken.user_id == user.id))
            await session.commit()

async def get_user_manager(db=Depends(get_user_db)):
    yield UserManager(db)

class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str

class UserCreate(schemas.BaseUserCreate):
    display_name: str = Field(default='', max_length=80)

class UserUpdate(BaseModel):
    display_name: str = Field(max_length=80)

transport = CookieTransport(cookie_name='quizpop_session', cookie_max_age=SESSION_SECONDS, cookie_secure=SECURE, cookie_samesite='lax')
backend = AuthenticationBackend(name='cookie', transport=transport, get_strategy=get_strategy)
users = FastAPIUsers[User, uuid.UUID](get_user_manager, [backend])
current_user = users.current_user(active=True, verified=True)
optional_user = users.current_user(optional=True, active=True, verified=True)
router = APIRouter(prefix='/api/auth')
router.include_router(users.get_auth_router(backend, requires_verification=True), prefix='/session')
router.include_router(users.get_register_router(UserRead, UserCreate))
router.include_router(users.get_verify_router(UserRead))
router.include_router(users.get_reset_password_router())
@router.get('/users/me', response_model=UserRead)
async def read_profile(user=Depends(current_user)):
    return user

@router.patch('/users/me', response_model=UserRead)
async def update_profile(payload: UserUpdate, user=Depends(current_user), session=Depends(get_auth_db)):
    user.display_name = payload.display_name.strip()
    session.add(user)
    await session.commit()
    return user


@router.get('/csrf')
async def csrf(request: Request, response: Response):
    token = request.cookies.get('quizpop_csrf') or secrets.token_urlsafe(32)
    response.set_cookie('quizpop_csrf', token, secure=SECURE, httponly=True, samesite='lax')
    response.headers['Cache-Control'] = 'no-store'
    return {'token': token}

@router.get('/config')
async def config():
    return {'google': bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET'))}

@router.post('/revoke-sessions')
async def revoke_sessions(user=Depends(current_user), session=Depends(get_auth_db)):
    await session.execute(delete(AccessToken).where(AccessToken.user_id == user.id))
    await session.commit()
    response = Response(status_code=204)
    response.delete_cookie('quizpop_session')
    return response

if os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET'):
    from httpx_oauth.clients.google import GoogleOAuth2
    google = GoogleOAuth2(os.environ['GOOGLE_CLIENT_ID'], os.environ['GOOGLE_CLIENT_SECRET'])
    router.include_router(users.get_oauth_router(google, backend, SECRET, redirect_url=os.environ['GOOGLE_REDIRECT_URL'], associate_by_email=False, is_verified_by_default=True), prefix='/google')
    router.include_router(users.get_oauth_associate_router(google, UserRead, SECRET, redirect_url=os.environ['GOOGLE_LINK_REDIRECT_URL']), prefix='/link/google')

async def websocket_user(token):
    async with AuthSession() as session:
        manager = UserManager(SQLAlchemyUserDatabase(session, User, OAuthAccount))
        strategy = DatabaseStrategy(SQLAlchemyAccessTokenDatabase(session, AccessToken), lifetime_seconds=SESSION_SECONDS)
        user = await strategy.read_token(token, manager)
        return user if user and user.is_active and user.is_verified else None

