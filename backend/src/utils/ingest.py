from gitingest import ingest_async  # type: ignore
import aiohttp
import asyncio
import logging
import shutil
import tempfile


async def check_repo_accessible(repo_url: str, github_token: str | None = None) -> bool | None:
    """Check if a repository exists and is accessible via the GitHub API.
    Returns True if accessible, False if confirmed inaccessible, None if unknown (rate-limited/error)."""
    api_url = repo_url.replace("github.com", "api.github.com/repos")
    headers: dict[str, str] = {}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(api_url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 200:
                    return True
                if response.status in (404, 401):
                    return False
                # 403 (rate limit), 5xx, etc. — unknown
                logging.warning(f"GitHub API returned {response.status} for {repo_url}")
                return None
        except Exception:
            return None


async def fetch_repo_metadata(repo_url: str, github_token: str | None = None) -> dict:
    """Fetch repository metadata (description, language, stars, last updated).
    Returns {} on failure since metadata is non-critical."""
    api_url = repo_url.replace("github.com", "api.github.com/repos")
    headers: dict[str, str] = {}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(api_url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 200:
                    data = await response.json()
                    return {
                        "description": data.get("description"),
                        "language": data.get("language"),
                        "stargazers_count": data.get("stargazers_count", 0),
                        "updated_at": data.get("updated_at"),
                    }
        except Exception:
            pass
    return {}


async def clone_private_repo(repo_url: str, github_token: str) -> str:
    """Shallow-clone a private repo using the user's token. Returns the temp dir path."""
    # Extract owner/repo from URL
    parts = repo_url.rstrip("/").split("github.com/")[-1]
    clone_url = f"https://x-access-token:{github_token}@github.com/{parts}.git"

    tmp_dir = tempfile.mkdtemp(prefix="ttg_clone_")
    proc = await asyncio.create_subprocess_exec(
        "git", "clone", "--depth", "1", clone_url, tmp_dir,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        error_msg = stderr.decode().strip()
        logging.error(f"Failed to clone {repo_url}: {error_msg}")
        raise ValueError("error:repo_not_found")

    return tmp_dir


async def ingest_repo(repo_url: str, github_token: str | None = None) -> tuple[str, str, str]:
    """
    Converts a GitHub repository into LLM-friendly format.

    Args:
        repo_url: The URL of the repository to ingest.
        github_token: Optional GitHub access token for private repos.

    Returns:
        A tuple containing (summary, folder_structure, file_contents).

    Raises:
        ValueError: If the repo is too large, not found, or private.
    """
    # Check if repository exists and is accessible
    accessible = await check_repo_accessible(repo_url, github_token)
    if accessible is False:
        # Confirmed inaccessible (404/401)
        if github_token:
            is_public = await check_repo_accessible(repo_url, None)
            if is_public is False:
                raise ValueError("error:repo_not_installed")
            raise ValueError("error:repo_not_found")
        raise ValueError("error:repo_not_found")
    # If accessible is None (rate-limited/error), skip the pre-check and try ingesting directly

    # For private repos (token provided), clone locally first
    clone_dir: str | None = None
    try:
        if github_token:
            # Check if the repo is private by trying without token
            is_public = await check_repo_accessible(repo_url, None)
            if is_public is True:
                # Confirmed public — direct ingest (faster, no clone needed)
                ingest_source = repo_url
            else:
                # Private (False) or unknown/rate-limited (None) — clone with token
                clone_dir = await clone_private_repo(repo_url, github_token)
                ingest_source = clone_dir
        else:
            ingest_source = repo_url

        summary, tree, content = await ingest_async(
            ingest_source, exclude_patterns={"tests/*", "docs/*"}
        )

        # Check if token count exceeds limit
        if "Estimated tokens: " in summary:
            tokens_str = summary.split("Estimated tokens: ")[-1].strip()
            if tokens_str.endswith("M"):
                raise ValueError("error:repo_too_large")
            elif tokens_str.endswith("K"):
                tokens = float(tokens_str[:-1])
                if tokens > 750:
                    raise ValueError("error:repo_too_large")

        return summary, tree, content
    except ValueError:
        raise
    except Exception as e:
        error_str = str(e)
        if "Repository not found" in error_str or "Not Found" in error_str:
            if not github_token:
                raise ValueError("error:repo_private")
            raise ValueError("error:repo_not_found")
        if "Bad credentials" in error_str or "API rate limit exceeded" in error_str:
            raise ValueError("error:repo_private")
        logging.error(f"Unexpected error ingesting {repo_url}: {e}")
        raise
    finally:
        if clone_dir:
            shutil.rmtree(clone_dir, ignore_errors=True)
