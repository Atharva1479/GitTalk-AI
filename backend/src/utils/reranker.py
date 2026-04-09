import os
import logging
import aiohttp

from langchain_core.documents import Document

JINA_API_KEY = os.getenv("JINA_API_KEY", "")
JINA_RERANK_URL = "https://api.jina.ai/v1/rerank"
JINA_RERANK_MODEL = "jina-reranker-v2-base-multilingual"


async def rerank(query: str, documents: list[Document], top_n: int = 5) -> list[Document]:
    """Rerank documents using Jina AI Reranker API and return the top_n most relevant.

    Args:
        query: The user's search query.
        documents: List of LangChain Documents from vector similarity search.
        top_n: Number of top results to return.

    Returns:
        Top-n reranked Document objects.
    """
    if not documents:
        return []

    if not JINA_API_KEY:
        logging.warning("JINA_API_KEY not set, skipping reranking")
        return documents[:top_n]

    # Prepare documents for Jina API
    texts = [doc.page_content for doc in documents]

    payload = {
        "model": JINA_RERANK_MODEL,
        "query": query,
        "documents": texts,
        "top_n": top_n,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                JINA_RERANK_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {JINA_API_KEY}",
                    "Content-Type": "application/json",
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logging.warning(f"Jina rerank API error ({response.status}): {error_text[:200]}")
                    return documents[:top_n]

                data = await response.json()

        # Map results back to LangChain Documents
        reranked: list[Document] = []
        for result in data.get("results", []):
            idx = result["index"]
            reranked.append(documents[idx])

        logging.info(
            f"Reranked {len(documents)} docs to top {len(reranked)} for query: "
            f"'{query[:80]}...'"
        )
        return reranked

    except Exception as e:
        logging.warning(f"Jina rerank failed, falling back to top-n: {e}")
        return documents[:top_n]
