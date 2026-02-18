import re

from langchain_core.documents import Document

BROAD_QUERY_PATTERNS = re.compile(
    r"\b("
    r"what is this repo|what does this repo|what is this project|what does this project"
    r"|overview|architecture|summary|summarize|explain the project|explain this project"
    r"|how is .* structured|project structure|codebase overview|high.?level"
    r"|tell me about|describe .* repo|describe .* project|walk me through"
    r"|what are the main|give me an overview|big picture"
    r")\b",
    re.IGNORECASE,
)

BROAD_RETRIEVAL_CONFIG = {"top_k": 100, "rerank_top_n": 30}
NORMAL_RETRIEVAL_CONFIG = {"top_k": 30, "rerank_top_n": 10}

MODE_QUERY_AUGMENTS: dict[str, str] = {
    "explain": "explanation purpose design pattern architecture",
    "bugs": "bug error exception edge case validation race condition",
    "refactor": "refactor code smell duplication complexity coupling",
    "security": "security vulnerability injection authentication authorization",
    "document": "documentation API interface parameter return type",
}


def is_broad_query(query: str) -> bool:
    """Check if the query is a broad/overview question needing more context."""
    return bool(BROAD_QUERY_PATTERNS.search(query))


def get_retrieval_config(query: str) -> dict[str, int]:
    """Return retrieval config based on query type."""
    if is_broad_query(query):
        return BROAD_RETRIEVAL_CONFIG
    return NORMAL_RETRIEVAL_CONFIG


def cap_chunks_by_token_budget(chunks: list[Document], max_chars: int = 400_000) -> list[Document]:
    """Trim chunks to stay within a character budget to prevent exceeding context window."""
    total = 0
    capped: list[Document] = []
    for chunk in chunks:
        total += len(chunk.page_content)
        if total > max_chars:
            break
        capped.append(chunk)
    return capped


def augment_query_for_mode(query: str, mode: str | None) -> str:
    """Append mode-specific keywords to the retrieval query."""
    if mode and mode in MODE_QUERY_AUGMENTS:
        return f"{query} {MODE_QUERY_AUGMENTS[mode]}"
    return query
