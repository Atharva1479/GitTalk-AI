from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse

from src.utils.db import init_db, save_conversation, save_message
from src.utils.cache import load_repo_cache, save_repo_cache, is_repo_indexed, save_chunk_cache, load_chunk_cache
from src.utils.ingest import ingest_repo, fetch_repo_metadata
from src.utils.llm import generate_response, generate_response_stream
from src.utils.prompt import generate_prompt
from src.utils.chunker import chunk_repo
from src.utils.vectorstore import (
    ensure_index_exists,
    check_namespace_exists,
    index_repo,
    query_similar,
)
from src.utils.reranker import rerank
from src.utils.hybrid_search import bm25_search, reciprocal_rank_fusion
from src.utils.query_classifier import get_retrieval_config, cap_chunks_by_token_budget, augment_query_for_mode
from src.utils.query_enrichment import enrich_query_with_history
from src.utils.auth import (
    exchange_code_for_token,
    get_github_user,
    get_user_repos,
    GITHUB_CLIENT_ID,
    GITHUB_REDIRECT_URI,
    GITHUB_APP_SLUG,
)
from src.utils.rate_limit import (
    ws_connect_limiter,
    chat_query_limiter,
    auth_limiter,
    repo_fetch_limiter,
)

from typing import Any
import re
import json
import time
from uuid import uuid4

import os
from dotenv import load_dotenv
import logging


load_dotenv()

IS_PROD = os.getenv("ENV") == "production"

MAX_QUERY_LENGTH = 10_000
MAX_HISTORY_LENGTH = 20
MAX_CONCURRENT_CONNECTIONS = 8


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle: runs rate-limit cleanup in background."""
    import asyncio

    async def cleanup_loop():
        while True:
            await asyncio.sleep(300)  # every 5 minutes
            ws_connect_limiter.cleanup()
            chat_query_limiter.cleanup()
            auth_limiter.cleanup()
            repo_fetch_limiter.cleanup()

    await init_db()
    try:
        ensure_index_exists()
    except Exception as e:
        logging.error(f"Failed to initialize Pinecone index: {e}")
    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()


app = FastAPI(
    title="GitTak AI",
    description="A simple chat app to interact with GitHub repositories",
    version="0.1.0",
    contact={"name": "Atharva Jamdar", "email": "atharvajamdar1810@gmail.com"},
    license_info={"name": "MIT License"},
    openapi_url=None if IS_PROD else "/openapi.json",
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None if IS_PROD else "/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://git-talk-ai.vercel.app"] if IS_PROD else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StructuredFormatter(logging.Formatter):
    """JSON log formatter for structured logging."""
    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "event": record.getMessage(),
        }
        if hasattr(record, "extra_fields"):
            log_entry.update(record.extra_fields)
        return json.dumps(log_entry)


def structured_log(level: int, event: str, **kwargs: Any) -> None:
    """Emit a structured log message with extra fields."""
    record = logging.LogRecord(
        name="ttg", level=level, pathname="", lineno=0,
        msg=event, args=(), exc_info=None,
    )
    record.extra_fields = kwargs  # type: ignore[attr-defined]
    logging.getLogger().handle(record)


handler = logging.StreamHandler()
handler.setFormatter(StructuredFormatter())
logging.root.handlers = [handler]
logging.root.setLevel(logging.INFO)


# ── OAuth endpoints ──────────────────────────────────────────────────────────


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, respecting X-Forwarded-For behind a proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.get("/auth/github")
async def github_auth(request: Request, install: bool = False):
    """Redirect to GitHub for auth. First-time users go to install page, returning users go to OAuth."""
    ip = get_client_ip(request)
    if not auth_limiter.is_allowed(ip):
        return JSONResponse(status_code=429, content={"error": "Too many requests. Please try again later."})
    if install:
        # First-time: install the app + select repos + authorize in one flow
        url = f"https://github.com/apps/{GITHUB_APP_SLUG}/installations/new"
    else:
        # Returning users: just re-authorize (skips the installation page)
        url = (
            f"https://github.com/login/oauth/authorize"
            f"?client_id={GITHUB_CLIENT_ID}"
            f"&redirect_uri={GITHUB_REDIRECT_URI}"
        )
    return RedirectResponse(url=url)


@app.get("/auth/github/callback")
async def github_auth_callback(request: Request, code: str | None = Query(None)):
    """Exchange the OAuth code for a token and return user info.
    After GitHub App installation, GitHub redirects here without a code —
    in that case, redirect the user to the OAuth authorize flow to get one."""
    ip = get_client_ip(request)
    if not auth_limiter.is_allowed(ip):
        return JSONResponse(status_code=429, content={"error": "Too many requests. Please try again later."})

    # After GitHub App installation, no code is provided — kick off OAuth
    if not code:
        oauth_url = (
            f"https://github.com/login/oauth/authorize"
            f"?client_id={GITHUB_CLIENT_ID}"
            f"&redirect_uri={GITHUB_REDIRECT_URI}"
        )
        return RedirectResponse(url=oauth_url)

    try:
        access_token = await exchange_code_for_token(code)
        user_info = await get_github_user(access_token)
        return JSONResponse(content=user_info)
    except ValueError as e:
        logging.error(f"OAuth callback error: {e}")
        return JSONResponse(
            status_code=400,
            content={"error": str(e)},
        )


@app.get("/auth/repos")
async def get_repos(request: Request, token: str = Query(...)):
    """Fetch repositories the user has granted access to via the GitHub App."""
    ip = get_client_ip(request)
    if not repo_fetch_limiter.is_allowed(ip):
        return JSONResponse(status_code=429, content={"error": "Too many requests. Please try again later."})
    try:
        repos = await get_user_repos(token)
        return JSONResponse(content=repos)
    except Exception as e:
        logging.error(f"Error fetching repos: {e}")
        return JSONResponse(
            status_code=400,
            content={"error": "Failed to fetch repositories"},
        )


# ── Helpers ──────────────────────────────────────────────────────────────────


def extract_suggestions(response: str) -> tuple[str, list[str]]:
    """Split response on ---SUGGESTIONS--- marker and parse numbered questions."""
    parts = response.split("---SUGGESTIONS---")
    if len(parts) < 2:
        return response, []
    clean = parts[0].rstrip()
    suggestion_lines = parts[1].strip().splitlines()
    suggestions = []
    for line in suggestion_lines:
        match = re.match(r"^\d+\.\s*(.+)$", line.strip())
        if match:
            suggestions.append(match.group(1).strip())
    return clean, suggestions[:3]


# ── Connection manager ───────────────────────────────────────────────────────


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, dict[str, Any]] = {}

    async def connect(
        self, websocket: WebSocket, client_id: str, owner: str, repo: str,
        github_token: str | None = None,
    ) -> None:
        await websocket.accept()

        # Cap concurrent connections to prevent memory exhaustion
        if len(self.active_connections) >= MAX_CONCURRENT_CONNECTIONS and client_id not in self.active_connections:
            await websocket.send_text("error:server_busy")
            await websocket.close()
            return

        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id]["websocket"].close()
            except Exception:
                pass
            del self.active_connections[client_id]

        repo_url = f"https://github.com/{owner}/{repo}"
        logging.info(f"Processing repo: {repo_url}...")

        # Try to load from cache first
        cached = load_repo_cache(owner, repo, github_token)
        metadata: dict = {}
        if cached:
            summary, tree, content = (
                cached["summary"],
                cached["tree"],
                cached["content"],
            )
            metadata = cached.get("metadata", {})
            source = "cache"
        else:
            try:
                await websocket.send_text("status:cloning")
                summary, tree, content = await ingest_repo(repo_url, github_token)
                source = "fresh"
                metadata = await fetch_repo_metadata(repo_url, github_token)
                save_repo_cache(owner, repo, summary, tree, content, github_token, metadata=metadata)
            except ValueError as e:
                error_msg = str(e)
                structured_log(logging.WARNING, "repo_ingest_failed",
                    owner=owner, repo=repo, error=error_msg)
                if error_msg in (
                    "error:repo_too_large",
                    "error:repo_not_found",
                    "error:repo_private",
                    "error:repo_not_installed",
                ):
                    await websocket.send_text(error_msg)
                else:
                    await websocket.send_text("error:repo_not_found")
                await websocket.close()
                return
            except Exception as e:
                structured_log(logging.ERROR, "repo_ingest_crash",
                    owner=owner, repo=repo, detail=str(e))
                await websocket.send_text("error:unexpected")
                await websocket.close()
                return

        # If cache didn't have metadata, fetch it now
        if not metadata:
            metadata = await fetch_repo_metadata(repo_url, github_token)

        request_id = uuid4().hex[:8]
        namespace = f"{owner}/{repo}"
        structured_log(logging.INFO, "repo_loaded",
            request_id=request_id, owner=owner, repo=repo, source=source)

        # Index into Pinecone if not already done
        already_indexed = is_repo_indexed(owner, repo, github_token) and check_namespace_exists(namespace)
        if not already_indexed:
            structured_log(logging.INFO, "indexing_start",
                request_id=request_id, namespace=namespace)
            try:
                # Try chunk cache first
                cached_chunks = load_chunk_cache(owner, repo, github_token)
                if cached_chunks:
                    from langchain_core.documents import Document as Doc
                    documents = [
                        Doc(page_content=c["page_content"], metadata=c["metadata"])
                        for c in cached_chunks
                    ]
                    structured_log(logging.INFO, "chunks_loaded_from_cache",
                        request_id=request_id, namespace=namespace,
                        chunk_count=len(documents))
                else:
                    await websocket.send_text("status:chunking")
                    documents = chunk_repo(content, namespace)
                    save_chunk_cache(owner, repo, [
                        {"page_content": d.page_content, "metadata": d.metadata}
                        for d in documents
                    ], github_token)

                await websocket.send_text("status:indexing")
                index_repo(namespace, documents)
                del documents  # Free memory immediately after indexing
                # Update cache with indexing status
                save_repo_cache(
                    owner, repo, summary, tree, content, github_token,
                    metadata=metadata,
                    pinecone_indexed=True,
                    pinecone_indexed_at=time.time(),
                )
                structured_log(logging.INFO, "indexing_complete",
                    request_id=request_id, namespace=namespace)
            except Exception as e:
                structured_log(logging.ERROR, "indexing_error",
                    request_id=request_id, namespace=namespace, detail=str(e))
                await websocket.send_text("error:indexing_failed")
                await websocket.close()
                return

        self.active_connections[client_id] = {
            "websocket": websocket,
            "history": [],
            "owner": owner,
            "repo": repo,
            "summary": summary,
            "tree": tree,
            "namespace": namespace,
            "request_id": request_id,
            "github_token": github_token,
        }

        await save_conversation(client_id, owner, repo)

        # Send metadata before confirmation
        if metadata:
            await websocket.send_text(f"metadata:{json.dumps(metadata)}")

        # Send confirmation that repo is processed
        await websocket.send_text("repo_processed")

    async def disconnect(self, client_id: str) -> None:
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id]["websocket"].close()
            except Exception:
                pass
            del self.active_connections[client_id]

    async def handle_message(self, client_id: str, text: str) -> None:
        if text == "ping":
            await self.active_connections[client_id]["websocket"].send_text("pong")
            return

        conn = self.active_connections[client_id]
        ws = conn["websocket"]
        rid = conn.get("request_id", "unknown")

        # Enforce query length limit
        raw_query = text[:MAX_QUERY_LENGTH]
        tree = conn["tree"]
        summary = conn.get("summary", "")
        namespace = conn["namespace"]
        history = conn["history"]

        # Parse [MODE:xxx] prefix
        mode: str | None = None
        mode_match = re.match(r"^\[MODE:(\w+)\]\s*", raw_query)
        if mode_match:
            mode = mode_match.group(1).lower()
            query = raw_query[mode_match.end():]
        else:
            query = raw_query

        structured_log(logging.INFO, "query_received",
            request_id=rid, query_length=len(query),
            mode=mode or "default")

        # RAG: classify → enrich → augment → hybrid retrieve → rerank → cap → prompt
        await ws.send_text("status:searching")

        # Load chunks from disk for BM25 (not kept in memory to save RAM)
        owner = conn["owner"]
        repo = conn["repo"]
        github_token = conn.get("github_token")
        cached_chunks = load_chunk_cache(owner, repo, github_token)
        if cached_chunks:
            from langchain_core.documents import Document as Doc
            all_documents = [
                Doc(page_content=c["page_content"], metadata=c["metadata"])
                for c in cached_chunks
            ]
        else:
            all_documents = []

        retrieval_config = get_retrieval_config(query)
        top_k = retrieval_config["top_k"]
        rerank_top_n = retrieval_config["rerank_top_n"]

        retrieval_query = enrich_query_with_history(query, history)
        retrieval_query = augment_query_for_mode(retrieval_query, mode)

        try:
            vector_results = await query_similar(namespace, retrieval_query, top_k=top_k)
            bm25_results = bm25_search(retrieval_query, all_documents, top_k=top_k)
            merged = reciprocal_rank_fusion(vector_results, bm25_results, top_n=top_k)

            reranked = rerank(query, merged, top_n=rerank_top_n)
            reranked = cap_chunks_by_token_budget(reranked)
        except Exception as e:
            structured_log(logging.ERROR, "retrieval_error",
                request_id=rid, detail=str(e))
            await ws.send_text("error:retrieval_failed")
            return

        await ws.send_text("status:thinking")

        prompt = await generate_prompt(query, history, tree, reranked, summary=summary, mode=mode)
        try:
            start = time.monotonic()
            full_response = ""

            async for chunk in generate_response_stream(prompt):
                # Stop streaming if we hit the suggestions marker
                if "---SUGGESTIONS---" in chunk:
                    before = chunk.split("---SUGGESTIONS---")[0]
                    full_response += before + "---SUGGESTIONS---" + chunk.split("---SUGGESTIONS---", 1)[1]
                    if before:
                        await ws.send_text(f"stream:chunk:{before}")
                    break
                full_response += chunk
                await ws.send_text(f"stream:chunk:{chunk}")

            await ws.send_text("stream:end")

            duration_ms = round((time.monotonic() - start) * 1000)
            clean_response, suggestions = extract_suggestions(full_response)

            structured_log(logging.INFO, "query_response",
                request_id=rid, duration_ms=duration_ms,
                prompt_tokens=0, response_tokens=0,
                response_length=len(clean_response))

            if suggestions:
                await ws.send_text(f"suggestions:{json.dumps(suggestions)}")

            # Keep history bounded
            conn["history"].append((query, clean_response))
            if len(conn["history"]) > MAX_HISTORY_LENGTH:
                conn["history"] = conn["history"][-MAX_HISTORY_LENGTH:]

            # Persist to SQLite
            await save_message(client_id, "user", query)
            await save_message(client_id, "assistant", clean_response)

        except TimeoutError:
            structured_log(logging.ERROR, "query_error",
                request_id=rid, error_type="timeout")
            await ws.send_text("error:timeout")
        except ValueError as e:
            if "OUT_OF_KEYS" in str(e):
                structured_log(logging.ERROR, "query_error",
                    request_id=rid, error_type="keys_exhausted")
                await ws.send_text("error:keys_exhausted")
            else:
                structured_log(logging.ERROR, "query_error",
                    request_id=rid, error_type="value_error", detail=str(e))
                await ws.send_text("error:generation_failed")
        except Exception as e:
            structured_log(logging.ERROR, "query_error",
                request_id=rid, error_type="unexpected", detail=str(e))
            await ws.send_text("error:generation_failed")


manager = ConnectionManager()


@app.websocket("/{owner}/{repo}/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket, owner: str, repo: str, client_id: str,
    token: str | None = Query(default=None),
) -> None:
    # Rate limit WebSocket connections per IP
    ip = websocket.client.host if websocket.client else "unknown"
    if not ws_connect_limiter.is_allowed(ip):
        await websocket.accept()
        await websocket.send_text("error:rate_limited")
        await websocket.close()
        logging.warning(f"Rate limited WebSocket connection from {ip}")
        return

    try:
        await manager.connect(websocket, client_id, owner, repo, github_token=token)

        conn = manager.active_connections.get(client_id)
        if not conn:
            # connect() failed and already closed the websocket
            return

        rid = conn["request_id"]
        structured_log(logging.INFO, "ws_connect",
            request_id=rid, owner=owner, repo=repo, ip=ip)

        while True:
            try:
                text = await websocket.receive_text()
                if text == "ping":
                    continue

                # Rate limit chat queries per IP
                if not chat_query_limiter.is_allowed(ip):
                    await websocket.send_text(
                        "You've reached the query limit (30/hour). Please wait before sending more messages."
                    )
                    continue

                await manager.handle_message(client_id, text)
            except WebSocketDisconnect:
                break
            except Exception as e:
                structured_log(logging.ERROR, "ws_error",
                    request_id=rid, detail=str(e))
                break

    except Exception as e:
        structured_log(logging.ERROR, "ws_connect_error",
            owner=owner, repo=repo, detail=str(e))
    finally:
        conn = manager.active_connections.get(client_id)
        rid = conn["request_id"] if conn else "unknown"
        structured_log(logging.INFO, "ws_disconnect", request_id=rid)
        await manager.disconnect(client_id)


@app.get("/healthcheck")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
