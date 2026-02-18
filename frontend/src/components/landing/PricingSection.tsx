import { Check } from "lucide-react"
import { Button } from "../ui/button"

const features = [
  "Unlimited conversations",
  "Any public GitHub repository",
  "Rich markdown responses",
  "Mermaid diagram support",
  "Code snippet highlighting",
  "No account required",
]

interface PricingSectionProps {
  onGetStarted: () => void
}

export function PricingSection({ onGetStarted }: PricingSectionProps) {
  return (
    <section id="pricing" className="py-20 sm:py-28 px-4 bg-background">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Simple <span className="gradient-text">Pricing</span>
          </h2>
          <p className="text-lg text-foreground/60">
            No hidden fees. No credit card required.
          </p>
        </div>

        <div
          className="rounded-2xl border border-border bg-gradient-to-b from-background to-[#f3f1ed]/50 p-8 text-center relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
          style={{ boxShadow: 'var(--shadow-xl)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow-xl), var(--shadow-glow)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow-xl)'
          }}
        >
          {/* Gradient accent at top */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#7c3aed] to-[#3b82f6]" />

          <div className="mb-6">
            <span className="inline-block text-sm font-semibold text-main uppercase tracking-widest bg-gradient-to-r from-[#7c3aed]/10 to-[#3b82f6]/10 px-4 py-1.5 rounded-full">Free Forever</span>
          </div>
          <div className="mb-8">
            <span className="text-5xl font-extrabold">$0</span>
            <span className="text-foreground/50 ml-1">/month</span>
          </div>

          <ul className="flex flex-col gap-3 mb-8 text-left">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#7c3aed]/20 to-[#3b82f6]/20 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-main" />
                </div>
                <span className="text-foreground/80">{feature}</span>
              </li>
            ))}
          </ul>

          <Button
            size="lg"
            className="w-full text-lg py-6 rounded-xl"
            onClick={onGetStarted}
          >
            Get Started Free
          </Button>
        </div>
      </div>
    </section>
  )
}
