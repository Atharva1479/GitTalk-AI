import { useNavigate } from "react-router-dom"
import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../context/AuthContext"
import { Navbar } from "../components/Navbar"
import { Footer } from "../components/Footer"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Search, Lock, Globe, Star, Clock, Plus, ExternalLink, X, Settings } from "lucide-react"
import config from "../config"

interface Repo {
  name: string
  owner: string
  full_name: string
  description: string
  private: boolean
  language: string
  stargazers_count: number
  updated_at: string
}

interface RecentChat {
  owner: string
  repo: string
  private: boolean
  timestamp: number
  messageCount?: number
}

function timeAgo(dateStr: string | number): string {
  const date = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString()
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

export function Dashboard() {
  const navigate = useNavigate()
  const { user, token, login } = useAuth()
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [repoUrl, setRepoUrl] = useState("")
  const [urlError, setUrlError] = useState("")
  const [recentChats, setRecentChats] = useState<RecentChat[]>([])
  const [installationId, setInstallationId] = useState<number | null>(null)
  const [showManageModal, setShowManageModal] = useState(false)

  const fetchRepos = useCallback(async () => {
    if (!token) return
    try {
      const response = await fetch(
        `${config.HTTP_API_URL}/auth/repos?token=${encodeURIComponent(token)}`
      )
      if (response.ok) {
        const data = await response.json()
        setRepos(data.repos || [])
        const instId = data.installation_id || null
        setInstallationId(instId)
        // Sync the installed flag with reality
        if (instId) {
          localStorage.setItem('github_app_installed', 'true')
        } else {
          localStorage.removeItem('github_app_installed')
        }
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err)
    } finally {
      setLoading(false)
    }
  }, [token])

  // Fetch repos on mount
  useEffect(() => {
    fetchRepos()
  }, [fetchRepos])

  // Auto-refresh repos when user returns from GitHub settings tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && token) {
        fetchRepos()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [token, fetchRepos])

  // Load recent chats from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('recent_chats')
      if (saved) {
        setRecentChats(JSON.parse(saved))
      }
    } catch {
      // ignore
    }
  }, [])

  const removeRecentChat = (chatOwner: string, chatRepo: string) => {
    const updated = recentChats.filter(c => !(c.owner === chatOwner && c.repo === chatRepo))
    setRecentChats(updated)
    localStorage.setItem('recent_chats', JSON.stringify(updated))
    localStorage.removeItem(`chat_messages:${chatOwner}/${chatRepo}`)
  }

  const filteredRepos = repos.filter(repo =>
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const parseGithubUrl = (url: string): { owner: string; repo: string } | null => {
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname !== 'github.com') return null
      const parts = urlObj.pathname.split('/').filter(Boolean)
      if (parts.length < 2) return null
      return { owner: parts[0], repo: parts[1] }
    } catch {
      return null
    }
  }

  const handleStartChat = () => {
    const parsed = parseGithubUrl(repoUrl)
    if (!parsed) {
      setUrlError("Please enter a valid GitHub URL (e.g., https://github.com/owner/repo)")
      return
    }
    navigate(`/${parsed.owner}/${parsed.repo}`)
  }

  const installationUrl = installationId
    ? `https://github.com/settings/installations/${installationId}`
    : 'https://github.com/settings/installations'

  return (
    <main className="min-h-screen w-full flex flex-col bg-background overflow-hidden">
      <Navbar />

      <div className="flex-1 relative">
        {/* Background decoration */}
        <div className="fixed inset-0 bg-dots opacity-30 pointer-events-none" />
        <div className="fixed top-20 -left-32 w-96 h-96 bg-purple-300/10 rounded-full blur-3xl pointer-events-none" />
        <div className="fixed bottom-20 -right-32 w-96 h-96 bg-blue-300/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
          {/* Welcome header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              {user?.avatar_url && (
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  className="w-12 h-12 rounded-full border-2 border-border/60"
                />
              )}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">
                  Welcome back, <span className="gradient-text">{user?.login}</span>
                </h1>
                <p className="text-foreground/60 text-sm mt-1">
                  Choose a repository to start chatting
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="rounded-full px-5 flex items-center gap-2 text-sm self-start"
              onClick={() => {
                if (installationId) {
                  setShowManageModal(true)
                } else {
                  localStorage.removeItem('github_app_installed');
                  login();
                }
              }}
            >
              <Plus className="w-4 h-4" />
              {installationId ? 'Add More Repos' : 'Install GitHub App'}
            </Button>
          </div>

          {/* URL Input bar */}
          <div className="rounded-2xl border border-border bg-[#faf9f7]/90 backdrop-blur-sm p-4 sm:p-5 mb-8" style={{ boxShadow: 'var(--shadow-md)' }}>
            <p className="text-sm font-medium text-foreground/60 mb-3">
              Or paste any public GitHub repository URL
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="url"
                placeholder="https://github.com/username/repo"
                className={`text-base py-5 rounded-xl ${urlError ? 'border-red-400' : ''}`}
                value={repoUrl}
                onChange={(e) => { setRepoUrl(e.target.value); setUrlError(""); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleStartChat(); }}
              />
              <Button
                size="lg"
                className="px-8 py-5 whitespace-nowrap rounded-xl"
                onClick={handleStartChat}
              >
                Start Chatting
              </Button>
            </div>
            {urlError && <p className="text-red-500 text-sm mt-2">{urlError}</p>}
          </div>

          {/* Recent Chats */}
          {recentChats.length > 0 && (
            <div className="mb-10">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-foreground/50" />
                Recent Chats
              </h2>
              <div className="flex flex-wrap gap-3">
                {recentChats.map((chat) => (
                  <div
                    key={`${chat.owner}/${chat.repo}`}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-[#faf9f7]/80 hover:bg-[#faf9f7] hover:border-main/30 transition-all duration-200 group"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                  >
                    <button
                      onClick={() => navigate(`/${chat.owner}/${chat.repo}`)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      {chat.private ? (
                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-foreground/40" />
                      )}
                      <span className="text-sm font-medium group-hover:text-main transition-colors">
                        {chat.owner}/{chat.repo}
                      </span>
                      {chat.messageCount != null && chat.messageCount > 0 && (
                        <span className="text-xs text-foreground/40">
                          {chat.messageCount} {chat.messageCount === 1 ? 'message' : 'messages'}
                        </span>
                      )}
                      <span className="text-xs text-foreground/40">
                        {timeAgo(chat.timestamp)}
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecentChat(chat.owner, chat.repo)
                      }}
                      className="ml-1 p-0.5 rounded-md text-foreground/30 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="Remove chat"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Your Repositories */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <h2 className="text-lg font-semibold">Your Repositories</h2>
              {repos.length > 0 && (
                <div className="relative max-w-xs w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                  <Input
                    placeholder="Search repos..."
                    className="pl-9 rounded-xl text-sm py-2"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <svg className="animate-spin h-8 w-8 text-main" viewBox="0 0 24 24">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
                  </svg>
                  <p className="text-foreground/60 text-sm">Loading your repositories...</p>
                </div>
              </div>
            ) : repos.length === 0 ? (
              /* Empty state — differs based on whether app is installed */
              <div className="text-center py-16 rounded-2xl border border-dashed border-border/80 bg-[#faf9f7]/50">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7c3aed]/10 to-[#3b82f6]/10 flex items-center justify-center mx-auto mb-5">
                  <svg height="28" width="28" viewBox="0 0 16 16" className="text-main" fill="currentColor">
                    <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
                  </svg>
                </div>
                {installationId ? (
                  <>
                    <h3 className="text-xl font-semibold mb-2">No repositories selected</h3>
                    <p className="text-foreground/60 text-sm mb-6 max-w-md mx-auto">
                      The app is installed but no repositories are selected. Add repos to start chatting with them.
                    </p>
                    <Button
                      className="rounded-full px-6"
                      onClick={() => setShowManageModal(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Repositories
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-semibold mb-2">App not installed</h3>
                    <p className="text-foreground/60 text-sm mb-6 max-w-md mx-auto">
                      Install the GitTalk AI app on your GitHub account to connect repositories. You choose exactly which repos to share.
                    </p>
                    <Button
                      className="rounded-full px-6"
                      onClick={() => {
                        localStorage.removeItem('github_app_installed');
                        login();
                      }}
                    >
                      <svg height="16" width="16" viewBox="0 0 16 16" className="mr-2" fill="currentColor">
                        <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
                      </svg>
                      Install GitHub App
                    </Button>
                  </>
                )}
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-foreground/60 text-sm">No repos match "{searchQuery}"</p>
              </div>
            ) : (
              /* Repo grid */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRepos.map((repo) => (
                  <button
                    key={repo.full_name}
                    onClick={() => navigate(`/${repo.owner}/${repo.name}`)}
                    className="group text-left p-5 rounded-2xl border border-border bg-[#faf9f7]/80 hover:bg-[#faf9f7] hover:border-main/30 transition-all duration-200 cursor-pointer"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = 'var(--shadow-lg), var(--shadow-glow)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    {/* Repo header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {repo.private ? (
                          <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                        ) : (
                          <Globe className="w-4 h-4 text-foreground/40 shrink-0" />
                        )}
                        <h3 className="text-sm font-semibold truncate group-hover:text-main transition-colors">
                          {repo.name}
                        </h3>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-foreground/30 group-hover:text-main shrink-0 transition-colors" />
                    </div>

                    {/* Owner */}
                    <p className="text-xs text-foreground/50 mb-2">{repo.owner}</p>

                    {/* Description */}
                    <p className="text-xs text-foreground/60 leading-relaxed mb-3 line-clamp-2 min-h-[2rem]">
                      {repo.description || "No description"}
                    </p>

                    {/* Footer: language, stars, updated */}
                    <div className="flex items-center gap-3 text-xs text-foreground/45">
                      {repo.language && (
                        <span className="flex items-center gap-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: LANGUAGE_COLORS[repo.language] || '#888' }}
                          />
                          {repo.language}
                        </span>
                      )}
                      {repo.stargazers_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          {repo.stargazers_count}
                        </span>
                      )}
                      {repo.updated_at && (
                        <span className="ml-auto">{timeAgo(repo.updated_at)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manage Repos Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowManageModal(false)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-[#faf9f7] p-6 sm:p-8" style={{ boxShadow: 'var(--shadow-xl)' }}>
            <button
              onClick={() => setShowManageModal(false)}
              className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7c3aed]/15 to-[#3b82f6]/15 flex items-center justify-center mb-4">
              <Settings className="w-6 h-6 text-main" />
            </div>

            <h3 className="text-lg font-bold mb-2">Manage Repository Access</h3>
            <p className="text-foreground/60 text-sm leading-relaxed mb-6">
              Add or remove repositories from GitTalk on GitHub. You can choose "All repositories" or select specific ones. Changes appear here automatically when you come back.
            </p>

            <div className="flex flex-col gap-3">
              <Button
                className="w-full rounded-xl"
                onClick={() => {
                  const w = 700, h = 700;
                  const left = window.screenX + (window.outerWidth - w) / 2;
                  const top = window.screenY + (window.outerHeight - h) / 2;
                  const popup = window.open(
                    installationUrl,
                    'github-settings',
                    `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`
                  );
                  // Poll for popup close, then refresh repos
                  if (popup) {
                    const timer = setInterval(() => {
                      if (popup.closed) {
                        clearInterval(timer);
                        fetchRepos();
                        setShowManageModal(false);
                      }
                    }, 500);
                  }
                }}
              >
                <svg height="16" width="16" viewBox="0 0 16 16" className="mr-2" fill="currentColor">
                  <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
                </svg>
                Open GitHub Settings
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => {
                  fetchRepos();
                  setShowManageModal(false);
                }}
              >
                Done
              </Button>
            </div>

            <p className="text-xs text-foreground/40 text-center mt-4">
              Settings open in a popup. Your repos refresh when you close it or click Done.
            </p>
          </div>
        </div>
      )}

      <Footer />
    </main>
  )
}
