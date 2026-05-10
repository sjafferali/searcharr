"""
Tests for the saved-feeds endpoints.
"""

import pytest
from app.models import JackettInstance
from httpx import AsyncClient


def _payload(
    *,
    name: str = "Freeleech Watch",
    description: str | None = "Daily check",
    indexers: list[dict] | None = None,
    filters: dict | None = None,
) -> dict:
    if indexers is None:
        indexers = [
            {
                "source_type": "jackett",
                "source_instance_id": 1,
                "source_instance_name": "Test Jackett",
                "indexer_id": "iptorrents",
                "indexer_name": "IPTorrents",
            }
        ]
    body: dict = {"name": name, "description": description, "indexers": indexers}
    if filters is not None:
        body["filters"] = filters
    return body


class TestFeedsCRUD:
    @pytest.mark.asyncio
    async def test_create_feed_minimal(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        response = await client.post(
            "/api/v1/feeds",
            json=_payload(
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "iptorrents",
                        "indexer_name": "IPTorrents",
                    }
                ]
            ),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Freeleech Watch"
        assert len(data["indexers"]) == 1
        assert data["filters"]["category"] == "All"
        assert data["filters"]["freeleech_only"] is False

    @pytest.mark.asyncio
    async def test_create_feed_with_filters(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        response = await client.post(
            "/api/v1/feeds",
            json=_payload(
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "rd",
                        "indexer_name": "REDacted",
                    }
                ],
                filters={
                    "category": "Music",
                    "freeleech_only": True,
                    "min_seeders": 5,
                    "min_size_bytes": 100_000_000,
                    "max_size_bytes": 5_000_000_000,
                    "include_regex": "FLAC",
                    "exclude_regex": "remix",
                },
            ),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["filters"]["category"] == "Music"
        assert data["filters"]["freeleech_only"] is True
        assert data["filters"]["min_seeders"] == 5
        assert data["filters"]["include_regex"] == "FLAC"

    @pytest.mark.asyncio
    async def test_create_rejects_empty_indexers(self, client: AsyncClient):
        response = await client.post("/api/v1/feeds", json=_payload(indexers=[]))
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_rejects_blank_name(self, client: AsyncClient):
        response = await client.post("/api/v1/feeds", json=_payload(name=""))
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_feeds(self, client: AsyncClient, jackett_instance: JackettInstance):
        await client.post(
            "/api/v1/feeds",
            json=_payload(
                name="Z feed",
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "x",
                        "indexer_name": "X",
                    }
                ],
            ),
        )
        await client.post(
            "/api/v1/feeds",
            json=_payload(
                name="A feed",
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "y",
                        "indexer_name": "Y",
                    }
                ],
            ),
        )
        listing = await client.get("/api/v1/feeds")
        assert listing.status_code == 200
        body = listing.json()
        assert body["total"] == 2
        # Listing is sorted by name ascending.
        assert body["entries"][0]["name"] == "A feed"
        assert body["entries"][1]["name"] == "Z feed"

    @pytest.mark.asyncio
    async def test_get_feed(self, client: AsyncClient, jackett_instance: JackettInstance):
        created = await client.post(
            "/api/v1/feeds",
            json=_payload(
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "ip",
                        "indexer_name": "IP",
                    }
                ]
            ),
        )
        feed_id = created.json()["id"]

        response = await client.get(f"/api/v1/feeds/{feed_id}")
        assert response.status_code == 200
        assert response.json()["id"] == feed_id

    @pytest.mark.asyncio
    async def test_get_feed_404(self, client: AsyncClient):
        response = await client.get("/api/v1/feeds/9999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_feed_partial(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        created = await client.post(
            "/api/v1/feeds",
            json=_payload(
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "ip",
                        "indexer_name": "IP",
                    }
                ]
            ),
        )
        feed_id = created.json()["id"]

        response = await client.put(
            f"/api/v1/feeds/{feed_id}",
            json={"name": "Renamed"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Renamed"
        # Indexers preserved when not in the payload.
        assert len(data["indexers"]) == 1

    @pytest.mark.asyncio
    async def test_update_replaces_indexers(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        created = await client.post(
            "/api/v1/feeds",
            json=_payload(
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "old",
                        "indexer_name": "Old",
                    }
                ]
            ),
        )
        feed_id = created.json()["id"]

        response = await client.put(
            f"/api/v1/feeds/{feed_id}",
            json={
                "indexers": [
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "new1",
                        "indexer_name": "New One",
                    },
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "new2",
                        "indexer_name": "New Two",
                    },
                ]
            },
        )
        assert response.status_code == 200
        data = response.json()
        ids = sorted(i["indexer_id"] for i in data["indexers"])
        assert ids == ["new1", "new2"]

    @pytest.mark.asyncio
    async def test_delete_feed(self, client: AsyncClient, jackett_instance: JackettInstance):
        created = await client.post(
            "/api/v1/feeds",
            json=_payload(
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "ip",
                        "indexer_name": "IP",
                    }
                ]
            ),
        )
        feed_id = created.json()["id"]

        deleted = await client.delete(f"/api/v1/feeds/{feed_id}")
        assert deleted.status_code == 204

        listing = await client.get("/api/v1/feeds")
        assert listing.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_fetch_feed_with_unreachable_instances(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """
        With no real Jackett running, fetching the feed surfaces the network
        error per instance instead of throwing — exercises the error
        aggregation path.
        """
        created = await client.post(
            "/api/v1/feeds",
            json=_payload(
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "ip",
                        "indexer_name": "IP",
                    }
                ]
            ),
        )
        feed_id = created.json()["id"]

        response = await client.post(f"/api/v1/feeds/{feed_id}/fetch")
        assert response.status_code == 200
        data = response.json()
        assert data["feed_id"] == feed_id
        assert data["sources_queried"] == 1
        # No real Jackett — results may be empty, errors may or may not be set.
        assert isinstance(data["results"], list)
        assert isinstance(data["errors"], list)

    @pytest.mark.asyncio
    async def test_fetch_feed_with_no_remaining_instances(self, client: AsyncClient):
        """A feed whose referenced instances have been deleted reports 0 sources."""
        # Create the feed pointing at a non-existent instance id directly via the API.
        created = await client.post(
            "/api/v1/feeds",
            json=_payload(
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": 9999,
                        "source_instance_name": "Gone",
                        "indexer_id": "x",
                        "indexer_name": "X",
                    }
                ]
            ),
        )
        feed_id = created.json()["id"]

        response = await client.post(f"/api/v1/feeds/{feed_id}/fetch")
        assert response.status_code == 200
        data = response.json()
        assert data["sources_queried"] == 0
        assert any("still configured" in e for e in data["errors"])
