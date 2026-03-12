"""Package registry lookup service for npm, PyPI, Maven, crates.io, RubyGems, Go."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable

import requests as http_requests

logger = logging.getLogger(__name__)

SUPPORTED_ECOSYSTEMS: set[str] = {"npm", "PyPI", "crates.io", "Maven", "RubyGems", "Go"}

REQUEST_TIMEOUT = 10  # seconds
MAX_RETRIES = 2


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class PackageInfo:
    """Metadata resolved from a package registry."""

    name: str
    version: str
    ecosystem: str
    spdx_license: str | None = None
    source_url: str | None = None
    tarball_url: str | None = None


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def _get_with_retry(
    url: str,
    retries: int = MAX_RETRIES,
    headers: dict[str, str] | None = None,
) -> http_requests.Response | None:
    """GET *url* with retries on 429 / 5xx. Returns Response or None."""
    for attempt in range(retries + 1):
        try:
            resp = http_requests.get(url, timeout=REQUEST_TIMEOUT, headers=headers or {})
            if resp.status_code == 429:
                wait = min(2 ** attempt, 8)
                logger.warning("Rate-limited (429) on %s, backing off %ds", url, wait)
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                logger.warning("Server error %d on %s, retrying", resp.status_code, url)
                time.sleep(1)
                continue
            if resp.status_code >= 400:
                logger.debug("Client error %d on %s", resp.status_code, url)
                return None
            return resp
        except http_requests.exceptions.Timeout:
            logger.warning("Request timed out for %s (attempt %d/%d)", url, attempt + 1, retries + 1)
        except http_requests.exceptions.ConnectionError:
            logger.warning("Connection error for %s (attempt %d/%d)", url, attempt + 1, retries + 1)
        except http_requests.exceptions.RequestException as exc:
            logger.warning("Request failed for %s: %s", url, exc)
            break  # non-retryable
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean_git_url(url: str | None) -> str | None:
    """Strip git+ prefix and .git suffix from repository URLs."""
    if not url:
        return None
    if url.startswith("git+"):
        url = url[4:]
    if url.startswith("git://"):
        url = "https://" + url[6:]
    return url


# ---------------------------------------------------------------------------
# Per-ecosystem fetchers
# ---------------------------------------------------------------------------

def _fetch_npm(name: str, version: str) -> PackageInfo | None:
    """Fetch package info from npm registry."""
    url = f"https://registry.npmjs.org/{name}/{version}"
    resp = _get_with_retry(url)
    if resp is None:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None

    spdx = data.get("license")
    if isinstance(spdx, dict):
        spdx = spdx.get("type")

    repo_url: str | None = None
    repo = data.get("repository")
    if isinstance(repo, dict):
        repo_url = _clean_git_url(repo.get("url"))
    elif isinstance(repo, str):
        repo_url = _clean_git_url(repo)

    tarball = data.get("dist", {}).get("tarball")

    return PackageInfo(
        name=data.get("name", name),
        version=data.get("version", version),
        ecosystem="npm",
        spdx_license=spdx,
        source_url=repo_url,
        tarball_url=tarball,
    )


def _fetch_pypi(name: str, version: str) -> PackageInfo | None:
    """Fetch package info from PyPI."""
    url = f"https://pypi.org/pypi/{name}/{version}/json"
    resp = _get_with_retry(url)
    if resp is None:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None

    info = data.get("info", {})
    spdx = info.get("license")

    # Try project_urls for source link
    project_urls = info.get("project_urls") or {}
    source_url = (
        project_urls.get("Source")
        or project_urls.get("Source Code")
        or project_urls.get("Repository")
        or project_urls.get("Homepage")
    )

    # Find sdist tarball
    tarball: str | None = None
    for entry in data.get("urls", []):
        if entry.get("packagetype") == "sdist":
            tarball = entry.get("url")
            break

    return PackageInfo(
        name=info.get("name", name),
        version=info.get("version", version),
        ecosystem="PyPI",
        spdx_license=spdx,
        source_url=source_url,
        tarball_url=tarball,
    )


def _fetch_crates(name: str, version: str) -> PackageInfo | None:
    """Fetch package info from crates.io."""
    url = f"https://crates.io/api/v1/crates/{name}/{version}"
    resp = _get_with_retry(url)
    if resp is None:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None

    ver = data.get("version", {})
    spdx = ver.get("license")
    crate = data.get("crate", ver.get("crate_meta", {}))
    repo_url = None
    if isinstance(crate, dict):
        repo_url = crate.get("repository")

    dl_path = ver.get("dl_path")
    tarball = f"https://crates.io{dl_path}" if dl_path else None

    return PackageInfo(
        name=name,
        version=version,
        ecosystem="crates.io",
        spdx_license=spdx,
        source_url=repo_url,
        tarball_url=tarball,
    )


def _fetch_rubygems(name: str, version: str) -> PackageInfo | None:
    """Fetch package info from RubyGems."""
    url = f"https://rubygems.org/api/v1/gems/{name}.json"
    resp = _get_with_retry(url)
    if resp is None:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None

    licenses = data.get("licenses") or []
    spdx = licenses[0] if licenses else None
    source_url = data.get("source_code_uri") or data.get("homepage_uri")
    gem_uri = data.get("gem_uri")

    return PackageInfo(
        name=data.get("name", name),
        version=data.get("version", version),
        ecosystem="RubyGems",
        spdx_license=spdx,
        source_url=source_url,
        tarball_url=gem_uri,
    )


def _fetch_go(name: str, version: str) -> PackageInfo | None:
    """Fetch package info from Go module proxy."""
    url = f"https://proxy.golang.org/{name}/@v/{version}.info"
    resp = _get_with_retry(url)
    if resp is None:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None

    # Go proxy only provides version + timestamp; derive source URL from module path
    source_url = f"https://{name}" if not name.startswith("http") else name
    zip_url = f"https://proxy.golang.org/{name}/@v/{version}.zip"

    return PackageInfo(
        name=name,
        version=data.get("Version", version),
        ecosystem="Go",
        spdx_license=None,  # Go proxy doesn't provide license info
        source_url=source_url,
        tarball_url=zip_url,
    )


def _fetch_maven(name: str, version: str) -> PackageInfo | None:
    """Fetch package info from Maven Central.

    Expects *name* in ``groupId:artifactId`` format.
    """
    parts = name.split(":")
    if len(parts) != 2:
        logger.warning("Maven name must be groupId:artifactId, got %r", name)
        return None

    group_id, artifact_id = parts
    group_path = group_id.replace(".", "/")
    url = (
        f"https://search.maven.org/solrsearch/select"
        f"?q=g:{group_id}+AND+a:{artifact_id}+AND+v:{version}&rows=1&wt=json"
    )
    resp = _get_with_retry(url)
    if resp is None:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None

    docs = data.get("response", {}).get("docs", [])
    if not docs:
        return None

    doc = docs[0]
    # Maven Central search doesn't reliably provide license; set None
    pom_url = (
        f"https://repo1.maven.org/maven2/{group_path}/{artifact_id}/{version}"
        f"/{artifact_id}-{version}.pom"
    )
    jar_url = (
        f"https://repo1.maven.org/maven2/{group_path}/{artifact_id}/{version}"
        f"/{artifact_id}-{version}.jar"
    )

    return PackageInfo(
        name=name,
        version=version,
        ecosystem="Maven",
        spdx_license=None,
        source_url=pom_url,
        tarball_url=jar_url,
    )


# ---------------------------------------------------------------------------
# Fetcher dispatch
# ---------------------------------------------------------------------------

_FETCHERS: dict[str, Callable[[str, str], PackageInfo | None]] = {
    "npm": _fetch_npm,
    "PyPI": _fetch_pypi,
    "crates.io": _fetch_crates,
    "Maven": _fetch_maven,
    "RubyGems": _fetch_rubygems,
    "Go": _fetch_go,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_package_info(name: str, version: str, ecosystem: str) -> PackageInfo | None:
    """Fetch package metadata from the appropriate registry.

    Returns ``None`` for unsupported ecosystems or on failure.
    """
    fetcher = _FETCHERS.get(ecosystem)
    if fetcher is None:
        return None
    return fetcher(name, version)


def fetch_package_source_url(name: str, version: str, ecosystem: str) -> str | None:
    """Convenience wrapper: return tarball_url or source_url for a package."""
    info = fetch_package_info(name, version, ecosystem)
    if info is None:
        return None
    return info.tarball_url or info.source_url


# ---------------------------------------------------------------------------
# RegistryClient (with optional cache)
# ---------------------------------------------------------------------------

class RegistryClient:
    """Thin wrapper around :func:`fetch_package_info` with optional cache."""

    def __init__(self, cache: Any | None = None) -> None:
        self._cache = cache

    @staticmethod
    def _cache_key(name: str, version: str, ecosystem: str) -> str:
        return f"registry:{ecosystem}:{name}:{version}"

    def fetch(self, name: str, version: str, ecosystem: str) -> PackageInfo | None:
        """Fetch package info, checking cache first."""
        if self._cache is not None:
            key = self._cache_key(name, version, ecosystem)
            try:
                cached = self._cache.get_sync(key)
                if cached is not None:
                    return cached
            except Exception:
                pass

        info = fetch_package_info(name, version, ecosystem)

        if info is not None and self._cache is not None:
            key = self._cache_key(name, version, ecosystem)
            try:
                self._cache.set_sync(key, info, ttl_seconds=3600)
            except Exception:
                pass

        return info
