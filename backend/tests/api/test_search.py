"""
Tests for search endpoints.
"""

import pytest
from app.models import JackettInstance, ProwlarrInstance
from httpx import AsyncClient


class TestSearch:
    """Tests for search functionality."""

    @pytest.mark.asyncio
    async def test_search_no_instances(self, client: AsyncClient):
        """Test searching when no instances are configured."""
        response = await client.get("/api/v1/search", params={"q": "ubuntu"})
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "ubuntu"
        assert data["total_results"] == 0
        assert data["sources_queried"] == 0
        assert any("No instances configured" in e["message"] for e in data["errors"])

    @pytest.mark.asyncio
    async def test_search_validation_empty_query(self, client: AsyncClient):
        """Test search with empty query."""
        response = await client.get("/api/v1/search", params={"q": ""})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_search_with_category(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """Test search with category filter."""
        response = await client.get(
            "/api/v1/search",
            params={"q": "ubuntu", "category": "Software"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "Software"

    @pytest.mark.asyncio
    async def test_search_with_sort_options(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """Test search with sort options."""
        response = await client.get(
            "/api/v1/search",
            params={"q": "ubuntu", "sort_by": "size", "sort_order": "asc"},
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_search_with_instance_filter(
        self,
        client: AsyncClient,
        jackett_instance: JackettInstance,
        prowlarr_instance: ProwlarrInstance,
    ):
        """Test search with specific instance IDs (non-exclusive mode)."""
        # Filter to only the Jackett instance, without exclusive_filter
        # prowlarr_ids=None means "search all prowlarr", so 2 sources queried
        response = await client.get(
            "/api/v1/search",
            params={
                "q": "ubuntu",
                "jackett_ids": [jackett_instance.id],
            },
        )
        assert response.status_code == 200
        data = response.json()
        # Without exclusive_filter, unspecified instance types still search all
        assert data["sources_queried"] == 2
        assert data["query"] == "ubuntu"

    @pytest.mark.asyncio
    async def test_search_with_exclusive_filter(
        self,
        client: AsyncClient,
        jackett_instance: JackettInstance,
        prowlarr_instance: ProwlarrInstance,
    ):
        """Test search with exclusive_filter - only searches specified instances."""
        # Filter to only the Jackett instance with exclusive_filter=true
        # This should NOT search any Prowlarr instances
        response = await client.get(
            "/api/v1/search",
            params={
                "q": "ubuntu",
                "jackett_ids": [jackett_instance.id],
                "exclusive_filter": "true",
            },
        )
        assert response.status_code == 200
        data = response.json()
        # With exclusive_filter, only the specified Jackett instance is searched
        assert data["sources_queried"] == 1
        assert data["query"] == "ubuntu"

    @pytest.mark.asyncio
    async def test_search_exclusive_filter_no_instances(
        self,
        client: AsyncClient,
        jackett_instance: JackettInstance,
        prowlarr_instance: ProwlarrInstance,
    ):
        """Test search with exclusive_filter and no instances specified."""
        # exclusive_filter=true with no instance IDs means search nothing
        response = await client.get(
            "/api/v1/search",
            params={
                "q": "ubuntu",
                "exclusive_filter": "true",
            },
        )
        assert response.status_code == 200
        data = response.json()
        # No instances searched
        assert data["sources_queried"] == 0
        assert any("No instances configured" in e["message"] for e in data["errors"])

    @pytest.mark.asyncio
    async def test_search_with_indexer_filter(
        self,
        client: AsyncClient,
        jackett_instance: JackettInstance,
        prowlarr_instance: ProwlarrInstance,
    ):
        """Test that search accepts per-instance indexer filters."""
        response = await client.get(
            "/api/v1/search",
            params={
                "q": "ubuntu",
                "jackett_ids": [jackett_instance.id],
                "prowlarr_ids": [prowlarr_instance.id],
                "jackett_indexers": [f"{jackett_instance.id}:1337x"],
                "prowlarr_indexers": [f"{prowlarr_instance.id}:42"],
                "exclusive_filter": "true",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["sources_queried"] == 2

    @pytest.mark.asyncio
    async def test_search_indexer_filter_ignores_malformed(
        self,
        client: AsyncClient,
        jackett_instance: JackettInstance,
    ):
        """Malformed indexer filter strings should be ignored, not raise."""
        response = await client.get(
            "/api/v1/search",
            params={
                "q": "ubuntu",
                "jackett_ids": [jackett_instance.id],
                "jackett_indexers": ["bogus", "not-a-pair", ":missing-instance"],
                "exclusive_filter": "true",
            },
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_search_invalid_category(self, client: AsyncClient):
        """Test search with invalid category."""
        response = await client.get(
            "/api/v1/search",
            params={"q": "ubuntu", "category": "InvalidCategory"},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_search_invalid_sort_by(self, client: AsyncClient):
        """Test search with invalid sort field."""
        response = await client.get(
            "/api/v1/search",
            params={"q": "ubuntu", "sort_by": "invalid"},
        )
        assert response.status_code == 422


class TestCategories:
    """Tests for categories endpoint."""

    @pytest.mark.asyncio
    async def test_get_categories(self, client: AsyncClient):
        """Test getting available categories."""
        response = await client.get("/api/v1/search/categories")
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        categories = data["categories"]
        assert "All" in categories
        assert "Movies" in categories
        assert "TV" in categories
        assert "Software" in categories
        assert "Games" in categories
