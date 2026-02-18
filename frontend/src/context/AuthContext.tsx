import React, { createContext, useContext, useState, useEffect } from 'react';
import config from '../config';

interface AuthUser {
  login: string;
  avatar_url: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  manageInstallation: () => void;
  setAuthData: (data: { login: string; avatar_url: string; access_token: string }) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Restore from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('github_token');
    const savedUser = localStorage.getItem('github_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('github_token');
        localStorage.removeItem('github_user');
      }
    }
  }, []);

  const login = () => {
    // Store current path so we can redirect back after OAuth
    localStorage.setItem('auth_return_to', window.location.pathname);
    // First-time users: install app + select repos. Returning users: just re-authorize.
    const hasInstalledBefore = localStorage.getItem('github_app_installed') === 'true';
    const url = hasInstalledBefore
      ? `${config.HTTP_API_URL}/auth/github`
      : `${config.HTTP_API_URL}/auth/github?install=true`;
    window.location.href = url;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('github_token');
    localStorage.removeItem('github_user');
  };

  const manageInstallation = () => {
    const url = 'https://github.com/settings/installations';
    const w = 700, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(url, 'github-settings', `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`);
  };

  const setAuthData = (data: { login: string; avatar_url: string; access_token: string }) => {
    const authUser = { login: data.login, avatar_url: data.avatar_url };
    setUser(authUser);
    setToken(data.access_token);
    localStorage.setItem('github_token', data.access_token);
    localStorage.setItem('github_user', JSON.stringify(authUser));
    localStorage.setItem('github_app_installed', 'true');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        login,
        logout,
        manageInstallation,
        setAuthData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
