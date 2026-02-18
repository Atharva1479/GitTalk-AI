import logging

from flashrank import Ranker, RerankRequest  # type: ignore
from langchain_core.documents import Document

FLASHRANK_MODEL = "ms-marco-MiniLM-L-12-v2"
FLASHRANK_CACHE_DIR = "/tmp/flashrank_cache"

_ranker: Ranker | None = None


def _get_ranker() -> Ranker:
    """Lazy-load singleton FlashRank ranker."""
    global _ranker
    if _ranker is None:
        logging.info(f"Loading FlashRank model '{FLASHRANK_MODEL}'...")
        _ranker = Ranker(
            model_name=FLASHRANK_MODEL,
            cache_dir=FLASHRANK_CACHE_DIR,
        )
        logging.info("FlashRank model loaded.")
    return _ranker


def rerank(query: str, documents: list[Document], top_n: int = 5) -> list[Document]:
    """Rerank documents using FlashRank and return the top_n most relevant.

    Args:
        query: The user's search query.
        documents: List of LangChain Documents from vector similarity search.
        top_n: Number of top results to return.

    Returns:
        Top-n reranked Document objects.
    """
    if not documents:
        return []

    ranker = _get_ranker()

    # FlashRank expects list of dicts with "text" key
    passages = [
        {"id": i, "text": doc.page_content}
        for i, doc in enumerate(documents)
    ]

    rerank_request = RerankRequest(query=query, passages=passages)
    results = ranker.rerank(rerank_request)

    # Map back to LangChain Documents, sorted by score descending
    reranked: list[Document] = []
    for result in results[:top_n]:
        idx = result["id"]
        reranked.append(documents[idx])

    logging.info(
        f"Reranked {len(documents)} docs to top {len(reranked)} for query: "
        f"'{query[:80]}...'"
    )
    return reranked
