"""
Tests for bookmark endpoints.
"""

import pytest
from httpx import AsyncClient


def _payload(
    *,
    title: str = "Ubuntu 24.04 LTS",
    magnet: str | None = "magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12",
    torrent_url: str | None = "http://example.com/file.torrent",
    info_url: str | None = "http://example.com/info/123",
    source_type: str = "jackett",
    source_instance_id: int | None = 1,
    source_instance_name: str = "Test Jackett",
    indexer: str = "rarbg",
    size_bytes: int | None = 4_700_000_000,
    category: str | None = "Software",
) -> dict:
    return {
        "title": title,
        "magnet_link": magnet,
        "torrent_url": torrent_url,
        "info_url": info_url,
        "source_type": source_type,
        "source_instance_id": source_instance_id,
        "source_instance_name": source_instance_name,
        "indexer": indexer,
        "size_bytes": size_bytes,
        "category": category,
    }


class TestBookmarks:
    @pytest.mark.asyncio
    async def test_create_bookmark_via_magnet(self, client: AsyncClient):
        response = await client.post("/api/v1/bookmarks", json=_payload())
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Ubuntu 24.04 LTS"
        assert data["dedup_key"] == "btih:abcdef1234567890abcdef1234567890abcdef12"
        assert data["size_formatted"]

    @pytest.mark.asyncio
    async def test_create_is_idempotent_on_dedup_key(self, client: AsyncClient):
        first = await client.post("/api/v1/bookmarks", json=_payload(title="Original"))
        second = await client.post("/api/v1/bookmarks", json=_payload(title="Different title"))
        assert first.status_code == 201
        assert second.status_code == 201
        # Second call returns the existing bookmark — title from the first save
        # is what's persisted.
        assert first.json()["id"] == second.json()["id"]
        assert second.json()["title"] == "Original"

    @pytest.mark.asyncio
    async def test_create_rejects_payload_with_no_identity(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/bookmarks",
            json=_payload(magnet=None, torrent_url=None, info_url=None),
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_list_bookmarks_returns_in_recent_order(self, client: AsyncClient):
        await client.post("/api/v1/bookmarks", json=_payload(title="First"))
        await client.post(
            "/api/v1/bookmarks",
            json=_payload(
                title="Second",
                magnet="magnet:?xt=urn:btih:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            ),
        )
        response = await client.get("/api/v1/bookmarks")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        # Default sort is created_at desc — newest first.
        assert data["entries"][0]["title"] == "Second"
        assert data["entries"][1]["title"] == "First"

    @pytest.mark.asyncio
    async def test_delete_by_id(self, client: AsyncClient):
        created = await client.post("/api/v1/bookmarks", json=_payload())
        bid = created.json()["id"]
        deleted = await client.delete(f"/api/v1/bookmarks/{bid}")
        assert deleted.status_code == 204
        listing = await client.get("/api/v1/bookmarks")
        assert listing.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_delete_by_id_404(self, client: AsyncClient):
        response = await client.delete("/api/v1/bookmarks/9999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_by_dedup_key(self, client: AsyncClient):
        await client.post("/api/v1/bookmarks", json=_payload())
        deleted = await client.delete(
            "/api/v1/bookmarks/by-key/btih:abcdef1234567890abcdef1234567890abcdef12"
        )
        assert deleted.status_code == 204
        listing = await client.get("/api/v1/bookmarks")
        assert listing.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_lookup_returns_matches_for_existing_bookmarks(self, client: AsyncClient):
        await client.post("/api/v1/bookmarks", json=_payload(title="Saved"))
        # The current search has 3 results; only the first one is bookmarked.
        response = await client.post(
            "/api/v1/bookmarks/lookup",
            json={
                "items": [
                    {"magnet_link": "magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12"},
                    {"magnet_link": "magnet:?xt=urn:btih:1111111111111111111111111111111111111111"},
                    {"info_url": "http://example.com/something-else"},
                ]
            },
        )
        assert response.status_code == 200
        matches = response.json()["matches"]
        assert "btih:abcdef1234567890abcdef1234567890abcdef12" in matches
        assert len(matches) == 1

    @pytest.mark.asyncio
    async def test_lookup_with_no_identifiable_items_returns_empty(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/bookmarks/lookup",
            json={"items": [{"magnet_link": None, "torrent_url": None, "info_url": None}]},
        )
        assert response.status_code == 200
        assert response.json()["matches"] == {}
