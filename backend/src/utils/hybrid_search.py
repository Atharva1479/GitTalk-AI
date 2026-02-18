import logging

from rank_bm25 import BM25Okapi  # type: ignore
from langchain_core.documents import Document


def bm25_search(query: str, documents: list[Document], top_k: int = 30) -> list[Document]:
    """Run BM25 keyword search over cached chunks.

    Args:
        query: The search query.
        documents: All cached Document chunks for the repo.
        top_k: Number of top results to return.

    Returns:
        Top-k documents ranked by BM25 score.
    """
    if not documents:
        return []

    tokenized_corpus = [doc.page_content.lower().split() for doc in documents]
    bm25 = BM25Okapi(tokenized_corpus)
    tokenized_query = query.lower().split()
    scores = bm25.get_scores(tokenized_query)

    # Get top_k indices sorted by score descending
    scored_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    top_indices = scored_indices[:top_k]

    results = [documents[i] for i in top_indices if scores[i] > 0]
    logging.info(f"BM25 returned {len(results)} results for query: '{query[:80]}...'")
    return results


def reciprocal_rank_fusion(
    vector_results: list[Document],
    bm25_results: list[Document],
    k: int = 60,
    top_n: int = 30,
) -> list[Document]:
    """Merge vector and BM25 results using Reciprocal Rank Fusion.

    Args:
        vector_results: Documents from vector similarity search.
        bm25_results: Documents from BM25 keyword search.
        k: RRF constant (higher = more weight to lower-ranked items).
        top_n: Number of merged results to return.

    Returns:
        Top-n documents sorted by fused RRF score, deduplicated.
    """
    rrf_scores: dict[str, float] = {}
    doc_map: dict[str, Document] = {}

    for rank, doc in enumerate(vector_results):
        key = doc.page_content
        rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (k + rank + 1)
        doc_map[key] = doc

    for rank, doc in enumerate(bm25_results):
        key = doc.page_content
        rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (k + rank + 1)
        if key not in doc_map:
            doc_map[key] = doc

    sorted_keys = sorted(rrf_scores, key=lambda x: rrf_scores[x], reverse=True)
    merged = [doc_map[key] for key in sorted_keys[:top_n]]

    logging.info(
        f"RRF merged {len(vector_results)} vector + {len(bm25_results)} BM25 "
        f"→ {len(merged)} results"
    )
    return merged
