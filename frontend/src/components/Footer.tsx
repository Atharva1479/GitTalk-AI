export function Footer() {
  return (
    <footer className="w-full bg-slate-800 text-white mt-auto relative">
      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#7c3aed] to-[#3b82f6]" />

      <div className="max-w-screen-xl mx-auto px-4 sm:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="text-xl font-bold mb-3">
              <span className="gradient-text">GitTalk</span>
              <span>AI</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Chat with any public GitHub repository. Understand code faster with AI-powered conversations.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-sm mb-4 text-slate-300">Product</h4>
            <ul className="flex flex-col gap-2">
              <li><a href="#features" className="text-slate-400 text-sm hover:text-white transition-colors">Features</a></li>
              <li><a href="#how-it-works" className="text-slate-400 text-sm hover:text-white transition-colors">How It Works</a></li>
              <li><a href="#pricing" className="text-slate-400 text-sm hover:text-white transition-colors">Pricing</a></li>
              <li><a href="#faq" className="text-slate-400 text-sm hover:text-white transition-colors">FAQ</a></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold text-sm mb-4 text-slate-300">Resources</h4>
            <ul className="flex flex-col gap-2">
              <li><a href="https://github.com/Atharva1479/GTA" target="_blank" rel="noopener noreferrer" className="text-slate-400 text-sm hover:text-white transition-colors">GitHub</a></li>
              <li><a href="https://github.com/Atharva1479/GTA/issues/new" target="_blank" rel="noopener noreferrer" className="text-slate-400 text-sm hover:text-white transition-colors">Report an Issue</a></li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="font-semibold text-sm mb-4 text-slate-300">Connect</h4>
            <ul className="flex flex-col gap-2">
              <li><a href="https://x.com/its_atharva18" target="_blank" rel="noopener noreferrer" className="text-slate-400 text-sm hover:text-white transition-colors">X (Twitter)</a></li>
              <li><a href="https://github.com/Atharva1479" target="_blank" rel="noopener noreferrer" className="text-slate-400 text-sm hover:text-white transition-colors">GitHub</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-slate-700 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-xs">
            Made with love by{' '}
            <a href="https://x.com/its_atharva18" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
              Atharva Jamdar
            </a>
          </p>
          <p className="text-slate-500 text-xs">
            &copy; {new Date().getFullYear()} TalkToGitHub. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
