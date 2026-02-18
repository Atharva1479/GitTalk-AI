import React, { createContext, useContext, useState, useRef } from 'react';
import { nanoid } from 'nanoid';
import config from '../config';

interface RepoMetadata {
  description?: string;
  language?: string;
  stargazers_count?: number;
  updated_at?: string;
}

interface WebSocketContextType {
  connect: (owner: string, repo: string, githubToken?: string | null) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: string) => void;
  isConnected: boolean;
  isProcessing: boolean;
  lastMessage: string | null;
  suggestions: string[];
  repoMetadata: RepoMetadata | null;
  isReconnecting: boolean;
  statusMessage: string | null;
  streamingContent: string | null;
  isStreaming: boolean;
  errorMessage: string | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

// Validate owner/repo format — only allow safe characters
const SAFE_PARAM_REGEX = /^[a-zA-Z0-9_.-]+$/;

const MAX_MESSAGE_LENGTH = 10_000;

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [repoMetadata, setRepoMetadata] = useState<RepoMetadata | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const connectingRef = useRef(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connParamsRef = useRef<{ owner: string; repo: string; githubToken?: string | null } | null>(null);

  const clearPingInterval = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  };

  const disconnect = () => {
    intentionalCloseRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setIsReconnecting(false);
    clearPingInterval();
    if (socket) {
      socket.close();
      setSocket(null);
      setIsConnected(false);
      setIsProcessing(false);
      setLastMessage(null);
      setRepoMetadata(null);
      setStatusMessage(null);
      setStreamingContent(null);
      setIsStreaming(false);
      setErrorMessage(null);
      connectingRef.current = false;
    }
  };

  const connect = async (owner: string, repo: string, githubToken?: string | null) => {
    // Prevent multiple simultaneous connection attempts
    if (connectingRef.current) {
      return;
    }

    // Validate owner/repo to prevent URL injection
    if (!SAFE_PARAM_REGEX.test(owner) || !SAFE_PARAM_REGEX.test(repo)) {
      throw new Error('Invalid repository owner or name.');
    }

    if (owner.length > 100 || repo.length > 100) {
      throw new Error('Repository owner or name too long.');
    }

    return new Promise<void>((resolve, reject) => {
      try {
        connectingRef.current = true;
        intentionalCloseRef.current = false;
        connParamsRef.current = { owner, repo, githubToken };

        // Clean up any existing connection first
        if (socket) {
          socket.close();
          setSocket(null);
          setIsConnected(false);
          setIsProcessing(false);
        }
        clearPingInterval();

        const clientId = nanoid(10);
        let wsUrl = `${config.API_URL}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${clientId}`;
        if (githubToken) {
          wsUrl += `?token=${encodeURIComponent(githubToken)}`;
        }
        const ws = new WebSocket(wsUrl);

        const timeout = setTimeout(() => {
          connectingRef.current = false;
          reject(new Error('Connection timeout'));
          ws.close();
        }, 60000);

        ws.onerror = (error) => {
          clearTimeout(timeout);
          connectingRef.current = false;
          setIsConnected(false);
          setIsProcessing(false);
          reject(error);
        };

        ws.onopen = () => {
          clearTimeout(timeout);
          setIsConnected(true);
          // Store interval ref so it can be cleaned up
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 240000);
          setIsProcessing(true);
          resolve();
        };

        ws.onmessage = (event) => {
          const data = event.data as string;
          if (data === 'pong') return;

          // Connection-phase errors — show full-page error
          if (data === 'error:repo_too_large' || data === 'error:repo_not_found' ||
              data === 'error:repo_private' || data === 'error:repo_not_installed' ||
              data === 'error:rate_limited' || data === 'error:server_busy') {
            setLastMessage(data);
            connectingRef.current = false;
            setIsProcessing(false);
            ws.close();
            return;
          }

          // Chat-phase errors — show as toast notification
          if (data === 'error:timeout') {
            setErrorMessage('Response timed out. Please try a simpler question.');
            setStatusMessage(null);
            setIsStreaming(false);
            setStreamingContent(null);
            return;
          }
          if (data === 'error:keys_exhausted') {
            setErrorMessage('Service temporarily unavailable. Please try again in a few minutes.');
            setStatusMessage(null);
            setIsStreaming(false);
            setStreamingContent(null);
            return;
          }
          if (data === 'error:generation_failed' || data === 'error:retrieval_failed') {
            setErrorMessage('Something went wrong. Please try again.');
            setStatusMessage(null);
            setIsStreaming(false);
            setStreamingContent(null);
            return;
          }
          if (data === 'error:indexing_failed') {
            setErrorMessage('Failed to build knowledge base. Please try again.');
            setStatusMessage(null);
            setIsProcessing(false);
            connectingRef.current = false;
            ws.close();
            return;
          }
          if (data === 'error:unexpected') {
            setLastMessage('error:repo_not_found');
            connectingRef.current = false;
            setIsProcessing(false);
            ws.close();
            return;
          }

          // Status messages
          if (data.startsWith('status:')) {
            const status = data.slice('status:'.length);
            const statusMap: Record<string, string> = {
              cloning: 'Fetching repository...',
              chunking: 'Analyzing code structure...',
              indexing: 'Building knowledge base...',
              searching: 'Searching codebase...',
              thinking: 'Generating response...',
            };
            setStatusMessage(statusMap[status] || status);
            return;
          }

          // Streaming chunks
          if (data.startsWith('stream:chunk:')) {
            const chunk = data.slice('stream:chunk:'.length);
            setStatusMessage(null);
            setIsStreaming(true);
            setStreamingContent(prev => (prev || '') + chunk);
            return;
          }
          if (data === 'stream:end') {
            setIsStreaming(false);
            // Finalize: move streaming content to lastMessage
            setStreamingContent(prev => {
              if (prev) setLastMessage(prev);
              return null;
            });
            return;
          }

          if (data === 'repo_processed') {
            setIsProcessing(false);
            setStatusMessage(null);
            connectingRef.current = false;
            setLastMessage('repo_processed');
          } else if (data.startsWith('metadata:')) {
            try {
              const parsed = JSON.parse(data.slice('metadata:'.length));
              setRepoMetadata(parsed);
            } catch {
              // ignore
            }
          } else if (data.startsWith('suggestions:')) {
            try {
              const parsed = JSON.parse(data.slice('suggestions:'.length));
              if (Array.isArray(parsed)) setSuggestions(parsed);
            } catch {
              // ignore
            }
          } else {
            setLastMessage(data);
          }
        };

        ws.onclose = () => {
          clearPingInterval();
          setIsConnected(false);
          setIsProcessing(false);
          setSocket(null);
          connectingRef.current = false;

          // Auto-reconnect on unintentional disconnect
          if (!intentionalCloseRef.current && connParamsRef.current && reconnectAttemptsRef.current < 3) {
            const attempt = reconnectAttemptsRef.current;
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            setIsReconnecting(true);
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current += 1;
              const params = connParamsRef.current!;
              connect(params.owner, params.repo, params.githubToken).then(() => {
                reconnectAttemptsRef.current = 0;
                setIsReconnecting(false);
              }).catch(() => {
                // Will retry via next onclose if still under limit
                if (reconnectAttemptsRef.current >= 3) {
                  setIsReconnecting(false);
                }
              });
            }, delay);
          }
        };

        setSocket(ws);
      } catch (error) {
        connectingRef.current = false;
        reject(error);
      }
    });
  };

  const sendMessage = (message: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      // Enforce max message length
      const trimmed = message.slice(0, MAX_MESSAGE_LENGTH);
      setSuggestions([]);
      socket.send(trimmed);
    }
  };

  return (
    <WebSocketContext.Provider
      value={{
        connect,
        disconnect,
        sendMessage,
        isConnected,
        isProcessing,
        lastMessage,
        suggestions,
        repoMetadata,
        isReconnecting,
        statusMessage,
        streamingContent,
        isStreaming,
        errorMessage,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
