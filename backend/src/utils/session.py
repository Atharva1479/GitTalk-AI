"""
Server-side session management using signed JWT tokens.
- Sessions are stored as httpOnly cookies (not accessible to JavaScript)
- GitHub tokens are stored server-side in the users table (hashed)
- CSRF state tokens for OAuth flow stored in-memory with TTL
"""

import os
import time
import secrets
import hashlib
import logging
import jwt

SECRET_KEY = os.getenv("SESSION_SECRET", secrets.token_hex(32))
SESSION_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days
CSRF_TTL_SECONDS = 600  # 10 minutes

# In-memory CSRF state store (keyed by state token -> expiry timestamp)
_csrf_states: dict[str, float] = {}


def generate_csrf_state() -> str:
    """Generate a CSRF state token for OAuth flow."""
    state = secrets.token_urlsafe(32)
    _csrf_states[state] = time.time() + CSRF_TTL_SECONDS
    # Cleanup expired states
    now = time.time()
    expired = [k for k, v in _csrf_states.items() if v < now]
    for k in expired:
        del _csrf_states[k]
    return state


def validate_csrf_state(state: str) -> bool:
    """Validate and consume a CSRF state token. Returns True if valid."""
    if state not in _csrf_states:
        return False
    expiry = _csrf_states.pop(state)
    return time.time() < expiry


def hash_token(token: str) -> str:
    """Hash a GitHub token for storage (one-way, for lookup)."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_session_token(github_login: str, avatar_url: str) -> str:
    """Create a signed JWT session token."""
    payload = {
        "sub": github_login,
        "avatar_url": avatar_url,
        "iat": int(time.time()),
        "exp": int(time.time()) + SESSION_EXPIRY_SECONDS,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def verify_session_token(token: str) -> dict | None:
    """Verify and decode a session JWT. Returns payload or None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        logging.debug("Session token expired")
        return None
    except jwt.InvalidTokenError:
        logging.debug("Invalid session token")
        return None


def get_session_from_cookie(cookie_header: str | None) -> dict | None:
    """Extract and verify session from cookie header."""
    if not cookie_header:
        return None
    for part in cookie_header.split(";"):
        part = part.strip()
        if part.startswith("gta_session="):
            token = part[len("gta_session="):]
            return verify_session_token(token)
    return None


def build_session_cookie(session_token: str, is_prod: bool) -> str:
    """Build Set-Cookie header value for the session token."""
    parts = [
        f"gta_session={session_token}",
        f"Max-Age={SESSION_EXPIRY_SECONDS}",
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
    ]
    if is_prod:
        parts.append("Secure")
    return "; ".join(parts)


def build_clear_cookie(is_prod: bool) -> str:
    """Build Set-Cookie header to clear the session."""
    parts = [
        "gta_session=",
        "Max-Age=0",
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
    ]
    if is_prod:
        parts.append("Secure")
    return "; ".join(parts)
