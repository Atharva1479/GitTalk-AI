import { useNavigate } from "react-router-dom"
import { MessageSquarePlus } from "lucide-react"
import { Button } from "./ui/button"
import { useAuth } from "../context/AuthContext"

interface ChatNavbarProps {
  onNewChat: () => void
}

export function ChatNavbar({ onNewChat }: ChatNavbarProps) {
  const navigate = useNavigate()
  const { user, isAuthenticated, login, logout } = useAuth()

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault()
    onNewChat()
    navigate(isAuthenticated ? '/dashboard' : '/')
  }

  return (
    <nav className="sticky top-0 z-50 w-full glass border-b border-border/50" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-8 py-3 sm:py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <a
            href="/"
            onClick={handleLogoClick}
            className="text-2xl sm:text-3xl font-bold hover:opacity-90 transition-opacity flex items-center gap-2 shrink-0 max-sm:text-xl max-sm:gap-1.5"
          >
            <span className="gradient-text">GitTalk</span>
            <span className="text-foreground">AI</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-main/15 text-main font-semibold">BETA</span>
          </a>

          {/* Right side: Auth + New Chat */}
          <div className="flex items-center gap-3 max-sm:gap-2">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3 max-sm:gap-2">
                <button
                  onClick={() => { onNewChat(); navigate('/dashboard'); }}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity max-sm:gap-1.5"
                >
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="w-7 h-7 rounded-full border border-border/60 max-sm:w-6 max-sm:h-6"
                  />
                  <span className="hidden sm:inline text-sm font-medium text-foreground/80">{user.login}</span>
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full px-3 text-xs hidden sm:inline-flex"
                  onClick={() => { onNewChat(); logout(); navigate('/'); }}
                >
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full px-3 text-xs flex items-center gap-1.5 max-sm:px-2.5"
                onClick={login}
              >
                <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
                </svg>
                <span className="hidden sm:inline">Sign in</span>
              </Button>
            )}

            <Button
              className="rounded-full px-6 font-medium flex items-center gap-2 text-sm max-sm:px-3 max-sm:gap-1.5 max-sm:text-xs"
              onClick={() => { onNewChat(); navigate(isAuthenticated ? '/dashboard' : '/'); }}
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
