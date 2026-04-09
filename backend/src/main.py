from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse

from src.utils.db import init_db, save_conversation, save_message, upsert_user
from src.utils.memory import (
    load_short_term_memory,
    load_long_term_context,
    summarize_conversation,
    extract_user_memories,
    cleanup_expired_memories,
)
from src.utils.cache import load_repo_cache, save_repo_cache, is_repo_indexed, save_chunk_cache, load_chunk_cache
from src.utils.ingest import ingest_repo, fetch_repo_metadata
from src.utils.llm import generate_response, generate_response_stream, generate_initial_suggestions
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
    store_user_token,
    GITHUB_CLIENT_ID,
    GITHUB_REDIRECT_URI,
    GITHUB_APP_SLUG,
)
from src.utils.session import (
    generate_csrf_state,
    validate_csrf_state,
    create_session_token,
    get_session_from_cookie,
    build_session_cookie,
    build_clear_cookie,
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
            await cleanup_expired_memories()

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
    allow_origins=["https://git-talk-ai.vercel.app"] if IS_PROD else ["http://localhost:5173", "http://127.0.0.1:5173"],
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
    """Redirect to GitHub for auth with CSRF state parameter."""
    ip = get_client_ip(request)
    if not auth_limiter.is_allowed(ip):
        return JSONResponse(status_code=429, content={"error": "Too many requests. Please try again later."})

    state = generate_csrf_state()

    if install:
        url = f"https://github.com/apps/{GITHUB_APP_SLUG}/installations/new?state={state}"
    else:
        url = (
            f"https://github.com/login/oauth/authorize"
            f"?client_id={GITHUB_CLIENT_ID}"
            f"&redirect_uri={GITHUB_REDIRECT_URI}"
            f"&state={state}"
        )
    return RedirectResponse(url=url)


@app.get("/auth/github/callback")
async def github_auth_callback(
    request: Request,
    code: str | None = Query(None),
    state: str | None = Query(None),
):
    """Exchange the OAuth code for a token, set httpOnly session cookie."""
    ip = get_client_ip(request)
    if not auth_limiter.is_allowed(ip):
        return JSONResponse(status_code=429, content={"error": "Too many requests. Please try again later."})

    # After GitHub App installation, no code is provided — kick off OAuth
    if not code:
        new_state = generate_csrf_state()
        oauth_url = (
            f"https://github.com/login/oauth/authorize"
            f"?client_id={GITHUB_CLIENT_ID}"
            f"&redirect_uri={GITHUB_REDIRECT_URI}"
            f"&state={new_state}"
        )
        return RedirectResponse(url=oauth_url)

    # Validate CSRF state (skip validation if state is None — GitHub App install flow doesn't always pass it back)
    if state and not validate_csrf_state(state):
        logging.warning(f"Invalid CSRF state from {ip}")
        return JSONResponse(status_code=400, content={"error": "Invalid state parameter. Please try again."})

    try:
        access_token = await exchange_code_for_token(code)
        user_info = await get_github_user(access_token)
        login = user_info["login"]
        avatar_url = user_info["avatar_url"]

        # Store token hash server-side
        await store_user_token(login, avatar_url, access_token)

        # Create signed session JWT
        session_token = create_session_token(login, avatar_url)

        # Return user info + set httpOnly session cookie
        response = JSONResponse(content={
            "login": login,
            "avatar_url": avatar_url,
            "access_token": access_token,  # Still returned for backward compat (WebSocket, repo fetches)
            "session_token": session_token,  # Frontend can optionally use this
        })
        response.headers["Set-Cookie"] = build_session_cookie(session_token, IS_PROD)
        return response
    except ValueError as e:
        logging.error(f"OAuth callback error: {e}")
        return JSONResponse(
            status_code=400,
            content={"error": str(e)},
        )


@app.post("/auth/logout")
async def auth_logout():
    """Clear the session cookie."""
    response = JSONResponse(content={"status": "ok"})
    response.headers["Set-Cookie"] = build_clear_cookie(IS_PROD)
    return response


@app.get("/auth/session")
async def auth_session(request: Request):
    """Verify the session cookie and return user info. Used for session restore."""
    cookie = request.headers.get("cookie")
    session = get_session_from_cookie(cookie)
    if not session:
        return JSONResponse(status_code=401, content={"error": "No valid session"})
    return JSONResponse(content={
        "login": session["sub"],
        "avatar_url": session.get("avatar_url", ""),
    })


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


# ── User memory & preferences endpoints ─────────────────────────────────────


async def _verify_user(request: Request) -> str:
    """Verify user identity from session cookie or Authorization header."""
    # Try session cookie first (more secure, httpOnly)
    cookie = request.headers.get("cookie")
    session = get_session_from_cookie(cookie)
    if session:
        return session["sub"]

    # Fallback to Authorization header (backward compat)
    auth = request.headers.get("Authorization", "")
    token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else ""
    if not token:
        raise ValueError("Missing authentication")
    user = await get_github_user(token)
    return user["login"]


@app.get("/api/user/preferences")
async def get_preferences(request: Request) -> JSONResponse:
    """Get user preferences and settings."""
    try:
        login = await _verify_user(request)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    from src.utils.db import get_user_settings
    prefs = await get_user_settings(login)
    return JSONResponse(content=prefs)


@app.put("/api/user/preferences")
async def update_preferences(request: Request) -> JSONResponse:
    """Update user preferences."""
    try:
        login = await _verify_user(request)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    body = await request.json()
    from src.utils.db import update_user_settings
    await update_user_settings(
        login,
        preferred_mode=body.get("preferred_mode"),
        settings_json=json.dumps(body.get("settings", {})) if "settings" in body else None,
    )
    return JSONResponse(content={"status": "ok"})


@app.get("/api/user/conversations")
async def get_conversations(request: Request) -> JSONResponse:
    """Get a user's past conversations with summaries."""
    try:
        login = await _verify_user(request)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    from src.utils.db import get_user_conversations
    convs = await get_user_conversations(login)
    return JSONResponse(content={"conversations": convs})


@app.get("/api/conversations/{conv_id}/messages")
async def get_messages(
    request: Request, conv_id: str,
    owner: str | None = Query(default=None),
    repo: str | None = Query(default=None),
) -> JSONResponse:
    """Get messages for a conversation. Falls back to all repo messages if conv is empty."""
    try:
        login = await _verify_user(request)
    except Exception as e:
        logging.warning(f"Auth failed for messages endpoint: {e}")
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    from src.utils.db import get_conversation_messages, get_all_repo_messages, DATABASE_PATH
    import aiosqlite

    # Try specific conversation first
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            "SELECT github_login, owner, repo FROM conversations WHERE id = ?", (conv_id,)
        )
        row = await cursor.fetchone()

    if row:
        db_login = row[0] or ""
        if db_login.lower() == login.lower():
            messages = await get_conversation_messages(conv_id)
            if messages:
                return JSONResponse(content={
                    "messages": [{"role": r, "content": c} for r, c in messages]
                })
            # Conversation exists but empty — fallback to all repo messages
            conv_owner, conv_repo = row[1], row[2]
            all_msgs = await get_all_repo_messages(login, conv_owner, conv_repo)
            if all_msgs:
                return JSONResponse(content={
                    "messages": [{"role": r, "content": c} for r, c in all_msgs]
                })

    # Conversation not found or not owned — try owner/repo params as fallback
    if owner and repo:
        all_msgs = await get_all_repo_messages(login, owner, repo)
        if all_msgs:
            return JSONResponse(content={
                "messages": [{"role": r, "content": c} for r, c in all_msgs]
            })

    return JSONResponse(content={"messages": []})


@app.delete("/api/user/memory")
async def clear_memory(request: Request) -> JSONResponse:
    """Clear all long-term memory for a user."""
    try:
        login = await _verify_user(request)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    from src.utils.db import clear_user_memory
    await clear_user_memory(login)
    return JSONResponse(content={"status": "ok"})


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
        github_login: str | None = None,
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

        # Upsert user if authenticated
        if github_login:
            try:
                await upsert_user(github_login, "")
            except Exception:
                pass

        # Restore short-term memory from SQLite (survives reconnects)
        restored_history = await load_short_term_memory(client_id)

        # Load long-term context for authenticated users
        long_term_context = ""
        if github_login:
            try:
                long_term_context = await load_long_term_context(github_login, owner, repo)
            except Exception:
                pass

        self.active_connections[client_id] = {
            "websocket": websocket,
            "history": restored_history if restored_history else [],
            "owner": owner,
            "repo": repo,
            "summary": summary,
            "tree": tree,
            "namespace": namespace,
            "request_id": request_id,
            "github_token": github_token,
            "github_login": github_login,
            "long_term_context": long_term_context,
        }

        await save_conversation(client_id, owner, repo, github_login=github_login)

        # Send metadata before confirmation
        if metadata:
            await websocket.send_text(f"metadata:{json.dumps(metadata)}")

        # Send confirmation that repo is processed
        await websocket.send_text("repo_processed")

        # Generate and send initial starter questions for the repo
        try:
            initial_suggestions = await generate_initial_suggestions(summary, tree)
            if initial_suggestions:
                await websocket.send_text(f"suggestions:{json.dumps(initial_suggestions)}")
        except Exception as e:
            structured_log(logging.WARNING, "initial_suggestions_failed",
                request_id=request_id, detail=str(e))
            # Reset key manager if exhausted, so user queries still work
            if "RESOURCE_EXHAUSTED" in str(e) or "OUT_OF_KEYS" in str(e):
                from src.utils.llm import key_manager
                key_manager.reset()

    async def disconnect(self, client_id: str) -> None:
        if client_id in self.active_connections:
            conn = self.active_connections[client_id]
            github_login = conn.get("github_login")
            history = conn.get("history", [])
            owner = conn.get("owner", "")
            repo = conn.get("repo", "")

            # Fire background summarization for authenticated users with real conversations
            if github_login and len(history) >= 3:
                import asyncio as _asyncio
                _asyncio.create_task(summarize_conversation(client_id, github_login, owner, repo))
                _asyncio.create_task(extract_user_memories(client_id, github_login, owner, repo))

            try:
                await conn["websocket"].close()
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

            reranked = await rerank(query, merged, top_n=rerank_top_n)
            reranked = cap_chunks_by_token_budget(reranked)
        except Exception as e:
            structured_log(logging.ERROR, "retrieval_error",
                request_id=rid, detail=str(e))
            await ws.send_text("error:retrieval_failed")
            return

        await ws.send_text("status:thinking")

        # Cap prompt history to last 10 turns to prevent context window overflow
        prompt_history = history[-10:]
        prompt = await generate_prompt(
            query, prompt_history, tree, reranked, summary=summary, mode=mode,
            long_term_context=conn.get("long_term_context"),
        )
        try:
            start = time.monotonic()
            full_response = ""
            MARKER = "---SUGGESTIONS---"
            buffer = ""  # Buffer to catch marker split across chunks

            marker_found = False

            async for chunk in generate_response_stream(prompt):
                if marker_found:
                    # After marker: keep collecting for suggestions, don't stream to client
                    full_response += chunk
                    continue

                buffer += chunk

                # Check if marker is fully present in buffer
                if MARKER in buffer:
                    before, after = buffer.split(MARKER, 1)
                    full_response += before + MARKER + after
                    if before:
                        await ws.send_text(f"stream:chunk:{before}")
                    marker_found = True
                    continue

                # Only stream content we're sure doesn't contain the start of the marker
                # Keep last len(MARKER)-1 chars in buffer to catch split markers
                safe_len = len(buffer) - len(MARKER) + 1
                if safe_len > 0:
                    safe = buffer[:safe_len]
                    buffer = buffer[safe_len:]
                    full_response += safe
                    await ws.send_text(f"stream:chunk:{safe}")

            # If loop ended without finding marker, flush remaining buffer
            if not marker_found and buffer:
                full_response += buffer
                await ws.send_text(f"stream:chunk:{buffer}")

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
            error_str = str(e)
            structured_log(logging.ERROR, "query_error",
                request_id=rid, error_type="unexpected", detail=error_str)
            if "RESOURCE_EXHAUSTED" in error_str or "429" in error_str or "quota" in error_str.lower():
                await ws.send_text("error:keys_exhausted")
            else:
                await ws.send_text("error:generation_failed")


manager = ConnectionManager()


@app.websocket("/{owner}/{repo}/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket, owner: str, repo: str, client_id: str,
    token: str | None = Query(default=None),
    github_login: str | None = Query(default=None),
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
        await manager.connect(websocket, client_id, owner, repo, github_token=token, github_login=github_login)

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

                # Send remaining rate limit count to frontend
                remaining = chat_query_limiter.remaining(ip)
                await websocket.send_text(f"rate_limit:{remaining}")
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
