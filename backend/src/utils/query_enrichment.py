def enrich_query_with_history(
    query: str, history: list[tuple[str, str]], max_turns: int = 3,
) -> str:
    """Enrich a query with recent conversation context for better retrieval.

    Prepends the last few user queries and a snippet of the last assistant
    response so that follow-up questions like "how does it work?" retrieve
    chunks related to the ongoing topic.

    Args:
        query: The current user query.
        history: List of (user_query, assistant_response) tuples.
        max_turns: Maximum number of recent turns to include.

    Returns:
        Enriched query string for retrieval (not for display).
    """
    if not history:
        return query

    recent = history[-max_turns:]
    context_parts: list[str] = []

    for user_q, _ in recent:
        context_parts.append(user_q)

    # Add a snippet of the last assistant response for topic grounding
    if recent:
        last_response = recent[-1][1]
        context_parts.append(last_response[:200])

    context = " ".join(context_parts)
    return f"{context} {query}"
