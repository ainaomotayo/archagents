"""Tests for package registry lookup service."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from sentinel_license.registry_lookup import (
    SUPPORTED_ECOSYSTEMS,
    PackageInfo,
    RegistryClient,
    fetch_package_info,
    fetch_package_source_url,
)


# ---------------------------------------------------------------------------
# 1. Supported ecosystems
# ---------------------------------------------------------------------------


def test_supported_ecosystems():
    """All 6 ecosystems are present."""
    expected = {"npm", "PyPI", "crates.io", "Maven", "RubyGems", "Go"}
    assert SUPPORTED_ECOSYSTEMS == expected


# ---------------------------------------------------------------------------
# 2. npm fetcher
# ---------------------------------------------------------------------------


@patch("sentinel_license.registry_lookup._get_with_retry")
def test_fetch_npm_package_info(mock_get):
    """npm fetcher extracts license, repository, and tarball URL."""
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "name": "express",
        "version": "4.18.2",
        "license": "MIT",
        "repository": {"url": "git+https://github.com/expressjs/express.git"},
        "dist": {"tarball": "https://registry.npmjs.org/express/-/express-4.18.2.tgz"},
    }
    mock_get.return_value = mock_resp

    info = fetch_package_info("express", "4.18.2", "npm")

    assert info is not None
    assert info.name == "express"
    assert info.version == "4.18.2"
    assert info.ecosystem == "npm"
    assert info.spdx_license == "MIT"
    assert info.source_url == "https://github.com/expressjs/express.git"
    assert info.tarball_url == "https://registry.npmjs.org/express/-/express-4.18.2.tgz"


# ---------------------------------------------------------------------------
# 3. PyPI fetcher
# ---------------------------------------------------------------------------


@patch("sentinel_license.registry_lookup._get_with_retry")
def test_fetch_pypi_package_info(mock_get):
    """PyPI fetcher extracts license and project URLs."""
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "info": {
            "name": "requests",
            "version": "2.31.0",
            "license": "Apache-2.0",
            "project_urls": {
                "Source": "https://github.com/psf/requests",
            },
        },
        "urls": [
            {
                "packagetype": "sdist",
                "url": "https://files.pythonhosted.org/packages/requests-2.31.0.tar.gz",
            }
        ],
    }
    mock_get.return_value = mock_resp

    info = fetch_package_info("requests", "2.31.0", "PyPI")

    assert info is not None
    assert info.name == "requests"
    assert info.version == "2.31.0"
    assert info.ecosystem == "PyPI"
    assert info.spdx_license == "Apache-2.0"
    assert info.source_url == "https://github.com/psf/requests"
    assert info.tarball_url == "https://files.pythonhosted.org/packages/requests-2.31.0.tar.gz"


# ---------------------------------------------------------------------------
# 4. Unsupported ecosystem
# ---------------------------------------------------------------------------


def test_fetch_unknown_ecosystem_returns_none():
    """Unsupported ecosystem returns None without making any HTTP call."""
    result = fetch_package_info("foo", "1.0.0", "Conan")
    assert result is None


# ---------------------------------------------------------------------------
# 5. fetch_package_source_url convenience wrapper
# ---------------------------------------------------------------------------


@patch("sentinel_license.registry_lookup._get_with_retry")
def test_fetch_package_source_url_npm(mock_get):
    """Convenience wrapper returns tarball_url (preferred) or source_url."""
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "name": "lodash",
        "version": "4.17.21",
        "license": "MIT",
        "repository": {"url": "git+https://github.com/lodash/lodash.git"},
        "dist": {"tarball": "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"},
    }
    mock_get.return_value = mock_resp

    url = fetch_package_source_url("lodash", "4.17.21", "npm")
    assert url == "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"


# ---------------------------------------------------------------------------
# 6. RegistryClient with cache
# ---------------------------------------------------------------------------


@patch("sentinel_license.registry_lookup._get_with_retry")
def test_registry_client_with_cache(mock_get):
    """RegistryClient can be constructed with cache=None and fetches correctly."""
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "name": "express",
        "version": "4.18.2",
        "license": "MIT",
        "repository": {"url": "git+https://github.com/expressjs/express.git"},
        "dist": {"tarball": "https://registry.npmjs.org/express/-/express-4.18.2.tgz"},
    }
    mock_get.return_value = mock_resp

    client = RegistryClient(cache=None)
    info = client.fetch("express", "4.18.2", "npm")

    assert info is not None
    assert info.name == "express"
