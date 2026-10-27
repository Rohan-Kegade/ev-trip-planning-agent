import hashlib
import hmac
import logging
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

load_dotenv()

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("AUTH_DB_PATH", os.path.join(os.path.dirname(__file__), "users.db"))
JWT_ALGORITHM = "HS256"
TOKEN_TTL = timedelta(days=7)
MIN_PASSWORD_LENGTH = 8

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    # Fine for local dev, but every restart logs everyone out
    JWT_SECRET = secrets.token_urlsafe(32)
    logger.warning("JWT_SECRET not set; using a random secret. Sessions won't survive a restart.")

# ==================== Database ====================

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

init_db()

# ==================== Passwords & tokens ====================

# scrypt parameters (n=2^14, r=8, p=1) are the commonly recommended interactive-login settings
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return f"scrypt${salt.hex()}${digest.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return hmac.compare_digest(digest.hex(), digest_hex)

# Compared against when the email doesn't exist, so login takes the same time either way
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))

def create_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + TOKEN_TTL}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# ==================== Schemas ====================

def normalize_email(value: str) -> str:
    value = value.strip().lower()
    local, _, domain = value.partition("@")
    if not local or "." not in domain:
        raise ValueError("Enter a valid email address.")
    return value

class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=256)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name is required.")
        return value

    _email = field_validator("email")(normalize_email)

class LoginRequest(BaseModel):
    email: str
    password: str

    _email = field_validator("email")(lambda value: value.strip().lower())

class User(BaseModel):
    id: int
    name: str
    email: str

class AuthResponse(BaseModel):
    token: str
    user: User

def row_to_user(row: sqlite3.Row) -> User:
    return User(id=row["id"], name=row["name"], email=row["email"])

# ==================== Dependency ====================

bearer = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: sqlite3.Connection = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized

    row = db.execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise unauthorized
    return row_to_user(row)

# ==================== Routes ====================

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(request: SignupRequest, db: sqlite3.Connection = Depends(get_db)):
    try:
        with db:
            cursor = db.execute(
                "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (request.name, request.email, hash_password(request.password), datetime.now(timezone.utc).isoformat()),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    user = User(id=cursor.lastrowid, name=request.name, email=request.email)
    return AuthResponse(token=create_token(user.id), user=user)

@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute(
        "SELECT id, name, email, password_hash FROM users WHERE email = ?", (request.email,)
    ).fetchone()

    if not verify_password(request.password, row["password_hash"] if row else DUMMY_HASH) or row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password.")

    return AuthResponse(token=create_token(row["id"]), user=row_to_user(row))

@router.get("/me", response_model=User)
def me(user: User = Depends(get_current_user)):
    return user
