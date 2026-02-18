## What is GitTalk AI?

GitTalk AI lets you have natural conversations with any GitHub repository. Instead of digging through docs, searching files, or tracing code paths manually — just ask. The AI ingests the entire codebase, understands the architecture, and answers your questions with specific file references, code snippets, and diagrams.

**How it works:**

1. **Paste a GitHub URL** — any public repo, or connect GitHub for private repos
2. **AI analyzes the repo** — ingests code, builds embeddings, understands structure
3. **Start chatting** — ask anything in plain English, get expert-level answers

---

## Features

### Hybrid RAG Pipeline
Not just vector search. GitTalk AI combines **vector similarity search** (Pinecone + Gemini embeddings) with **BM25 keyword search** and merges results using **Reciprocal Rank Fusion**. This means exact matches (function names, error messages) and semantic matches both surface in results, then get **reranked by FlashRank** for relevance.

### Smart Query Classification
Ask *"what is this repo?"* and the system automatically retrieves 3x more chunks for a comprehensive overview. Ask a specific question and it stays focused. The retrieval pipeline adapts to what you're actually asking.

### Conversation-Aware Retrieval
Follow-up questions understand context. Ask about authentication, then ask *"how does it work?"* — the system enriches your query with conversation history so it retrieves auth-related chunks, not random ones.

### Analysis Modes
Five specialized modes with one click:

| Mode | What it does |
|------|-------------|
| **Explain** | Break down how code works, design patterns, architecture |
| **Find Bugs** | Identify edge cases, race conditions, unhandled errors |
| **Refactor** | Spot code smells, duplication, complexity issues |
| **Security** | OWASP-style vulnerability analysis |
| **Document** | Generate documentation for functions and modules |

### Rich Responses
- Markdown formatting with syntax-highlighted code blocks
- **Mermaid diagrams** for architecture and data flow questions
- Specific file path references linked to GitHub
- Follow-up suggestions after every answer

### Private Repository Support
Connect your GitHub account and select exactly which repos to share — like Vercel. GitTalk AI never accesses anything you haven't explicitly chosen.

### Share Conversations
Copy as Markdown or generate a compressed share link to send to teammates.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│         React 19 + TypeScript + Tailwind CSS            │
│              Vite · Shadcn UI · Radix                   │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                      Backend                            │
│                FastAPI + Python 3.13                     │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Ingest     │  │  Hybrid RAG  │  │  LLM Engine   │  │
│  │  gitingest  │  │  Vector+BM25 │  │  Gemini 2.5   │  │
│  │  Chunker    │  │  RRF Merge   │  │  Flash        │  │
│  │  Embeddings │  │  FlashRank   │  │               │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                │                   │          │
│  ┌──────▼──────┐  ┌──────▼───────┐  ┌───────▼───────┐  │
│  │  Pinecone   │  │  BM25 Index  │  │  SQLite       │  │
│  │  Vector DB  │  │  (in-memory) │  │  Conversations│  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### RAG Pipeline Flow

```
User Query
    │
    ├─ 1. Parse [MODE:xxx] prefix (if any)
    ├─ 2. Classify: broad vs specific → set retrieval config
    ├─ 3. Enrich with conversation history (last 3 turns)
    ├─ 4. Augment with mode-specific keywords
    │
    ├─ 5. Vector search (Pinecone) ──────────┐
    ├─ 6. BM25 keyword search (cached chunks) ┤
    │                                          │
    ├─ 7. Reciprocal Rank Fusion (merge) ◄─────┘
    ├─ 8. FlashRank reranking (original query)
    ├─ 9. Token budget cap
    │
    ├─ 10. Generate prompt (query + history + tree + chunks + mode)
    └─ 11. Gemini 2.5 Flash → Response + Suggestions
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS 4, Shadcn UI, Radix |
| **Backend** | FastAPI, Python 3.13, WebSockets, uv |
| **LLM** | Google Gemini 2.5 Flash |
| **Embeddings** | Gemini Embedding 001 (1024d) |
| **Vector DB** | Pinecone (serverless) |
| **Keyword Search** | BM25Okapi (rank-bm25) |
| **Reranking** | FlashRank (MS Marco MiniLM) |
| **Ingestion** | gitingest + LangChain text splitters |
| **Auth** | GitHub OAuth 2.0 + GitHub App |
| **Database** | SQLite (aiosqlite) |
| **Deployment** | Vercel (frontend) + Docker (backend) |

---

## Getting Started

### Prerequisites

- **Python 3.13+**
- **Node.js 18+**
- **uv** (Python package manager) — `pip install uv`
- API keys for: Gemini, Pinecone, GitHub OAuth

### 1. Clone the repository

```bash
git clone https://github.com/Atharva1479/GTA.git
cd GTA
```

### 2. Backend setup

```bash
cd backend

# Create .env file
cat > .env << 'EOF'
ENV=development
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=gta-repos
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=http://localhost:5173/auth/callback
GITHUB_APP_SLUG=your-github-app-slug
EOF

# Install dependencies
uv sync

# Run the server
uv run uvicorn src.main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

### 4. Try it out

1. Open `http://localhost:5173`
2. Paste any public GitHub repo URL (e.g., `https://github.com/fastapi/fastapi`)
3. Wait for processing to complete
4. Start asking questions!

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `ENV` | `development` or `production` | Yes |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `GEMINI_MODEL` | Model name (default: `gemini-2.5-flash`) | Yes |
| `PINECONE_API_KEY` | Pinecone vector database key | Yes |
| `PINECONE_INDEX_NAME` | Pinecone index name | Yes |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret | Yes |
| `GITHUB_REDIRECT_URI` | OAuth callback URL | Yes |
| `GITHUB_APP_SLUG` | GitHub App slug for installations | Yes |
| `FALLBACK_COUNT` | Number of fallback Gemini keys | No |
| `FALLBACK_1..N` | Additional Gemini API keys | No |

### Frontend (`frontend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | WebSocket backend URL | For production |
| `VITE_HTTP_API_URL` | HTTP backend URL | For production |

---

## Deployment

### Backend (Docker)

```bash
cd backend
docker build -t gittalk-backend .
docker run -p 8080:8080 --env-file .env gittalk-backend
```

### Frontend (Vercel)

The frontend is configured for Vercel deployment out of the box. Connect your GitHub repo to Vercel and it will auto-deploy.

---

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── main.py                 # FastAPI app, WebSocket handler, connection manager
│   │   └── utils/
│   │       ├── auth.py             # GitHub OAuth + App authentication
│   │       ├── cache.py            # LRU repo cache + chunk cache
│   │       ├── chunker.py          # Language-aware code chunking
│   │       ├── db.py               # SQLite conversation storage
│   │       ├── hybrid_search.py    # BM25 search + Reciprocal Rank Fusion
│   │       ├── ingest.py           # Repository ingestion via gitingest
│   │       ├── llm.py              # Gemini LLM with key rotation
│   │       ├── prompt.py           # Prompt engineering + mode instructions
│   │       ├── query_classifier.py # Broad/specific query detection + mode augmentation
│   │       ├── query_enrichment.py # Conversation history enrichment
│   │       ├── rate_limit.py       # Per-IP sliding window rate limiter
│   │       ├── reranker.py         # FlashRank cross-encoder reranking
│   │       └── vectorstore.py      # Pinecone vector store operations
│   ├── Dockerfile
│   └── pyproject.toml
│
├── frontend/
│   ├── src/
│   │   ├── pages/                  # Landing, Dashboard, AuthCallback
│   │   ├── components/             # Chat, Navbar, Footer, Landing sections
│   │   │   ├── landing/            # Hero, Features, HowItWorks, FAQ, Pricing
│   │   │   └── ui/                 # Shadcn UI components
│   │   ├── context/                # AuthContext, WebSocketContext
│   │   ├── App.tsx                 # Router
│   │   └── config.ts              # Environment config
│   ├── package.json
│   └── vercel.json
│
└── README.md
```

---

## Rate Limits

| Action | Limit |
|--------|-------|
| WebSocket connections | 10 per minute per IP |
| Chat queries | 30 per hour per IP |
| Auth requests | 20 per minute per IP |
| Repo fetches | 20 per minute per IP |

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Built by [Atharva Jamdar](https://github.com/Atharva1479)

If you find this useful, consider giving it a star!

</div>
