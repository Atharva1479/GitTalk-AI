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
                "access_token": token,
            }
