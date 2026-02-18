import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { Chat } from "./components/Chat"
import { WebSocketProvider } from "./context/WebSocketContext"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { Footer } from "./components/Footer"
import { NotFound } from "./components/NotFound"
import { LandingPage } from "./pages/LandingPage"
import { Dashboard } from "./pages/Dashboard"
import { AuthCallback } from "./pages/AuthCallback"

function HomeRedirect() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />
}

function ProtectedDashboard() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Dashboard /> : <Navigate to="/" replace />
}

function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <Router>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/dashboard" element={<ProtectedDashboard />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path=":owner/:repo" element={
              <div className="flex flex-col min-h-screen">
                <Chat />
                <Footer />
              </div>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </WebSocketProvider>
    </AuthProvider>
  )
}

export default App
