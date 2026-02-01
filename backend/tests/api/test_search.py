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
        assert "No instances configured" in data["errors"]

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
    async def test_search_with_min_seeders(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """Test search with minimum seeders filter."""
        response = await client.get(
            "/api/v1/search",
            params={"q": "ubuntu", "min_seeders": 10},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "ubuntu"

    @pytest.mark.asyncio
    async def test_search_with_max_size(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """Test search with max size filter."""
        response = await client.get(
            "/api/v1/search",
            params={"q": "ubuntu", "max_size": "10GB"},
        )
        assert response.status_code == 200

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
        """Test search with specific instance IDs."""
        # Filter to only the Jackett instance
        response = await client.get(
            "/api/v1/search",
            params={
                "q": "ubuntu",
                "jackett_ids": [jackett_instance.id],
            },
        )
        assert response.status_code == 200
        data = response.json()
        # Both instances exist, but only specified Jackett should be in jackett search
        # prowlarr_ids=None means "search all prowlarr", so 2 sources queried
        assert data["sources_queried"] == 2
        assert data["query"] == "ubuntu"

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
