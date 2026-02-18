import os
import json
import time
import hashlib
import logging
from typing import Any

CACHE_DIR = "/tmp/repo_cache"
CHUNK_CACHE_DIR = "/tmp/repo_chunks"
CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours
CACHE_MAX_FILES = 100


def _enforce_lru_cache_limit():
    """Remove oldest cache files when exceeding the max file limit."""
    try:
        files = [
            (f, os.path.getatime(os.path.join(CACHE_DIR, f)))
            for f in os.listdir(CACHE_DIR)
            if f.endswith(".json")
        ]
        if len(files) > CACHE_MAX_FILES:
            files.sort(key=lambda x: x[1])  # Oldest access time first
            for f, _ in files[: len(files) - CACHE_MAX_FILES]:
                os.remove(os.path.join(CACHE_DIR, f))
    except OSError as e:
        logging.warning(f"Error enforcing cache limit: {e}")


def get_cache_path(owner: str, repo: str, github_token: str | None = None) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    if github_token:
        token_hash = hashlib.sha256(github_token.encode()).hexdigest()[:12]
        return os.path.join(CACHE_DIR, f"{owner}_{repo}_{token_hash}.json")
    return os.path.join(CACHE_DIR, f"{owner}_{repo}.json")


def load_repo_cache(owner: str, repo: str, github_token: str | None = None) -> dict[str, Any] | None:
    """Load a cached repo if it exists and hasn't expired."""
    path = get_cache_path(owner, repo, github_token)
    try:
        if os.path.exists(path):
            os.utime(path, None)  # Update access time for LRU
            with open(path, "r") as f:
                data = json.load(f)
                cached_at = data.get("cached_at", 0)
                if time.time() - cached_at < CACHE_TTL_SECONDS:
                    return data
    except (json.JSONDecodeError, OSError) as e:
        logging.warning(f"Error loading cache for {owner}/{repo}: {e}")
    return None


def save_repo_cache(
    owner: str, repo: str, summary: Any, tree: Any, content: Any,
    github_token: str | None = None,
    metadata: dict[str, Any] | None = None,
    pinecone_indexed: bool = False,
    pinecone_indexed_at: float | None = None,
) -> None:
    """Save repo data to cache."""
    path = get_cache_path(owner, repo, github_token)
    try:
        data = {
            "summary": summary,
            "tree": tree,
            "content": content,
            "cached_at": time.time(),
            "pinecone_indexed": pinecone_indexed,
            "pinecone_indexed_at": pinecone_indexed_at,
        }
        if metadata:
            data["metadata"] = metadata
        with open(path, "w") as f:
            json.dump(data, f)
        _enforce_lru_cache_limit()
    except OSError as e:
        logging.warning(f"Error saving cache for {owner}/{repo}: {e}")


def _get_chunk_cache_path(owner: str, repo: str, github_token: str | None = None) -> str:
    os.makedirs(CHUNK_CACHE_DIR, exist_ok=True)
    if github_token:
        token_hash = hashlib.sha256(github_token.encode()).hexdigest()[:12]
        return os.path.join(CHUNK_CACHE_DIR, f"{owner}_{repo}_{token_hash}.json")
    return os.path.join(CHUNK_CACHE_DIR, f"{owner}_{repo}.json")


def save_chunk_cache(
    owner: str, repo: str, documents: list[dict[str, Any]], github_token: str | None = None,
) -> None:
    """Save chunked documents to local cache as JSON."""
    path = _get_chunk_cache_path(owner, repo, github_token)
    try:
        data = {
            "chunks": [
                {"page_content": doc["page_content"], "metadata": doc["metadata"]}
                for doc in documents
            ],
            "cached_at": time.time(),
        }
        with open(path, "w") as f:
            json.dump(data, f)
        logging.info(f"Saved {len(documents)} chunks to cache for {owner}/{repo}")
    except OSError as e:
        logging.warning(f"Error saving chunk cache for {owner}/{repo}: {e}")


def load_chunk_cache(
    owner: str, repo: str, github_token: str | None = None,
) -> list[dict[str, Any]] | None:
    """Load cached chunks if they exist and are newer than the repo cache."""
    chunk_path = _get_chunk_cache_path(owner, repo, github_token)
    repo_path = get_cache_path(owner, repo, github_token)
    try:
        if not os.path.exists(chunk_path):
            return None
        with open(chunk_path, "r") as f:
            data = json.load(f)
        chunk_ts = data.get("cached_at", 0)
        # Invalidate if repo cache is newer (fresh ingest happened)
        if os.path.exists(repo_path):
            with open(repo_path, "r") as f:
                repo_data = json.load(f)
            repo_ts = repo_data.get("cached_at", 0)
            if repo_ts > chunk_ts:
                logging.info(f"Chunk cache stale for {owner}/{repo}, repo cache is newer")
                return None
        chunks = data.get("chunks", [])
        logging.info(f"Loaded {len(chunks)} chunks from cache for {owner}/{repo}")
        return chunks
    except (json.JSONDecodeError, OSError) as e:
        logging.warning(f"Error loading chunk cache for {owner}/{repo}: {e}")
        return None


def is_repo_indexed(owner: str, repo: str, github_token: str | None = None) -> bool:
    """Check if the repo has been indexed to Pinecone within the cache TTL."""
    cached = load_repo_cache(owner, repo, github_token)
    if cached and cached.get("pinecone_indexed"):
        indexed_at = cached.get("pinecone_indexed_at", 0)
        if time.time() - indexed_at < CACHE_TTL_SECONDS:
            return True
    return False
