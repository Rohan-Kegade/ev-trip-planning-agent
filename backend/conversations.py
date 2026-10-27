"""Saved chats: each conversation stores its graph state so a user can reopen it later."""

import json
import sqlite3
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from auth import DB_PATH, User, get_current_user, get_db

MAX_TITLE_LENGTH = 60

# ==================== Database ====================

def init_conversations():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                state TEXT NOT NULL,
                input_request TEXT,
                ended INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS conversations_by_user ON conversations (user_id, updated_at)")

init_conversations()

def summary(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "ended": bool(row["ended"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

def get_conversation_row(db: sqlite3.Connection, user_id: int, conversation_id: str) -> sqlite3.Row:
    # Scoped to the user, so someone else's conversation id behaves exactly like a missing one
    row = db.execute(
        "SELECT * FROM conversations WHERE id = ? AND user_id = ?", (conversation_id, user_id)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return row

def save_conversation(db, user_id, conversation_id, title, state, input_request) -> dict:
    """Creates the conversation when conversation_id is None, otherwise updates it. Returns its summary."""
    now = datetime.now(timezone.utc).isoformat()
    title = title[:MAX_TITLE_LENGTH]
    with db:
        if conversation_id is None:
            conversation_id = str(uuid.uuid4())
            db.execute(
                "INSERT INTO conversations (id, user_id, title, state, input_request, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (conversation_id, user_id, title, json.dumps(state), json.dumps(input_request), now, now),
            )
        else:
            db.execute(
                "UPDATE conversations SET title = ?, state = ?, input_request = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (title, json.dumps(state), json.dumps(input_request), now, conversation_id, user_id),
            )
    return summary(get_conversation_row(db, user_id, conversation_id))

# ==================== Routes ====================

router = APIRouter(prefix="/conversations", tags=["conversations"])

@router.get("")
def list_conversations(user: User = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, title, ended, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
        (user.id,),
    ).fetchall()
    return [summary(row) for row in rows]

@router.get("/{conversation_id}")
def get_conversation(conversation_id: str, user: User = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    row = get_conversation_row(db, user.id, conversation_id)
    return {
        "conversation": summary(row),
        "state": json.loads(row["state"]),
        "input_request": None if row["ended"] else json.loads(row["input_request"] or "null"),
    }

@router.post("/{conversation_id}/end")
def end_conversation(conversation_id: str, user: User = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    get_conversation_row(db, user.id, conversation_id)
    with db:
        db.execute("UPDATE conversations SET ended = 1, input_request = NULL WHERE id = ? AND user_id = ?", (conversation_id, user.id))
    return summary(get_conversation_row(db, user.id, conversation_id))

@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(conversation_id: str, user: User = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    get_conversation_row(db, user.id, conversation_id)
    with db:
        db.execute("DELETE FROM conversations WHERE id = ? AND user_id = ?", (conversation_id, user.id))
