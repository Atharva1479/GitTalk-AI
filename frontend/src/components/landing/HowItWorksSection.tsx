import { Link2, Cpu, MessagesSquare } from "lucide-react"

const steps = [
  {
    icon: Link2,
    number: "1",
    title: "Paste a GitHub URL",
    description: "Copy any public GitHub repository URL and paste it into GitTalk AI.",
  },
  {
    icon: Cpu,
    number: "2",
    title: "AI Analyzes the Repo",
    description: "Our AI processes the codebase, understanding structure, patterns, and documentation.",
  },
  {
    icon: MessagesSquare,
    number: "3",
    title: "Start Chatting",
    description: "Ask questions in natural language and get detailed, context-aware answers instantly.",
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 sm:py-28 px-4 bg-[#f3f1ed]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            How It <span className="gradient-text">Works</span>
          </h2>
          <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
            Three simple steps to start understanding any codebase.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-[#7c3aed]/30 via-[#3b82f6]/30 to-[#7c3aed]/30" />

          {steps.map((step) => (
            <div key={step.number} className="flex flex-col items-center text-center relative">
              <div className="relative mb-6">
                {/* Outer glow ring */}
                <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-[#7c3aed]/20 to-[#3b82f6]/20 blur-sm" />
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#3b82f6] flex items-center justify-center shadow-lg relative z-10">
                  <step.icon className="w-7 h-7 text-white" />
                </div>
              </div>
              <span className="text-xs font-bold text-main/60 uppercase tracking-widest mb-2">
                Step {step.number}
              </span>
              <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
              <p className="text-foreground/60 text-sm leading-relaxed max-w-xs">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
