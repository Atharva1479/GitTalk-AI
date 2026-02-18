import { MessageCircle, Zap, Brain, FileText, Shield, Rocket } from "lucide-react"

const features = [
  {
    icon: MessageCircle,
    title: "Natural Conversations",
    description: "Ask questions about any repository in plain English. No complex queries or syntax needed.",
  },
  {
    icon: Zap,
    title: "Instant Analysis",
    description: "Get answers in seconds. Our AI processes entire repositories and understands code context deeply.",
  },
  {
    icon: Brain,
    title: "Deep Understanding",
    description: "Goes beyond surface-level search. Understands architecture, patterns, and relationships across files.",
  },
  {
    icon: FileText,
    title: "Rich Responses",
    description: "Get formatted answers with code snippets, file references, and Mermaid diagrams for visual explanations.",
  },
  {
    icon: Shield,
    title: "Private Repos, Your Rules",
    description: "Connect your GitHub and select exactly which repos to share — like Vercel. We never access anything you haven't explicitly chosen.",
  },
  {
    icon: Rocket,
    title: "Zero Setup",
    description: "No installation, no API keys, no configuration. Just paste a URL and start chatting immediately.",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 sm:py-28 px-4 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Why <span className="gradient-text">GitTalk AI</span>?
          </h2>
          <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
            Everything you need to understand any codebase, without reading a single line of documentation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group p-6 rounded-2xl border border-border bg-background hover:bg-[#faf9f7] hover:border-l-main/40 hover:border-l-2 transition-all duration-300 opacity-0 animate-fade-in-up"
              style={{
                animationDelay: `${index * 100}ms`,
                animationFillMode: 'forwards',
                boxShadow: 'var(--shadow-sm)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = 'var(--shadow-xl), var(--shadow-glow)'
                e.currentTarget.style.transform = 'translateY(-6px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7c3aed]/20 to-[#3b82f6]/20 flex items-center justify-center mb-4 group-hover:from-[#7c3aed]/30 group-hover:to-[#3b82f6]/30 transition-colors duration-300">
                <feature.icon className="w-6 h-6 text-main" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-foreground/60 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
