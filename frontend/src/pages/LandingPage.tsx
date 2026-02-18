import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { Navbar } from "../components/Navbar"
import { Footer } from "../components/Footer"
import { HeroSection } from "../components/landing/HeroSection"
import { FeaturesSection } from "../components/landing/FeaturesSection"
import { HowItWorksSection } from "../components/landing/HowItWorksSection"
import { TestimonialsSection } from "../components/landing/TestimonialsSection"
import { FAQSection } from "../components/landing/FAQSection"
import { PricingSection } from "../components/landing/PricingSection"
import { Button } from "../components/ui/button"

export function LandingPage() {
  const navigate = useNavigate()
  const [repoUrl, setRepoUrl] = useState("")
  const [error, setError] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  const parseGithubUrl = (url: string): { owner: string; repo: string } | null => {
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname !== 'github.com') {
        return null
      }
      const pathParts = urlObj.pathname.split('/').filter(Boolean)
      if (pathParts.length < 2) {
        return null
      }
      return {
        owner: pathParts[0],
        repo: pathParts[1]
      }
    } catch {
      return null
    }
  }

  const handleStartChat = async () => {
    const parsed = parseGithubUrl(repoUrl)
    if (!parsed) {
      setError("Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)")
      return
    }

    setIsProcessing(true)
    try {
      navigate(`/${parsed.owner}/${parsed.repo}`)
    } catch (err) {
      console.error(err)
      setError('Failed to start chat')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleStartChat()
    }
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="min-h-screen w-full flex flex-col bg-background overflow-hidden">
      <Navbar />

      <HeroSection
        repoUrl={repoUrl}
        setRepoUrl={setRepoUrl}
        error={error}
        setError={setError}
        isProcessing={isProcessing}
        onStartChat={handleStartChat}
        onKeyPress={handleKeyPress}
      />

      <FeaturesSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <FAQSection />
      <PricingSection onGetStarted={scrollToTop} />

      {/* CTA Banner */}
      <section className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#7c3aed] to-[#3b82f6] opacity-95" />
        <div className="absolute inset-0 bg-dots opacity-10" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to explore any codebase?
          </h2>
          <p className="text-white/80 text-lg mb-8">
            Start chatting with any GitHub repository in seconds. No signup required.
          </p>
          <Button
            size="lg"
            className="bg-white text-[#7c3aed] hover:bg-white/90 shadow-lg text-lg px-10 py-6 rounded-xl font-semibold"
            onClick={scrollToTop}
          >
            Get Started Free
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
