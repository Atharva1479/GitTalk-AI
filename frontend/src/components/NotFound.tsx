import { Button } from "./ui/button"

export function NotFound() {
  function handleReturnHome() {
    window.location.href = "/"
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-8">
      <h1 className="text-8xl font-extrabold mb-4 gradient-text">404</h1>
      <h2 className="text-2xl font-semibold mb-3">Page Not Found</h2>
      <p className="mb-8 text-lg text-foreground/60 max-w-md">
        Sorry, the page you are looking for does not exist or is not supported.
      </p>
      <Button
        size="lg"
        className="rounded-xl px-8 py-6 text-lg"
        onClick={handleReturnHome}
      >
        Return Home
      </Button>
    </div>
  )
}
