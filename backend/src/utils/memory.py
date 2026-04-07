"""
Memory system for GitTalk-AI.
- Short-term: restore conversation history from SQLite on reconnect.
- Long-term: conversation summaries + extracted user facts across sessions.
"""

import re
import time
import logging
from src.utils.db import (
    get_conversation_history,
    get_conversation_messages,
    get_conversation_summaries,
    get_user_memories,
    get_user_settings,
    save_conversation_summary,
    save_user_memory,
    delete_expired_memories,
)
from src.utils.llm import generate_response


# ── Short-term memory ──


async def load_short_term_memory(conversation_id: str, limit: int = 20) -> list[tuple[str, str]]:
    """Load conversation history from SQLite for reconnects."""
    return await get_conversation_history(conversation_id, limit=limit)


# ── Long-term memory ──


def _time_ago(timestamp: float) -> str:
    """Format a timestamp as a human-readable relative time."""
    diff = time.time() - timestamp
    if diff < 3600:
        return f"{int(diff / 60)}m ago"
    if diff < 86400:
        return f"{int(diff / 3600)}h ago"
    days = int(diff / 86400)
    if days == 1:
        return "1 day ago"
    return f"{days} days ago"


async def load_long_term_context(github_login: str, owner: str, repo: str) -> str:
    """
    Assemble long-term memory block for prompt injection.
    Queries conversation summaries, user memories, and preferences.
    Returns formatted string ready for the prompt.
    """
    parts: list[str] = []

    # 1. Recent conversation summaries for this repo
    summaries = await get_conversation_summaries(github_login, owner, repo, limit=3)
    if summaries:
        lines = ["Previous conversations about this repository:"]
        for s in summaries:
            topics_str = ", ".join(s["key_topics"][:5]) if s["key_topics"] else ""
            time_str = _time_ago(s["created_at"])
            line = f"- [{time_str}] {s['summary']}"
            if topics_str:
                line += f" Topics: {topics_str}"
            lines.append(line)
        parts.append("\n".join(lines))

    # 2. User memory fragments (repo-specific + global)
    memories = await get_user_memories(github_login, owner, repo)
    if memories:
        lines = ["Known about this user:"]
        for m in memories[:10]:  # Cap at 10 fragments
            lines.append(f"- {m['content']}")
        parts.append("\n".join(lines))

    # 3. User preferences
    settings = await get_user_settings(github_login)
    if settings.get("preferred_mode"):
        parts.append(f"User's preferred analysis mode: {settings['preferred_mode']}")

    return "\n\n".join(parts) if parts else ""


async def summarize_conversation(
    conv_id: str, github_login: str, owner: str, repo: str,
) -> None:
    """
    Background task: summarize a conversation and store for long-term memory.
    Only runs for conversations with 3+ exchanges.
    """
    try:
        messages = await get_conversation_messages(conv_id)
        if len(messages) < 6:  # Less than 3 full exchanges (user+assistant pairs)
            return

        # Format messages, truncate to last 5000 chars
        formatted = "\n".join(f"{role}: {content}" for role, content in messages)
        if len(formatted) > 5000:
            formatted = formatted[-5000:]

        prompt = f"""Summarize this conversation about the GitHub repository {owner}/{repo} in 2-3 sentences.
Focus on: what the user wanted to understand, what they learned, and any decisions or preferences they expressed.
Also extract 3-5 key topics as a JSON array.

Conversation:
{formatted}

Return EXACTLY in this format (no other text):
SUMMARY: <your summary>
TOPICS: ["topic1", "topic2", "topic3"]"""

        response_text, _ = await generate_response(prompt)

        # Parse response
        summary = ""
        key_topics: list[str] = []

        for line in response_text.strip().splitlines():
            line = line.strip()
            if line.startswith("SUMMARY:"):
                summary = line[len("SUMMARY:"):].strip()
            elif line.startswith("TOPICS:"):
                topics_str = line[len("TOPICS:"):].strip()
                try:
                    parsed = eval(topics_str)  # noqa: S307
                    if isinstance(parsed, list):
                        key_topics = [str(t) for t in parsed[:5]]
                except Exception:
                    # Try regex fallback
                    key_topics = re.findall(r'"([^"]+)"', topics_str)[:5]

        if summary:
            message_count = len(messages) // 2  # Approximate exchange count
            await save_conversation_summary(
                conv_id, github_login, owner, repo,
                summary, key_topics, message_count,
            )
            logging.info(f"Saved conversation summary for {github_login} on {owner}/{repo}")

    except Exception as e:
        logging.warning(f"Failed to summarize conversation {conv_id}: {e}")


async def extract_user_memories(
    conv_id: str, github_login: str, owner: str, repo: str,
) -> None:
    """
    Background task: extract durable facts/preferences from a conversation.
    Stores in user_memory table.
    """
    try:
        messages = await get_conversation_messages(conv_id)
        if len(messages) < 6:
            return

        formatted = "\n".join(f"{role}: {content}" for role, content in messages)
        if len(formatted) > 5000:
            formatted = formatted[-5000:]

        prompt = f"""From this conversation about {owner}/{repo}, extract any durable facts about the user's preferences or knowledge that would be useful in future conversations.
Examples: preferred coding style, areas of expertise, what they're working on, technologies they prefer.

Only extract genuinely useful, specific facts. Return each on a new line prefixed with "- ".
If there are no durable facts worth remembering, return just "NONE".

Conversation:
{formatted}"""

        response_text, _ = await generate_response(prompt)

        if "NONE" in response_text.strip().upper() and len(response_text.strip()) < 20:
            return

        for line in response_text.strip().splitlines():
            line = line.strip()
            if line.startswith("- "):
                fact = line[2:].strip()
                if fact and len(fact) > 5:
                    await save_user_memory(
                        github_login, owner, repo,
                        memory_type="insight",
                        content=fact,
                    )

        logging.info(f"Extracted user memories for {github_login} on {owner}/{repo}")

    except Exception as e:
        logging.warning(f"Failed to extract user memories for {conv_id}: {e}")


async def cleanup_expired_memories() -> None:
    """Delete expired user memory entries. Called from background cleanup loop."""
    try:
        await delete_expired_memories()
    except Exception as e:
        logging.warning(f"Failed to cleanup expired memories: {e}")
