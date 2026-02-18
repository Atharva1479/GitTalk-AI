import os
import time
import aiosqlite

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
        await db.commit()


async def save_conversation(conv_id: str, owner: str, repo: str) -> None:
    """Insert a new conversation row, ignoring if it already exists."""
    now = time.time()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO conversations (id, owner, repo, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (conv_id, owner, repo, now, now),
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
