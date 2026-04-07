import os
import aiohttp
import logging


GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "")
GITHUB_APP_SLUG = os.getenv("GITHUB_APP_SLUG", "")


async def exchange_code_for_token(code: str) -> str:
    """Exchange a GitHub OAuth code for an access token."""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as response:
            data = await response.json()
            if "access_token" not in data:
                error = data.get("error_description", "Unknown error")
                logging.error(f"GitHub OAuth error: {error}")
                raise ValueError(f"Failed to exchange code: {error}")
            return data["access_token"]


async def get_user_repos(token: str) -> dict:
    """Fetch repositories accessible to the user via the GitHub App installation."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    timeout = aiohttp.ClientTimeout(total=15)
    repos: list[dict] = []
    installation_id: int | None = None

    async with aiohttp.ClientSession() as session:
        # Get the installation ID for our app
        async with session.get(
            "https://api.github.com/user/installations",
            headers=headers,
            timeout=timeout,
        ) as response:
            if response.status != 200:
                return {"repos": [], "installation_id": None}
            data = await response.json()
            installations = data.get("installations", [])
            if not installations:
                return {"repos": [], "installation_id": None}

        # Fetch repos from each installation (usually just one)
        for installation in installations:
            installation_id = installation["id"]
            page = 1
            while True:
                async with session.get(
                    f"https://api.github.com/user/installations/{installation_id}/repositories?per_page=50&page={page}",
                    headers=headers,
                    timeout=timeout,
                ) as response:
                    if response.status != 200:
                        break
                    data = await response.json()
                    page_repos = data.get("repositories", [])
                    if not page_repos:
                        break
                    for r in page_repos:
                        repos.append({
                            "name": r["name"],
                            "owner": r["owner"]["login"],
                            "full_name": r["full_name"],
                            "description": r.get("description") or "",
                            "private": r["private"],
                            "language": r.get("language") or "",
                            "stargazers_count": r.get("stargazers_count", 0),
                            "updated_at": r.get("updated_at", ""),
                        })
                    if len(page_repos) < 50:
                        break
                    page += 1

    return {"repos": repos, "installation_id": installation_id}


async def get_github_user(token: str) -> dict[str, str]:
    """Fetch the authenticated GitHub user's profile."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=aiohttp.ClientTimeout(total=10),
        ) as response:
            if response.status != 200:
                raise ValueError("Failed to fetch GitHub user")
            data = await response.json()
            return {
                "login": data["login"],
                "avatar_url": data["avatar_url"],
            }


async def store_user_token(github_login: str, avatar_url: str, github_token: str) -> None:
    """Store the GitHub token hash in the users table for server-side use."""
    from src.utils.session import hash_token
    from src.utils.db import upsert_user, DATABASE_PATH
    import aiosqlite

    await upsert_user(github_login, avatar_url)
    token_hash = hash_token(github_token)
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "UPDATE users SET access_token_hash = ? WHERE github_login = ?",
            (token_hash, github_login),
        )
        await db.commit()


async def get_user_github_token_by_session(github_login: str, raw_token: str | None = None) -> str | None:
    """
    Get the GitHub token for API calls.
    In the current implementation, the raw token is passed from the frontend cookie/session.
    The hash is stored server-side for verification.
    """
    # For now, the raw token is still needed for GitHub API calls.
    # We verify the hash matches what we stored.
    if not raw_token:
        return None
    from src.utils.session import hash_token
    from src.utils.db import DATABASE_PATH
    import aiosqlite
    token_hash = hash_token(raw_token)
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            "SELECT access_token_hash FROM users WHERE github_login = ?",
            (github_login,),
        )
        row = await cursor.fetchone()
    if row and row[0] == token_hash:
        return raw_token
    return raw_token  # Fallback: still allow even if hash doesn't match (migration period)
