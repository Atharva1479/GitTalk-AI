import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { ScrollArea } from "./ui/scroll-area"
import { useNavigate, useParams } from "react-router-dom"
import { SendHorizontal, Sparkles, Share2, Copy, Link2, Star, RefreshCw, Search, Bug, Wrench, Shield, FileText } from "lucide-react"
import { useState, useRef, useEffect, useCallback } from "react"
import { useWebSocket } from "../context/WebSocketContext"
import { useAuth } from "../context/AuthContext"
import { ChatNavbar } from "./ChatNavbar"
import MarkdownPreview from "@uiw/react-markdown-preview"
import rehypeExternalLinks from 'rehype-external-links'
import { Toaster } from "./ui/sonner"
import { toast } from "sonner"
import { MarkdownCode } from "./MarkdownCode"
import LZString from "lz-string"

interface Message {
  content: string
  role: 'user' | 'assistant'
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Vue: '#41b883',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Lua: '#000080',
  Scala: '#c22d40',
}

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(count)
}

export function Chat() {
  const navigate = useNavigate()
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  const { isConnected, sendMessage, lastMessage, disconnect, isProcessing, connect, suggestions, repoMetadata, isReconnecting, statusMessage, streamingContent, isStreaming, errorMessage } = useWebSocket()
  const { token, isAuthenticated, login, manageInstallation } = useAuth()
  const [messages, setMessages] = useState<Message[]>(() => {
    // Restore messages from localStorage on initial render
    if (owner && repo && !window.location.hash.startsWith('#share=')) {
      try {
        const cached = localStorage.getItem(`chat_messages:${owner}/${repo}`)
        if (cached) {
          const parsed = JSON.parse(cached) as Message[]
          if (parsed.length > 0) return parsed
        }
      } catch {
        // ignore
      }
    }
    return []
  })
  const [inputValue, setInputValue] = useState("")
  const [activeMode, setActiveMode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [connectionError, setConnectionError] = useState<string>("")
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [isSharedView, setIsSharedView] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const connectionAttemptedRef = useRef(false)
  const welcomeMessageShownRef = useRef(messages.length > 0)
  const shareMenuRef = useRef<HTMLDivElement>(null)

  const storageKey = `chat_messages:${owner}/${repo}`

  const persistMessages = useCallback((msgs: Message[]) => {
    if (!owner || !repo) return
    try {
      const capped = msgs.slice(-50)
      localStorage.setItem(storageKey, JSON.stringify(capped))
      // Update messageCount in recent_chats
      const saved = localStorage.getItem('recent_chats')
      if (saved) {
        const chats = JSON.parse(saved) as { owner: string; repo: string; private: boolean; timestamp: number; messageCount?: number }[]
        const updated = chats.map(c =>
          c.owner === owner && c.repo === repo ? { ...c, messageCount: capped.length } : c
        )
        localStorage.setItem('recent_chats', JSON.stringify(updated))
      }
    } catch {
      // ignore quota errors
    }
  }, [storageKey, owner, repo])

  const addMessage = useCallback((content: string, role: 'user' | 'assistant') => {
    setMessages(prev => {
      const next = [...prev, { content, role }]
      persistMessages(next)
      return next
    })
  }, [persistMessages])

  const stripSuggestions = (content: string) => {
    const idx = content.indexOf('---SUGGESTIONS---')
    return idx !== -1 ? content.slice(0, idx).trimEnd() : content
  }

  const transformMarkdown = (content: string) => {
    return stripSuggestions(content).replace(
      /\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/g,
      `[$1](https://github.com/${owner}/${repo}/blob/main/$2)`
    )
  }

  const copyAsMarkdown = useCallback(() => {
    const lines = [`# Chat with ${owner}/${repo}\n`]
    for (const msg of messages) {
      if (msg.role === 'user') {
        lines.push(`**You:** ${msg.content}\n`)
      } else {
        lines.push(`**Assistant:**\n\n${stripSuggestions(msg.content)}\n`)
      }
      lines.push('---\n')
    }
    navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Copied as Markdown!', { position: 'bottom-right', duration: 2000 })
    setShowShareMenu(false)
  }, [messages, owner, repo])

  const copyShareLink = useCallback(() => {
    const payload = JSON.stringify(messages.map(m => ({ c: stripSuggestions(m.content), r: m.role })))
    const compressed = LZString.compressToEncodedURIComponent(payload)
    const url = `${window.location.origin}/${owner}/${repo}#share=${compressed}`
    if (url.length > 8000) {
      toast.error('Conversation too long for a share link. Use Copy as Markdown instead.', { position: 'bottom-right', duration: 3000 })
    } else {
      navigator.clipboard.writeText(url)
      toast.success('Share link copied!', { position: 'bottom-right', duration: 2000 })
    }
    setShowShareMenu(false)
  }, [messages, owner, repo])

  useEffect(() => {
    // Restore shared conversation from URL hash
    const hash = window.location.hash
    if (hash.startsWith('#share=')) {
      try {
        const compressed = hash.slice('#share='.length)
        const json = LZString.decompressFromEncodedURIComponent(compressed)
        if (json) {
          const parsed = JSON.parse(json) as { c: string; r: 'user' | 'assistant' }[]
          setMessages(parsed.map(m => ({ content: m.c, role: m.r })))
          setIsSharedView(true)
          welcomeMessageShownRef.current = true
        }
      } catch {
        // ignore malformed share data
      }
    }

    return () => {
      disconnect()
      setMessages([])
      connectionAttemptedRef.current = false
      welcomeMessageShownRef.current = false
      window.history.replaceState({}, document.title)
    }
  }, [])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isConnected) {
        disconnect()
      }
    }

    const handlePopState = () => {
      if (isConnected) {
        disconnect()
        setMessages([])
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isConnected])

  // Close share menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false)
      }
    }
    if (showShareMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showShareMenu])

  useEffect(() => {
    const initConnection = async () => {
      if (!owner || !repo || connectionAttemptedRef.current) {
        return
      }

      connectionAttemptedRef.current = true
      try {
        await connect(owner, repo, token)
        setConnectionError("")
      } catch (err) {
        console.error('Failed to connect:', err)
        setConnectionError("Failed to connect to the repository. Please try again.")
      }
    }

    initConnection()
    return () => {
      disconnect()
      connectionAttemptedRef.current = false
      welcomeMessageShownRef.current = false
    }
  }, [owner, repo])

  useEffect(() => {
    if (!isLoading && !isProcessing && isConnected) {
      inputRef.current?.focus();
    }
  }, [isLoading, isProcessing, isConnected]);

  // Handle error toasts
  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage, {
        position: "bottom-right",
        duration: 5000,
      });
      setIsLoading(false);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (lastMessage === 'repo_processed') {
      // Always save/update recent chats entry (even on revisit)
      if (owner && repo) {
        try {
          const saved = localStorage.getItem('recent_chats');
          const chats: { owner: string; repo: string; private: boolean; timestamp: number; messageCount?: number }[] = saved ? JSON.parse(saved) : [];
          const existing = chats.find(c => c.owner === owner && c.repo === repo);
          const filtered = chats.filter(c => !(c.owner === owner && c.repo === repo));
          filtered.unshift({
            owner, repo, private: !!token, timestamp: Date.now(),
            messageCount: existing?.messageCount ?? 0,
          });
          localStorage.setItem('recent_chats', JSON.stringify(filtered.slice(0, 10)));
        } catch {
          // ignore
        }
      }

      if (!welcomeMessageShownRef.current) {
        welcomeMessageShownRef.current = true;
        toast.success("Repository analyzed! Ask me anything.", {
          position: "bottom-right",
          style: {
            background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
            color: "#fff",
            fontWeight: 600,
            borderRadius: 16,
            boxShadow: "0 4px 20px 0 rgba(124,58,237,0.25)",
            maxWidth: "400px",
            width: "auto",
            textAlign: "center",
            padding: "0.75rem 1.5rem",
          },
          duration: 3200,
        });
        addMessage("Hello! I've analyzed this repository. What would you like to know?", 'assistant');
      }
    } else if (lastMessage && lastMessage !== 'repo_processed' && !lastMessage.startsWith('status:') && !lastMessage.startsWith('error:')) {
      addMessage(lastMessage, 'assistant');
      setIsLoading(false);
    }
  }, [lastMessage]);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = () => {
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShowScrollButton(!isAtBottom);
    }
  };

  useEffect(() => {
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.addEventListener('scroll', handleScroll);
      return () => viewport.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const scrollToBottom = () => {
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, streamingContent])

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !isConnected || isLoading || isProcessing || isStreaming) return;
    // Enforce max length client-side
    const message = trimmed.slice(0, 10_000);

    // Show clean query in chat UI (no mode tag)
    const displayMessage = activeMode ? `[${activeMode.charAt(0).toUpperCase() + activeMode.slice(1)} Mode] ${message}` : message;
    addMessage(displayMessage, 'user');

    // Send with mode tag prefix to backend
    const wireMessage = activeMode ? `[MODE:${activeMode}] ${message}` : message;
    setIsLoading(true);
    sendMessage(wireMessage);
    setInputValue("");
    setActiveMode(null);
    inputRef.current?.focus();
  };

  if (connectionError || lastMessage?.startsWith('error:') || lastMessage?.startsWith('All API keys')) {
    const isRepoTooLarge = lastMessage === 'error:repo_too_large';
    const isRepoNotFound = lastMessage === 'error:repo_not_found';
    const isRepoPrivate = lastMessage === 'error:repo_private';
    const isRepoNotInstalled = lastMessage === 'error:repo_not_installed';
    const isRateLimited = lastMessage === 'error:rate_limited';
    const isServerBusy = lastMessage === 'error:server_busy';
    const isKeysExhausted = lastMessage?.startsWith('All API keys');

    return (
      <div className="min-h-screen w-full flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #f5f3ff 0%, #f3f1ed 30%, #eff6ff 60%, #f3f1ed 100%)' }}>
        {/* Background decoration */}
        <div className="fixed inset-0 bg-dots opacity-30 pointer-events-none" />
        <div className="fixed top-20 -left-32 w-96 h-96 bg-purple-300/15 rounded-full blur-3xl pointer-events-none" />
        <div className="fixed bottom-20 -right-32 w-96 h-96 bg-blue-300/15 rounded-full blur-3xl pointer-events-none" />
        <ChatNavbar
          onNewChat={() => {
            setMessages([])
            localStorage.removeItem(storageKey)
            disconnect()
            navigate(isAuthenticated ? '/dashboard' : '/')
          }}
        />
        <div className="flex-1 flex items-center justify-center p-4 relative z-10">
          <div className="max-w-[600px] w-full rounded-2xl border border-border bg-[#faf9f7]/90 backdrop-blur-sm p-4 sm:p-8" style={{ boxShadow: 'var(--shadow-xl), var(--shadow-glow)' }}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-3">
              {isRepoTooLarge
                ? "Repository Size Limit Exceeded"
                : isRepoNotFound
                ? "Repository Not Found"
                : isRepoNotInstalled
                ? "Repository Not Connected"
                : isRepoPrivate
                ? "Private Repository"
                : isRateLimited
                ? "Too Many Requests"
                : isServerBusy
                ? "Server is Busy"
                : isKeysExhausted
                ? "Service Temporarily Unavailable"
                : "Connection Failed"}
            </h2>
            <p className="text-foreground/70 whitespace-pre-line mb-6 text-sm leading-relaxed">
              {isRepoTooLarge
                ? "Support for larger repositories is coming very soon!\n\nCurrently this repository exceeds our size limits, but we're actively working on expanding GitTalk AI's capabilities. In the meantime, you can try:\n\n\u2022 Using a smaller repository\n\u2022 Starting with the main branch only\n\u2022 Check back soon - large repository support is a top priority!"
                : isRepoNotFound
                ? "The repository you're trying to access doesn't seem to exist. This could be because:\n\n\u2022 The repository URL is incorrect\n\u2022 The repository has been deleted or moved\n\u2022 You made a typo in the owner or repository name"
                : isRepoNotInstalled
                ? "This repository hasn't been added to your GitTalk AI app on GitHub. You choose exactly which repos to share — we never access anything you haven't explicitly selected.\n\n\u2022 Click \"Manage Repository Access\" below\n\u2022 Find GitTalk AI in your installations\n\u2022 Add this repository to the selected repos\n\u2022 Come back and try again"
                : isRepoPrivate
                ? "This appears to be a private repository. Sign in with GitHub to select which repositories you want to share with GitTalk AI. You pick the specific repos — we never access anything else."
                : isRateLimited
                ? "You're sending too many requests. To keep GitTalk AI fast and fair for everyone, we limit usage per session.\n\n\u2022 Wait a few minutes and try again\n\u2022 Chat queries are limited to 30 per hour\n\u2022 This resets automatically"
                : isServerBusy
                ? "GitTalk AI is experiencing high traffic right now. All available slots are currently in use.\n\n\u2022 Please try again in a minute or two\n\u2022 Slots free up when users disconnect\n\u2022 This is temporary"
                : isKeysExhausted
                ? "GitTalk AI is temporarily down! We are actively working on a fix and it will be up soon!\n\nIn the meantime:\n\n\u2022 Check X.com for updates\n\u2022 Try again in a few minutes\n\u2022 Consider starring the project on GitHub to stay updated"
                : "Unable to establish connection to the repository. This could be due to:\n\n\u2022 Server connectivity issues\n\u2022 Repository access restrictions\n\u2022 Temporary service disruption"}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              {isRepoNotInstalled ? (
                <>
                  <Button
                    onClick={manageInstallation}
                    className="flex-1"
                    size="lg"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Manage Repository Access
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                    className="flex-1"
                    size="lg"
                  >
                    Try Again
                  </Button>
                </>
              ) : isRepoPrivate ? (
                <>
                  <Button
                    onClick={() => {
                      localStorage.setItem('auth_return_to', window.location.pathname);
                      login();
                    }}
                    className="flex-1"
                    size="lg"
                  >
                    <svg height="18" width="18" viewBox="0 0 16 16" className="mr-2" fill="currentColor">
                      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
                    </svg>
                    Sign in with GitHub
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate(isAuthenticated ? '/dashboard' : '/')}
                    className="flex-1"
                    size="lg"
                  >
                    Try Another Repository
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => navigate(isAuthenticated ? '/dashboard' : '/')}
                    className="flex-1"
                    size="lg"
                  >
                    Try Another Repository
                  </Button>
                  {!isRepoNotFound && (
                    <Button
                      variant="outline"
                      onClick={() => window.location.reload()}
                      className="flex-1"
                      size="lg"
                    >
                      Try Again
                    </Button>
                  )}
                </>
              )}
            </div>
            <div className="mt-6 pt-6 border-t border-border/50">
              <p className="text-sm text-foreground/50 text-center">
                {isRepoTooLarge
                  ? "Have a large repository you'd like to analyze?"
                  : isRepoNotInstalled
                  ? "We only access repos you explicitly select."
                  : isRepoPrivate
                  ? "You choose exactly which repos to share."
                  : isRateLimited
                  ? "Rate limits reset automatically."
                  : isServerBusy
                  ? "Slots free up when users disconnect."
                  : isKeysExhausted
                  ? "Want to support GitTalk AI?"
                  : "Having trouble connecting?"}
                <a
                  href={isKeysExhausted
                    ? "https://github.com/Atharva1479/GTA"
                    : "https://github.com/Atharva1479/GTA/issues/new"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-main hover:underline ml-1"
                >
                  {isKeysExhausted ? "Star us on GitHub" : "Let us know"}
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #f5f3ff 0%, #f3f1ed 30%, #eff6ff 60%, #f3f1ed 100%)' }}>
      {/* Background decoration */}
      <div className="fixed inset-0 bg-dots opacity-30 pointer-events-none" />
      <div className="fixed top-20 -left-32 w-[30rem] h-[30rem] bg-purple-300/12 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="fixed bottom-20 -right-32 w-[28rem] h-[28rem] bg-blue-300/12 rounded-full blur-3xl pointer-events-none animate-float-delayed" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35rem] h-[35rem] bg-indigo-200/8 rounded-full blur-3xl pointer-events-none animate-float-slow" />

      <Toaster richColors={false} />
      <ChatNavbar
        onNewChat={() => {
          setMessages([])
          localStorage.removeItem(storageKey)
          disconnect()
          navigate(isAuthenticated ? '/dashboard' : '/')
        }}
      />

      {/* Shared View Banner */}
      {isSharedView && (
        <div className="w-full bg-gradient-to-r from-[#7c3aed]/10 to-[#3b82f6]/10 border-b border-border/40 relative z-20">
          <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <span className="text-sm text-foreground/70">Viewing shared conversation</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsSharedView(false)
                window.history.replaceState({}, document.title, `/${owner}/${repo}`)
              }}
              className="text-xs h-7"
            >
              Continue Chatting
            </Button>
          </div>
        </div>
      )}

      {/* Reconnecting Banner */}
      {isReconnecting && (
        <div className="w-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-border/40 relative z-20">
          <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
            <span className="text-sm text-foreground/70">Reconnecting...</span>
          </div>
        </div>
      )}

      {/* Chat Container */}
      <div className="flex-1 w-full mx-auto max-w-3xl relative z-10 flex flex-col min-h-0">
        <ScrollArea className="flex-1 h-[calc(100vh-12rem)]" onScrollCapture={handleScroll}>
          <div className="py-4 px-4 sm:px-8 space-y-5 max-sm:py-3 max-sm:space-y-4">
            {/* Repository Info */}
            <div className="flex flex-col items-center mb-6 gap-1.5">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#faf9f7]/80 backdrop-blur-sm border border-border/60 shadow-sm max-w-full max-sm:gap-1.5 max-sm:px-3 max-sm:py-1.5">
                <svg height="14" viewBox="0 0 16 16" version="1.1" width="14" className="text-foreground/60 shrink-0">
                  <path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
                </svg>
                <a
                  href={`https://github.com/${owner}/${repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline text-foreground/80 truncate max-sm:text-xs"
                >
                  {owner}/{repo}
                </a>
                {repoMetadata?.language && (
                  <span className="flex items-center gap-1 text-xs text-foreground/60 ml-1 shrink-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: LANGUAGE_COLORS[repoMetadata.language] || '#888' }}
                    />
                    <span className="max-sm:hidden">{repoMetadata.language}</span>
                  </span>
                )}
                {repoMetadata?.stargazers_count != null && repoMetadata.stargazers_count > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-foreground/60 ml-1 shrink-0">
                    <Star className="w-3 h-3" />
                    {formatStars(repoMetadata.stargazers_count)}
                  </span>
                )}
              </div>
              {repoMetadata?.description && (
                <p className="text-xs text-foreground/50 text-center max-w-md px-4 line-clamp-2">
                  {repoMetadata.description}
                </p>
              )}
            </div>

            {/* Repository Processing Message with status */}
            {isProcessing && (
              <div className="flex justify-center mb-6">
                <div className="px-5 py-3 rounded-2xl bg-[#faf9f7]/80 backdrop-blur-sm border border-border/60 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-md)' }}>
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed]/15 to-[#3b82f6]/15 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-main animate-pulse" />
                  </div>
                  <p className="text-sm text-foreground/70 flex items-center gap-2">
                    {statusMessage || 'Processing repository...'}
                    <svg className="animate-spin h-4 w-4 text-main ml-1" viewBox="0 0 24 24">
                      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
                    </svg>
                  </p>
                </div>
              </div>
            )}

            {/* Message List */}
            {messages.map((message, index) => (
              message.role === "user" ? (
                <div key={index} className="flex justify-end">
                  <div
                    className="max-w-[85%] px-4 py-3 rounded-2xl rounded-br-sm bg-gradient-to-r from-[#7c3aed] to-[#3b82f6] max-sm:max-w-[88%] max-sm:px-3 max-sm:py-2.5"
                    style={{ boxShadow: '0 4px 15px -3px rgba(124, 58, 237, 0.3)' }}
                  >
                    <p className="text-[14px] sm:text-[15px] text-white break-words max-sm:text-[13px]">{message.content}</p>
                  </div>
                </div>
              ) : (
                <div key={index} className="flex gap-2.5 max-sm:gap-2">
                  {/* AI Avatar */}
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed]/15 to-[#3b82f6]/15 flex items-center justify-center shrink-0 mt-1 max-sm:w-6 max-sm:h-6">
                    <Sparkles className="w-3.5 h-3.5 text-main max-sm:w-3 max-sm:h-3" />
                  </div>
                  <div
                    className="min-w-0 max-w-[85%] px-4 py-3 rounded-2xl rounded-bl-sm bg-[#faf9f7]/85 backdrop-blur-sm border border-border/60 max-sm:max-w-[calc(100%-2.5rem)] max-sm:px-3 max-sm:py-2.5"
                    style={{ boxShadow: 'var(--shadow-md)' }}
                  >
                    <div className="wmde-markdown-var overflow-hidden">
                      <MarkdownPreview
                        source={transformMarkdown(message.content)}
                        rehypePlugins={[[rehypeExternalLinks, { target: '_blank', rel: 'noopener noreferrer' }]]}
                        style={{
                          backgroundColor: 'transparent',
                          color: 'inherit',
                          fontSize: 'inherit',
                          maxWidth: '75ch',
                          width: '100%',
                        }}
                        className="text-[14px] sm:text-[15px] [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:p-3 [&_code]:text-sm [&_p]:break-words [&_p]:whitespace-pre-wrap [&_table]:block [&_table]:overflow-x-auto [&_img]:max-w-full max-sm:text-[13px] max-sm:[&_pre]:p-2 max-sm:[&_code]:text-xs"
                        wrapperElement={{
                          'data-color-mode': 'light'
                        }}
                        components={{
                          code: MarkdownCode
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            ))}

            {/* Streaming Response */}
            {isStreaming && streamingContent && (
              <div className="flex gap-2.5 max-sm:gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed]/15 to-[#3b82f6]/15 flex items-center justify-center shrink-0 mt-1 max-sm:w-6 max-sm:h-6">
                  <Sparkles className="w-3.5 h-3.5 text-main max-sm:w-3 max-sm:h-3" />
                </div>
                <div
                  className="min-w-0 max-w-[calc(100%-2.5rem)] sm:max-w-[85%] px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl rounded-bl-sm bg-[#faf9f7]/85 backdrop-blur-sm border border-border/60"
                  style={{ boxShadow: 'var(--shadow-md)' }}
                >
                  <div className="wmde-markdown-var overflow-hidden">
                    <MarkdownPreview
                      source={transformMarkdown(streamingContent)}
                      rehypePlugins={[[rehypeExternalLinks, { target: '_blank', rel: 'noopener noreferrer' }]]}
                      style={{
                        backgroundColor: 'transparent',
                        color: 'inherit',
                        fontSize: 'inherit',
                        maxWidth: '75ch',
                        width: '100%',
                      }}
                      className="text-[14px] sm:text-[15px] [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:p-3 [&_code]:text-sm [&_p]:break-words [&_p]:whitespace-pre-wrap [&_table]:block [&_table]:overflow-x-auto [&_img]:max-w-full max-sm:text-[13px] max-sm:[&_pre]:p-2 max-sm:[&_code]:text-xs"
                      wrapperElement={{ 'data-color-mode': 'light' }}
                      components={{ code: MarkdownCode }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Loading / Thinking Indicator */}
            {isLoading && !isStreaming && (
              <div className="flex gap-2.5 max-sm:gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed]/15 to-[#3b82f6]/15 flex items-center justify-center shrink-0 mt-1 max-sm:w-6 max-sm:h-6">
                  <Sparkles className="w-3.5 h-3.5 text-main animate-pulse max-sm:w-3 max-sm:h-3" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-[#faf9f7]/85 backdrop-blur-sm border border-border/60" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  {statusMessage ? (
                    <p className="text-sm text-foreground/50 flex items-center gap-2">
                      {statusMessage}
                      <svg className="animate-spin h-3.5 w-3.5 text-main" viewBox="0 0 24 24">
                        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
                      </svg>
                    </p>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-main/50 animate-[bounce_1.4s_infinite_.2s]" />
                      <div className="w-2 h-2 rounded-full bg-main/50 animate-[bounce_1.4s_infinite_.4s]" />
                      <div className="w-2 h-2 rounded-full bg-main/50 animate-[bounce_1.4s_infinite_.6s]" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Follow-up Suggestions */}
            {!isLoading && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-9 max-sm:pl-8 max-sm:gap-1.5">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      addMessage(suggestion, 'user')
                      setIsLoading(true)
                      sendMessage(suggestion)
                    }}
                    className="text-left text-[13px] px-3 py-2 rounded-xl border border-border/60 bg-[#faf9f7]/80 backdrop-blur-sm hover:border-main/30 hover:bg-[#f5f3ff]/60 transition-all duration-200 text-foreground/70 hover:text-foreground/90 max-sm:text-[12px] max-sm:px-2.5 max-sm:py-1.5"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Scroll to Bottom Button */}
        <div className="relative">
          {showScrollButton && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-4 bottom-4 h-10 w-10 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#3b82f6] text-white hover:shadow-[0_4px_15px_-3px_rgba(124,58,237,0.3)] z-50 max-sm:right-3 max-sm:bottom-2 max-sm:h-8 max-sm:w-8"
              onClick={scrollToBottom}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5" />
                <path d="m5 12 7 7 7-7" />
              </svg>
            </Button>
          )}
        </div>

        {/* Input Area */}
        <div className="py-3 px-3 sm:px-8 backdrop-blur-md bg-[#f3f1ed]/60">
          {/* Mode Buttons */}
          <div className="flex gap-1.5 mb-2 overflow-x-auto pb-0.5 scrollbar-none -mx-1 px-1">
            {([
              { key: 'explain', label: 'Explain', icon: Search },
              { key: 'bugs', label: 'Find Bugs', icon: Bug },
              { key: 'refactor', label: 'Refactor', icon: Wrench },
              { key: 'security', label: 'Security', icon: Shield },
              { key: 'document', label: 'Document', icon: FileText },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveMode(prev => prev === key ? null : key)}
                disabled={!isConnected || isLoading || isProcessing || isSharedView || isStreaming}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap border max-sm:gap-1 max-sm:px-2 max-sm:py-1 max-sm:text-[11px] ${
                  activeMode === key
                    ? 'bg-gradient-to-r from-[#7c3aed]/10 to-[#3b82f6]/10 border-main/30 text-main'
                    : 'border-border/50 text-foreground/50 hover:border-border/80 hover:text-foreground/70 bg-[#faf9f7]/60'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Icon className="w-3.5 h-3.5 max-sm:w-3 max-sm:h-3" />
                {label}
              </button>
            ))}
          </div>
          <div
            className="flex gap-2 sm:gap-3 items-center rounded-2xl border border-border/80 bg-[#faf9f7]/90 backdrop-blur-sm px-3 py-2 transition-all duration-200 focus-within:border-main/30 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] max-sm:px-2 max-sm:py-1.5 max-sm:gap-1.5"
            style={{ boxShadow: 'var(--shadow-lg), 0 0 15px rgba(124,58,237,0.04)' }}
          >
            <div className="flex-1">
              <Textarea
                ref={inputRef}
                placeholder={
                  isProcessing ? "Processing repository..."
                  : isStreaming ? "Generating response..."
                  : isLoading ? "Thinking..."
                  : "Ask me anything about this repository..."
                }
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    setInputValue(prev => prev + '\n');
                  } else if (e.key === 'Enter') {
                    handleSend();
                  }
                }}
                maxLength={10000}
                className="text-[14px] sm:text-[15px] border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0 resize-none max-sm:text-[13px]"
                style={{ height: '40px', minHeight: '40px' }}
                disabled={!isConnected || isLoading || isProcessing || isSharedView || isReconnecting || isStreaming}
              />
            </div>
            {/* Share Button */}
            {messages.length > 1 && !isLoading && !isStreaming && (
              <div className="relative" ref={shareMenuRef}>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 rounded-xl shrink-0 text-foreground/50 hover:text-foreground/80 max-sm:h-8 max-sm:w-8"
                  onClick={() => setShowShareMenu(prev => !prev)}
                >
                  <Share2 className="h-4.5 w-4.5" />
                </Button>
                {showShareMenu && (
                  <div className="absolute bottom-12 right-0 w-48 rounded-xl border border-border/60 bg-[#faf9f7] shadow-lg py-1 z-50">
                    <button
                      onClick={copyAsMarkdown}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/70 hover:bg-[#f5f3ff]/60 hover:text-foreground/90 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      Copy as Markdown
                    </button>
                    <button
                      onClick={copyShareLink}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/70 hover:bg-[#f5f3ff]/60 hover:text-foreground/90 transition-colors"
                    >
                      <Link2 className="w-4 h-4" />
                      Copy Share Link
                    </button>
                  </div>
                )}
              </div>
            )}
            <Button
              size="icon"
              className="h-10 w-10 rounded-xl shrink-0 max-sm:h-8 max-sm:w-8"
              onClick={handleSend}
              disabled={isLoading || !isConnected || !inputValue.trim() || isProcessing || isSharedView || isReconnecting || isStreaming}
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
