import time
from collections import defaultdict


class RateLimiter:
    """Simple in-memory sliding window rate limiter per IP."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        """Check if a request is allowed and record it if so."""
        now = time.monotonic()
        timestamps = self._requests[key]

        # Remove expired timestamps
        cutoff = now - self.window_seconds
        self._requests[key] = [t for t in timestamps if t > cutoff]
        timestamps = self._requests[key]

        if len(timestamps) >= self.max_requests:
            return False

        timestamps.append(now)
        return True

    def cleanup(self) -> None:
        """Remove stale entries to prevent memory leaks."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        stale_keys = [
            key for key, timestamps in self._requests.items()
            if not timestamps or timestamps[-1] <= cutoff
        ]
        for key in stale_keys:
            del self._requests[key]


# Rate limiters for different endpoints
# WebSocket connections: 10 per minute per IP (prevents rapid reconnect abuse)
ws_connect_limiter = RateLimiter(max_requests=10, window_seconds=60)

# Chat queries: 30 per hour per IP
chat_query_limiter = RateLimiter(max_requests=30, window_seconds=3600)

# Auth endpoints: 20 per minute per IP (prevents OAuth abuse)
auth_limiter = RateLimiter(max_requests=20, window_seconds=60)

# Repo fetch: 15 per minute per IP
repo_fetch_limiter = RateLimiter(max_requests=15, window_seconds=60)
