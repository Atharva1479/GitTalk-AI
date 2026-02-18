import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { ExampleRepos } from "../ExampleRepos"
import { useAuth } from "../../context/AuthContext"

interface HeroSectionProps {
  repoUrl: string
  setRepoUrl: (url: string) => void
  error: string
  setError: (error: string) => void
  isProcessing: boolean
  onStartChat: () => void
  onKeyPress: (e: React.KeyboardEvent) => void
}

export function HeroSection({
  repoUrl,
  setRepoUrl,
  error,
  setError,
  isProcessing,
  onStartChat,
  onKeyPress,
}: HeroSectionProps) {
  const { isAuthenticated, login } = useAuth()

  return (
    <section className="relative w-full overflow-hidden" style={{ background: 'var(--gradient-hero)' }}>
      {/* Dot pattern overlay */}
      <div className="absolute inset-0 bg-dots opacity-50" />

      {/* Decorative orbs */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-purple-400/30 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-10 right-10 w-[28rem] h-[28rem] bg-blue-400/30 rounded-full blur-3xl animate-float-delayed" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-300/20 rounded-full blur-3xl animate-float-slow" />

      <div className="relative max-w-5xl mx-auto px-4 pt-24 sm:pt-32 pb-20 sm:pb-28">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
            Chat With Any{' '}
            <span className="gradient-text">GitHub Repo</span>
          </h1>

          <p className="text-lg sm:text-xl text-foreground/70 max-w-2xl mb-10">
            Stop reading endless documentation. Paste a GitHub URL and start asking questions instantly. Get answers in seconds, not hours.
          </p>

          {/* Repo URL input card */}
          <div className="w-full max-w-[700px] rounded-2xl border border-border bg-[#faf9f7]/90 backdrop-blur-sm p-5 sm:p-6 mb-6" style={{ boxShadow: 'var(--shadow-xl), var(--shadow-glow)' }}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="url"
                  placeholder="https://github.com/username/repo"
                  className={`text-base sm:text-lg py-5 sm:py-6 rounded-xl ${error ? 'border-red-400 focus-visible:ring-red-300' : ''}`}
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value)
                    setError("")
                  }}
                  onKeyDown={onKeyPress}
                />
                <Button
                  size="lg"
                  className="text-lg px-8 py-5 sm:py-6 whitespace-nowrap rounded-xl"
                  onClick={onStartChat}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Starting...' : 'Start Chatting'}
                </Button>
              </div>
              {error && (
                <p className="text-red-500 text-sm px-1">{error}</p>
              )}
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm font-medium text-foreground/60">
                  Try these example repositories:
                </p>
                <ExampleRepos onSelect={setRepoUrl} />
              </div>
              {!isAuthenticated && (
                <div className="flex items-center gap-2 pt-1">
                  <svg height="14" width="14" viewBox="0 0 16 16" className="text-foreground/40" fill="currentColor">
                    <path d="M4 4v2h-.25A1.75 1.75 0 0 0 2 7.75v5.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 13.25v-5.5A1.75 1.75 0 0 0 12.25 6H12V4a4 4 0 1 0-8 0Zm6 2V4a2 2 0 1 0-4 0v2Z" />
                  </svg>
                  <p className="text-sm text-foreground/50">
                    Private repo?{' '}
                    <button
                      onClick={login}
                      className="text-main hover:underline font-medium"
                    >
                      Sign in with GitHub
                    </button>
                    {' '}&mdash; you choose exactly which repos to share
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
