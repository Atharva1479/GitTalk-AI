<!-- Hero Banner -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0d1117,50:7c3aed,100:3b82f6&height=220&section=header&text=GitTalk%20AI&fontSize=50&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=Chat%20with%20any%20GitHub%20repository%20using%20natural%20language&descSize=18&descAlignY=55&descAlign=50" width="100%" />

<div align="center">

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Pinecone](https://img.shields.io/badge/Pinecone-Serverless-000?style=flat&logo=pinecone&logoColor=white)](https://pinecone.io)


**Paste a repo URL. Ask questions. Get answers with file references, code snippets, and diagrams.**

Public repos. Private repos. Any language. In seconds, not hours.

[Try it Live](https://git-talk-ai.vercel.app) &bull; [Report Bug](https://github.com/Atharva1479/GitTalk-AI/issues) &bull; [Request Feature](https://github.com/Atharva1479/GitTalk-AI/issues)

</div>

---

<div align="center">

### How It Works

**Paste a GitHub URL** &rarr; **AI analyzes the codebase** &rarr; **Start chatting**

</div>

---

## What is GitTalk AI?

GitTalk AI is a full-stack **Retrieval-Augmented Generation (RAG)** application that lets you have natural conversations with any GitHub repository — public or private.

Instead of spending hours reading through unfamiliar codebases, tracing code paths, or searching for how things connect — just paste a repo URL and ask questions in plain English. The AI ingests the entire codebase, builds a searchable knowledge base, and answers with specific file references, code snippets, and architecture diagrams.

<table>
<tr>
<td width="50%">

**For Developers**
- Understand any codebase in minutes, not days
- Ask about architecture, find bugs, generate docs
- Follow-up questions actually understand context
- Works with 14+ programming languages

</td>
<td width="50%">

**For Teams**
- Onboard to new repos instantly
- Share conversations with teammates
- Private repo support — you choose which repos to share
- Persistent memory across sessions

</td>
</tr>
</table>

---

## Features

<table>
<tr>
<td align="center" width="33%">

**Hybrid RAG Pipeline**

Vector search (Pinecone + Jina AI) combined with BM25 keyword search, merged via Reciprocal Rank Fusion, reranked by Jina Reranker

</td>
<td align="center" width="33%">

**Smart Query Classification**

Broad questions get 3x more context automatically. Specific questions stay focused. The retrieval adapts to you.

</td>
<td align="center" width="33%">

**Conversation Memory**

Short-term memory survives refreshes. Long-term memory summarizes past sessions. The AI remembers what you explored.

</td>
</tr>
<tr>
<td align="center" width="33%">

**5 Analysis Modes**

Explain &bull; Find Bugs &bull; Refactor &bull; Security Review &bull; Documentation — each with mode-specific retrieval augmentation

</td>
<td align="center" width="33%">

**Rich Responses**

Syntax-highlighted code, Mermaid diagrams (downloadable SVG), file references linked to GitHub, follow-up suggestions

</td>
<td align="center" width="33%">

**Private Repos**

Connect GitHub, select exactly which repos to share — like Vercel. We never access anything you haven't chosen.

</td>
</tr>
</table>

### More Features

- **Conversation-aware retrieval** — follow-up questions enriched with history for better context
- **Language-aware chunking** — respects syntax boundaries for 14+ programming languages
- **Real-time streaming** — responses stream token-by-token over WebSocket
- **Edit & rerun messages** — modify any question and regenerate the answer
- **Share conversations** — copy as Markdown or generate compressed share links
- **Rate limit visibility** — see remaining queries in the UI
- **Keyboard shortcuts** — Cmd+Enter to send, / to focus, Esc to close

---

## Architecture

```
                         ┌──────────────────────────────┐
                         │     Frontend (React 19)      │
                         │  TypeScript + Tailwind CSS 4  │
                         │     Vite + Shadcn UI         │
                         └──────────────┬───────────────┘
                                        │ WebSocket
                         ┌──────────────▼───────────────┐
                         │    Backend (FastAPI 3.13)     │
                         │                              │
                         │  ┌────────┐  ┌────────────┐  │
                         │  │ Ingest │  │ Hybrid RAG │  │
                         │  │ Jina AI│  │ Vec + BM25 │  │
                         │  │ Chunk  │  │ RRF + Rank │  │
                         │  └───┬────┘  └─────┬──────┘  │
                         │      │             │         │
                         │  ┌───▼───┐   ┌─────▼──────┐  │
                         │  │Pinecone│  │  Gemini    │  │
                         │  │Vec DB │  │  2.5 Flash  │  │
                         │  └───────┘  └────────────┘  │
                         │        ┌──────────┐         │
                         │        │  SQLite  │         │
                         │        │ Memory+DB│         │
                         │        └──────────┘         │
                         └──────────────────────────────┘
```

### RAG Pipeline — 12-Stage Flow

```
User Query
    │
    ├── 1.  Parse [MODE:xxx] prefix
    ├── 2.  Classify query (broad vs specific)
    ├── 3.  Enrich with conversation history (last 3 turns)
    ├── 4.  Augment with mode-specific keywords
    │
    ├── 5.  Vector search (Pinecone + Jina AI) ────┐
    ├── 6.  BM25 keyword search ───────────────────┤
    │                                               │
    ├── 7.  Reciprocal Rank Fusion (merge) ◄────────┘
    ├── 8.  Jina AI Reranker (API-based reranking)
    ├── 9.  Token budget cap (400K chars)
    │
    ├── 10. Load long-term memory context
    ├── 11. Build prompt (query + history + tree + chunks + memory + mode)
    └── 12. Gemini 2.5 Flash → Streaming Response + Suggestions
```

---

## Tech Stack

<table>
<tr><td><b>Layer</b></td><td><b>Technology</b></td></tr>
<tr><td>Frontend</td><td><img src="https://img.shields.io/badge/-React%2019-61DAFB?style=flat-square&logo=react&logoColor=black"/> <img src="https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white"/> <img src="https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=vite&logoColor=white"/> <img src="https://img.shields.io/badge/-Tailwind%20CSS%204-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white"/> <img src="https://img.shields.io/badge/-Shadcn%20UI-000?style=flat-square&logo=shadcnui&logoColor=white"/></td></tr>
<tr><td>Backend</td><td><img src="https://img.shields.io/badge/-FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white"/> <img src="https://img.shields.io/badge/-Python%203.13-3776AB?style=flat-square&logo=python&logoColor=white"/> <img src="https://img.shields.io/badge/-WebSockets-010101?style=flat-square&logo=socketdotio&logoColor=white"/></td></tr>
<tr><td>LLM</td><td><img src="https://img.shields.io/badge/-Gemini%202.5%20Flash-4285F4?style=flat-square&logo=google&logoColor=white"/> (streaming + key rotation)</td></tr>
<tr><td>Embeddings</td><td><img src="https://img.shields.io/badge/-Jina%20AI%20v3-FF6F00?style=flat-square"/> (1024d, code-optimized)</td></tr>
<tr><td>Vector DB</td><td><img src="https://img.shields.io/badge/-Pinecone-000?style=flat-square&logo=pinecone&logoColor=white"/> (serverless)</td></tr>
<tr><td>Search</td><td>BM25 + Reciprocal Rank Fusion + Jina Reranker reranking</td></tr>
<tr><td>Auth</td><td><img src="https://img.shields.io/badge/-GitHub%20OAuth-181717?style=flat-square&logo=github&logoColor=white"/> + httpOnly cookies + CSRF</td></tr>
<tr><td>Database</td><td><img src="https://img.shields.io/badge/-SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white"/> (async) — conversations, memory, users</td></tr>
<tr><td>Deploy</td><td><img src="https://img.shields.io/badge/-Vercel-000?style=flat-square&logo=vercel&logoColor=white"/> (frontend) + <img src="https://img.shields.io/badge/-Docker-2496ED?style=flat-square&logo=docker&logoColor=white"/> (backend)</td></tr>
</table>

---

## Memory System

<table>
<tr>
<td width="50%">

**Short-Term Memory**
- Persists across page refreshes and reconnects
- Last 3 turns enriched into retrieval queries
- Last 10 turns in LLM prompt for context
- Backed by SQLite — survives server restarts

</td>
<td width="50%">

**Long-Term Memory**
- AI summarizes conversations on disconnect
- Extracts user preferences and interests
- Injected as "User Context" in future prompts
- Remembers what you explored across sessions

</td>
</tr>
</table>

---

## Quick Start

### Prerequisites

- **Python 3.13+** &bull; **Node.js 18+** &bull; **uv** (`pip install uv`)
- API keys: [Gemini](https://aistudio.google.com/apikey) &bull; [Pinecone](https://app.pinecone.io) &bull; [Jina AI](https://jina.ai/embeddings/)

### 1. Set Up GitHub Apps

<details>
<summary><b>Create a GitHub OAuth App</b> (click to expand)</summary>

1. Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name:** `GitTalk AI`
   - **Homepage URL:** `http://localhost:5173`
   - **Authorization callback URL:** `http://localhost:5173/auth/callback`
4. Click **"Register application"**
5. Copy **Client ID** → `GITHUB_CLIENT_ID`
6. Generate **Client Secret** → `GITHUB_CLIENT_SECRET`

</details>

<details>
<summary><b>Create a GitHub App (for private repos)</b> (click to expand)</summary>

1. Go to [GitHub Developer Settings > GitHub Apps](https://github.com/settings/apps)
2. Click **"New GitHub App"**
3. Fill in:
   - **GitHub App name:** `gittalk-ai` (this becomes your `GITHUB_APP_SLUG`)
   - **Homepage URL:** `http://localhost:5173`
   - **Callback URL:** `http://localhost:5173/auth/callback`
   - **Setup URL:** `http://localhost:5173/auth/callback` (check "Redirect on update")
4. **Permissions > Repository permissions:**
   - **Contents:** `Read-only`
   - **Metadata:** `Read-only`
5. **Where can this be installed?** → **"Any account"**
6. Click **"Create GitHub App"**

> For production: update all URLs to your production domain.

</details>

### 2. Clone & Run

```bash
# Clone
git clone https://github.com/Atharva1479/GitTalk-AI.git
cd GitTalk-AI

# Backend
cd backend
cp .env.example .env          # Fill in your API keys
uv sync                        # Install dependencies
uv run uvicorn src.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and paste any GitHub repo URL.

---

## Environment Variables

<details>
<summary><b>Backend</b> (<code>backend/.env</code>)</summary>

| Variable | Description | Required |
|----------|-------------|:--------:|
| `ENV` | `development` or `production` | Yes |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `GEMINI_MODEL` | Model name (default: `gemini-2.5-flash`) | Yes |
| `PINECONE_API_KEY` | Pinecone vector database key | Yes |
| `PINECONE_INDEX_NAME` | Pinecone index name | Yes |
| `JINA_API_KEY` | Jina AI embeddings API key | Yes |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret | Yes |
| `GITHUB_REDIRECT_URI` | OAuth callback URL | Yes |
| `GITHUB_APP_SLUG` | GitHub App slug | Yes |
| `SESSION_SECRET` | Secret for signing session JWTs | Recommended |
| `FALLBACK_COUNT` | Number of fallback Gemini keys | No |
| `FALLBACK_1..N` | Additional Gemini API keys | No |

</details>

<details>
<summary><b>Frontend</b> (<code>frontend/.env</code>) — not needed for local dev</summary>

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | WebSocket backend URL (production) |
| `VITE_HTTP_API_URL` | HTTP backend URL (production) |

</details>

---

## Deployment

<table>
<tr>
<td width="50%">

**Backend (Docker)**
```bash
cd backend
docker build -t gittalk-backend .
docker run -p 8080:8080 --env-file .env gittalk-backend
```

</td>
<td width="50%">

**Frontend (Vercel)**

Connect your GitHub repo to Vercel, set the env vars, and it auto-deploys.

</td>
</tr>
</table>

---

## Project Structure

```
backend/
├── src/
│   ├── main.py                 # FastAPI app, WebSocket handler, REST endpoints
│   └── utils/
│       ├── auth.py             # GitHub OAuth + App auth
│       ├── cache.py            # LRU repo + chunk cache
│       ├── chunker.py          # Language-aware chunking (14+ languages)
│       ├── db.py               # SQLite — conversations, users, memory
│       ├── hybrid_search.py    # BM25 + Reciprocal Rank Fusion
│       ├── ingest.py           # Repo ingestion via gitingest
│       ├── llm.py              # Gemini LLM + key rotation + retry
│       ├── memory.py           # STM + LTM memory system
│       ├── prompt.py           # Prompt engineering + mode instructions
│       ├── query_classifier.py # Query type detection + augmentation
│       ├── query_enrichment.py # History-aware query enrichment
│       ├── rate_limit.py       # Per-IP sliding window limiter
│       ├── reranker.py         # Jina AI Reranker API
│       ├── session.py          # JWT sessions + CSRF protection
│       └── vectorstore.py      # Pinecone + Jina AI operations
├── .env.example
├── Dockerfile
└── pyproject.toml

frontend/
├── src/
│   ├── pages/                  # Landing, Dashboard, AuthCallback
│   ├── components/             # Chat, Navbar, MarkdownCode, Landing sections
│   ├── context/                # AuthContext, WebSocketContext
│   ├── App.tsx                 # Router
│   └── config.ts              # Environment config
├── .env.example
├── package.json
└── vercel.json
```

---

## Rate Limits

| Action | Limit |
|--------|:-----:|
| WebSocket connections | 10/min per IP |
| Chat queries | 30/hr per IP |
| Auth requests | 20/min per IP |
| Repo fetches | 15/min per IP |

---

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

1. Fork the repository
2. Create your branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

<div align="center">

Built with passion by **[Atharva Jamdar](https://github.com/Atharva1479)**

If GitTalk AI helped you, consider giving it a star!

<a href="https://github.com/Atharva1479/GitTalk-AI"><img src="https://img.shields.io/github/stars/Atharva1479/GitTalk-AI?style=social" alt="GitHub stars"/></a>

</div>

<!-- Footer Wave -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0d1117,50:7c3aed,100:3b82f6&height=120&section=footer" width="100%" />
