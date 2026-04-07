import os
import time
import json
import aiosqlite
import logging

DATABASE_PATH = os.getenv("DATABASE_PATH", "data/gta.db")


async def init_db() -> None:
    """Create the data directory and database tables if they don't exist."""
    os.makedirs(os.path.dirname(DATABASE_PATH) or "data", exist_ok=True)
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at REAL NOT NULL
            )
        """)

        # ── New tables for memory system ──

        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                github_login TEXT PRIMARY KEY,
                avatar_url TEXT NOT NULL DEFAULT '',
                preferred_mode TEXT DEFAULT NULL,
                settings_json TEXT DEFAULT '{}',
                created_at REAL NOT NULL,
                last_seen_at REAL NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversation_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                github_login TEXT NOT NULL REFERENCES users(github_login),
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                summary TEXT NOT NULL,
                key_topics TEXT DEFAULT '[]',
                message_count INTEGER NOT NULL,
                created_at REAL NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                github_login TEXT NOT NULL REFERENCES users(github_login),
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL DEFAULT NULL
            )
        """)

        # ── ALTER existing tables (idempotent) ──

        try:
            await db.execute("ALTER TABLE conversations ADD COLUMN github_login TEXT DEFAULT NULL")
        except Exception:
            pass  # Column already exists

        # ── Indexes ──

        await db.execute("CREATE INDEX IF NOT EXISTS idx_convsummary_user_repo ON conversation_summaries(github_login, owner, repo)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_usermemory_user_repo ON user_memory(github_login, owner, repo)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user_repo ON conversations(github_login, owner, repo)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_convid ON messages(conversation_id, created_at)")

        await db.commit()


# ── Existing functions ──


async def save_conversation(conv_id: str, owner: str, repo: str, github_login: str | None = None) -> None:
    """Insert a new conversation row, ignoring if it already exists."""
    now = time.time()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO conversations (id, owner, repo, github_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (conv_id, owner, repo, github_login, now, now),
        )
        # Update github_login if it wasn't set before (anonymous -> authenticated)
        if github_login:
            await db.execute(
                "UPDATE conversations SET github_login = ? WHERE id = ? AND github_login IS NULL",
                (github_login, conv_id),
            )
        await db.commit()


async def save_message(conv_id: str, role: str, content: str) -> None:
    """Insert a message and update the conversation's updated_at timestamp."""
    now = time.time()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (conv_id, role, content, now),
        )
        await db.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conv_id),
        )
        await db.commit()


async def get_conversation_history(conv_id: str, limit: int = 20) -> list[tuple[str, str]]:
    """Return the most recent (query, response) pairs for a conversation."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
            (conv_id,),
        )
        rows = await cursor.fetchall()

    # Pair consecutive user/assistant messages
    pairs: list[tuple[str, str]] = []
    i = 0
    while i < len(rows) - 1:
        if rows[i][0] == "user" and rows[i + 1][0] == "assistant":
            pairs.append((rows[i][1], rows[i + 1][1]))
            i += 2
        else:
            i += 1

    return pairs[-limit:]


async def get_conversation_messages(conv_id: str) -> list[tuple[str, str]]:
    """Return all (role, content) rows for a conversation, ordered by time."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
            (conv_id,),
        )
        return await cursor.fetchall()


# ── User functions ──


async def upsert_user(github_login: str, avatar_url: str) -> dict:
    """Create or update a user. Returns the user row as dict."""
    now = time.time()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            """INSERT INTO users (github_login, avatar_url, created_at, last_seen_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(github_login) DO UPDATE SET
                   avatar_url = CASE WHEN excluded.avatar_url != '' THEN excluded.avatar_url ELSE users.avatar_url END,
                   last_seen_at = excluded.last_seen_at""",
            (github_login, avatar_url, now, now),
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT github_login, avatar_url, preferred_mode, settings_json, created_at, last_seen_at FROM users WHERE github_login = ?",
            (github_login,),
        )
        row = await cursor.fetchone()
    if row:
        return {
            "github_login": row[0], "avatar_url": row[1],
            "preferred_mode": row[2], "settings_json": row[3],
            "created_at": row[4], "last_seen_at": row[5],
        }
    return {"github_login": github_login}


async def get_user_settings(github_login: str) -> dict:
    """Get user preferences and settings."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            "SELECT preferred_mode, settings_json FROM users WHERE github_login = ?",
            (github_login,),
        )
        row = await cursor.fetchone()
    if row:
        settings = {}
        try:
            settings = json.loads(row[1]) if row[1] else {}
        except (json.JSONDecodeError, TypeError):
            pass
        return {"preferred_mode": row[0], "settings": settings}
    return {"preferred_mode": None, "settings": {}}


async def update_user_settings(github_login: str, preferred_mode: str | None = None, settings_json: str | None = None) -> None:
    """Update user preferences."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        if preferred_mode is not None:
            await db.execute(
                "UPDATE users SET preferred_mode = ? WHERE github_login = ?",
                (preferred_mode, github_login),
            )
        if settings_json is not None:
            await db.execute(
                "UPDATE users SET settings_json = ? WHERE github_login = ?",
                (settings_json, github_login),
            )
        await db.commit()


# ── Conversation summary functions ──


async def save_conversation_summary(
    conv_id: str, github_login: str, owner: str, repo: str,
    summary: str, key_topics: list[str], message_count: int,
) -> None:
    """Store a conversation summary for long-term memory."""
    now = time.time()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            """INSERT INTO conversation_summaries
               (conversation_id, github_login, owner, repo, summary, key_topics, message_count, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (conv_id, github_login, owner, repo, summary, json.dumps(key_topics), message_count, now),
        )
        await db.commit()


async def get_conversation_summaries(github_login: str, owner: str, repo: str, limit: int = 3) -> list[dict]:
    """Get recent conversation summaries for a user+repo."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            """SELECT conversation_id, summary, key_topics, message_count, created_at
               FROM conversation_summaries
               WHERE github_login = ? AND owner = ? AND repo = ?
               ORDER BY created_at DESC LIMIT ?""",
            (github_login, owner, repo, limit),
        )
        rows = await cursor.fetchall()
    results = []
    for row in rows:
        topics = []
        try:
            topics = json.loads(row[2]) if row[2] else []
        except (json.JSONDecodeError, TypeError):
            pass
        results.append({
            "conversation_id": row[0], "summary": row[1],
            "key_topics": topics, "message_count": row[3], "created_at": row[4],
        })
    return results


# ── User memory functions ──


async def save_user_memory(
    github_login: str, owner: str, repo: str,
    memory_type: str, content: str, expires_at: float | None = None,
) -> None:
    """Store a long-term memory fragment for a user."""
    now = time.time()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            """INSERT INTO user_memory (github_login, owner, repo, memory_type, content, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (github_login, owner, repo, memory_type, content, now, expires_at),
        )
        await db.commit()


async def get_user_memories(github_login: str, owner: str, repo: str) -> list[dict]:
    """Get memory fragments for a user — both repo-specific and global."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            """SELECT memory_type, content, owner, repo, created_at
               FROM user_memory
               WHERE github_login = ?
                 AND ((owner = ? AND repo = ?) OR (owner = '*' AND repo = '*'))
                 AND (expires_at IS NULL OR expires_at > ?)
               ORDER BY created_at DESC""",
            (github_login, owner, repo, time.time()),
        )
        rows = await cursor.fetchall()
    return [
        {"memory_type": r[0], "content": r[1], "owner": r[2], "repo": r[3], "created_at": r[4]}
        for r in rows
    ]


async def delete_expired_memories() -> None:
    """Remove expired user memory entries."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "DELETE FROM user_memory WHERE expires_at IS NOT NULL AND expires_at < ?",
            (time.time(),),
        )
        await db.commit()


async def clear_user_memory(github_login: str) -> None:
    """Clear all long-term memory for a user (GDPR-style)."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("DELETE FROM user_memory WHERE github_login = ?", (github_login,))
        await db.execute("DELETE FROM conversation_summaries WHERE github_login = ?", (github_login,))
        await db.commit()


async def get_user_conversations(github_login: str, limit: int = 20) -> list[dict]:
    """Get a user's past conversations with summaries."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            """SELECT c.id, c.owner, c.repo, c.created_at, c.updated_at,
                      cs.summary, cs.key_topics
               FROM conversations c
               LEFT JOIN conversation_summaries cs ON cs.conversation_id = c.id
               WHERE c.github_login = ?
               ORDER BY c.updated_at DESC LIMIT ?""",
            (github_login, limit),
        )
        rows = await cursor.fetchall()
    results = []
    for row in rows:
        topics = []
        try:
            topics = json.loads(row[6]) if row[6] else []
        except (json.JSONDecodeError, TypeError):
            pass
        results.append({
            "id": row[0], "owner": row[1], "repo": row[2],
            "created_at": row[3], "updated_at": row[4],
            "summary": row[5], "key_topics": topics,
        })
    return results
