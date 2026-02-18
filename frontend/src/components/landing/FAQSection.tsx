import { useState } from "react"
import { ChevronDown } from "lucide-react"

const faqs = [
  {
    question: "Is GitTalk AI free to use?",
    answer: "Yes! GitTalk AI is completely free to use. We believe in making code understanding accessible to everyone.",
  },
  {
    question: "Does it work with private repositories?",
    answer: "Yes! Click \"Sign in with GitHub\" to install our GitHub App and select exactly which repositories you want to share — just like Vercel or Netlify. We can only access the repos you explicitly choose, nothing else. You can add or remove repos anytime from your GitHub settings.",
  },
  {
    question: "Is there a limit on repository size?",
    answer: "There are some size limits for repositories, but we're actively working on expanding support for larger codebases. Most standard repositories work perfectly.",
  },
  {
    question: "Which AI model powers GitTalk AI?",
    answer: "GitTalk AI uses state-of-the-art language models to analyze and understand code. We continuously upgrade our models to provide the best possible answers.",
  },
  {
    question: "Is my data safe?",
    answer: "Absolutely. For public repos, we only access publicly available data. For private repos, we use a GitHub App — you select specific repos to share, and we can only read their contents (read-only). We never get access to your entire account. Tokens are only used during the session and are never persisted.",
  },
  // {
  //   question: "Can I self-host TalkToGitHub?",
  //   answer: "TalkToGitHub is open source! You can find the source code on GitHub and self-host it with your own API keys. Check our repository for setup instructions.",
  // },
]

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border border-border rounded-2xl overflow-hidden transition-all duration-200 hover:border-main/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-5 flex items-center justify-between text-left cursor-pointer bg-background"
      >
        <span className="font-medium text-sm sm:text-base pr-4">{question}</span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 transition-all duration-200 ${isOpen ? 'rotate-180 text-main' : 'text-foreground/50'}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <p className={`px-6 pb-5 text-foreground/60 text-sm leading-relaxed ${isOpen ? 'bg-[#f3f1ed]/50' : ''}`}>{answer}</p>
      </div>
    </div>
  )
}

export function FAQSection() {
  return (
    <section id="faq" className="py-20 sm:py-28 px-4 bg-[#f3f1ed]">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Frequently Asked <span className="gradient-text">Questions</span>
          </h2>
        </div>

        <div className="flex flex-col gap-3">
          {faqs.map((faq) => (
            <FAQItem key={faq.question} {...faq} />
          ))}
        </div>
      </div>
    </section>
  )
}
