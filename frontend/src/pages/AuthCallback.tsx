import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import config from '../config';

export function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthData, isAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If we're inside a popup (opened from Dashboard manage modal),
    // just close the popup — the parent will auto-refresh repos
    const isPopup = window.opener && window.opener !== window;
    if (isPopup) {
      window.close();
      return;
    }

    const code = searchParams.get('code');

    // No code — user just finished installing the GitHub App.
    // Redirect to OAuth authorize flow to get a code.
    if (!code) {
      if (isAuthenticated) {
        navigate('/dashboard', { replace: true });
        return;
      }
      window.location.href = `${config.HTTP_API_URL}/auth/github`;
      return;
    }

    const exchangeCode = async () => {
      try {
        const response = await fetch(
          `${config.HTTP_API_URL}/auth/github/callback?code=${encodeURIComponent(code)}`
        );
        if (!response.ok) {
          // If already authenticated, just redirect — code may be expired/reused
          if (isAuthenticated) {
            const returnTo = localStorage.getItem('auth_return_to') || '/dashboard';
            localStorage.removeItem('auth_return_to');
            navigate(returnTo, { replace: true });
            return;
          }
          const data = await response.json();
          throw new Error(data.error || 'Failed to authenticate');
        }
        const data = await response.json();
        setAuthData(data);

        const returnTo = localStorage.getItem('auth_return_to') || '/dashboard';
        localStorage.removeItem('auth_return_to');
        navigate(returnTo, { replace: true });
      } catch (err) {
        // If already authenticated, just go to dashboard
        if (isAuthenticated) {
          navigate('/dashboard', { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    exchangeCode();
  }, [searchParams, setAuthData, navigate, isAuthenticated]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #f5f3ff 0%, #f3f1ed 30%, #eff6ff 60%, #f3f1ed 100%)' }}>
        <div className="max-w-md w-full rounded-2xl border border-border bg-[#faf9f7]/90 backdrop-blur-sm p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 flex items-center justify-center mb-5 mx-auto">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-3">Authentication Failed</h2>
          <p className="text-foreground/70 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#3b82f6] text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #f5f3ff 0%, #f3f1ed 30%, #eff6ff 60%, #f3f1ed 100%)' }}>
      <div className="flex flex-col items-center gap-4">
        <svg className="animate-spin h-8 w-8 text-[#7c3aed]" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
        </svg>
        <p className="text-foreground/70 text-sm font-medium">Signing in with GitHub...</p>
      </div>
    </div>
  );
}
