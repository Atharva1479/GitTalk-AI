# CLAUDE.md

## Project Overview

GitTalk AI — a web app that lets users chat with any GitHub repository using natural language. Users paste a repo URL, the system ingests the codebase, and they can ask questions getting answers with file references, code snippets, and Mermaid diagrams.

## Architecture

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4 + Shadcn UI (deployed on Vercel)
- **Backend**: FastAPI + Python 3.13 + WebSockets (deployed via Docker)
- **LLM**: Google Gemini 2.5 Flash (streaming, with fallback key rotation)
- **Vector DB**: Pinecone Serverless (Gemini Embedding 001, 1024 dims)
- **Search**: Hybrid RAG — Vector + BM25 keyword search → RRF fusion → FlashRank reranking
- **Database**: SQLite via aiosqlite (conversations/messages)
- **Auth**: GitHub OAuth 2.0 + GitHub App (private repo support)
- **Caching**: File-based LRU in /tmp (6-hour TTL, max 100 repos)

## Project Structure

```
backend/src/
  main.py              # FastAPI app, WebSocket handler, OAuth endpoints, ConnectionManager
  utils/
    auth.py            # GitHub OAuth + App authentication
    cache.py           # LRU repo cache + chunk cache (file-based)
    chunker.py         # Language-aware code chunking (2500 chars, 300 overlap)
    db.py              # SQLite async conversation storage
    hybrid_search.py   # BM25 search + Reciprocal Rank Fusion
    ingest.py          # Repository ingestion via gitingest
    llm.py             # Gemini streaming with key rotation fallback
    prompt.py          # System prompt + 5 mode-specific instructions
    query_classifier.py # Broad vs specific query detection + mode augmentation
    query_enrichment.py # Conversation history enrichment (last 3 turns)
    rate_limit.py      # Per-IP sliding window rate limiter
    reranker.py        # FlashRank cross-encoder (MS Marco MiniLM)
    vectorstore.py     # Pinecone vector store operations

frontend/src/
  pages/               # LandingPage, Dashboard, AuthCallback
  components/
    Chat.tsx           # Main chat interface (largest component)
    ChatNavbar.tsx     # Chat header with repo info
    MarkdownCode.tsx   # Markdown rendering + Mermaid diagrams + syntax highlighting
    Navbar.tsx, Footer.tsx
    landing/           # HeroSection, FeaturesSection, HowItWorksSection, FAQ, Pricing, Testimonials
    ui/                # Shadcn UI components
  context/
    AuthContext.tsx     # GitHub auth state management
    WebSocketContext.tsx # WebSocket connection management
  App.tsx              # React Router (/, /dashboard, /auth/callback, /:owner/:repo)
  config.ts            # Environment-aware API URL config
```

## Development Commands

### Backend
```bash
cd backend
uv sync                                              # Install dependencies
uv run uvicorn src.main:app --reload --port 8000     # Start dev server
uv run pytest                                        # Run tests
uv run ruff check .                                  # Lint
uv run mypy .                                        # Type check
```

### Frontend
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Start dev server (port 5173)
npm run build        # Production build (tsc + vite)
npm run lint         # ESLint
```

## Key Conventions

- **Package manager**: `uv` for backend (Python), `npm` for frontend
- **Backend async**: All I/O is async (aiohttp, aiosqlite, async websockets)
- **WebSocket protocol**: Messages use prefixes like `chunk:`, `suggestions:`, `repo_processed`, `error:`
- **Analysis modes**: Prefixed as `[MODE:explain]`, `[MODE:bugs]`, `[MODE:refactor]`, `[MODE:security]`, `[MODE:document]`
- **Namespacing**: Pinecone uses `owner/repo` as namespace for isolation
- **Rate limits**: WebSocket 10/min, queries 30/hr, auth 20/min, repo fetch 15/min (per IP)
- **Repo size limit**: Repos over 750K tokens are rejected
- **Token budget**: Chunks capped at 400K characters before LLM prompt assembly
- **Test config**: pytest with `asyncio_mode = "strict"`, test files in `backend/tests/`

## Environment Variables

### Backend (`backend/.env`)
Required: `ENV`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`, `GITHUB_APP_SLUG`
Optional: `FALLBACK_COUNT`, `FALLBACK_1..N` (additional Gemini API keys)

### Frontend (`frontend/.env`)
Production: `VITE_API_URL` (WebSocket URL), `VITE_HTTP_API_URL` (HTTP URL)
Dev defaults: `ws://localhost:8000`, `http://localhost:8000`
