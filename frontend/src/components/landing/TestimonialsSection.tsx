const testimonials = [
  {
    quote: "I used to spend hours reading through unfamiliar codebases. Now I just paste the URL and ask questions. It's like having a senior developer explain the code to me.",
    name: "Alex Chen",
    role: "Full-Stack Developer",
    accent: "from-[#7c3aed]/5 to-[#7c3aed]/10",
    borderColor: "border-l-[#7c3aed]/30",
    avatarBg: "bg-[#7c3aed]/15",
    avatarText: "text-[#7c3aed]",
  },
  {
    quote: "GitTalk AI is a game-changer for code reviews. I can quickly understand the architecture and design decisions of any project before diving into the code.",
    name: "Sarah Miller",
    role: "Engineering Lead",
    accent: "from-[#3b82f6]/5 to-[#3b82f6]/10",
    borderColor: "border-l-[#3b82f6]/30",
    avatarBg: "bg-[#3b82f6]/15",
    avatarText: "text-[#3b82f6]",
  },
  {
    quote: "As an open-source contributor, this tool helps me understand new projects in minutes instead of days. The AI's understanding of code context is impressive.",
    name: "Raj Patel",
    role: "Open Source Contributor",
    accent: "from-[#6366f1]/5 to-[#6366f1]/10",
    borderColor: "border-l-[#6366f1]/30",
    avatarBg: "bg-[#6366f1]/15",
    avatarText: "text-[#6366f1]",
  },
]

export function TestimonialsSection() {
  return (
    <section className="py-20 sm:py-28 px-4 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Loved by <span className="gradient-text">Developers</span>
          </h2>
          <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
            See what developers are saying about GitTalk AI.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.name}
              className={`p-6 rounded-2xl border border-border border-l-2 ${testimonial.borderColor} bg-gradient-to-br ${testimonial.accent} hover:-translate-y-1 transition-all duration-300 opacity-0 animate-fade-in-up`}
              style={{
                animationDelay: `${index * 100}ms`,
                animationFillMode: 'forwards',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div className="mb-4">
                <svg className="w-10 h-10 text-main/50" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609L9.978 5.151c-2.432.917-3.995 3.638-3.995 5.849h4V21H0z" />
                </svg>
              </div>
              <p className="text-foreground/80 text-sm leading-relaxed mb-6">
                "{testimonial.quote}"
              </p>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full ${testimonial.avatarBg} flex items-center justify-center`}>
                  <span className={`text-sm font-bold ${testimonial.avatarText}`}>
                    {testimonial.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-sm">{testimonial.name}</p>
                  <p className="text-foreground/50 text-xs">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
