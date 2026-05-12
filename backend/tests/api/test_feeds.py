"""
Tests for the saved-feeds endpoints.
"""

from datetime import UTC, datetime, timedelta

import pytest
from app.models import Feed, FeedItem, JackettInstance
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


def _payload(
    *,
    name: str = "Freeleech Watch",
    description: str | None = "Daily check",
    indexers: list[dict] | None = None,
    filters: dict | None = None,
    sort_strategy: str | None = None,
    poll_interval_minutes: int | None = None,
    retention_days: int | None = None,
    polling_enabled: bool | None = None,
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
    if sort_strategy is not None:
        body["sort_strategy"] = sort_strategy
    if poll_interval_minutes is not None:
        body["poll_interval_minutes"] = poll_interval_minutes
    if retention_days is not None:
        body["retention_days"] = retention_days
    if polling_enabled is not None:
        body["polling_enabled"] = polling_enabled
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
        # Default sort strategy is date_desc when omitted from the payload.
        assert data["sort_strategy"] == "date_desc"

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
    async def test_update_with_unchanged_indexers_is_idempotent(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """
        Saving a feed without changing the indexer set must not violate the
        ``(feed_id, source_type, source_instance_id, indexer_id)`` unique
        constraint — common case when the user only renames the feed or
        adjusts a filter.
        """
        ref = {
            "source_type": "jackett",
            "source_instance_id": jackett_instance.id,
            "source_instance_name": jackett_instance.name,
            "indexer_id": "ip",
            "indexer_name": "IP",
        }
        created = await client.post("/api/v1/feeds", json=_payload(indexers=[ref]))
        feed_id = created.json()["id"]

        response = await client.put(
            f"/api/v1/feeds/{feed_id}",
            json={
                "name": "Renamed",
                "filters": {
                    "category": "All",
                    "freeleech_only": True,
                    "min_seeders": 0,
                    "min_size_bytes": None,
                    "max_size_bytes": None,
                    "include_regex": None,
                    "exclude_regex": None,
                },
                "indexers": [ref],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Renamed"
        assert data["filters"]["freeleech_only"] is True
        assert len(data["indexers"]) == 1

    @pytest.mark.asyncio
    async def test_update_partially_overlapping_indexers(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """Adding one indexer and removing another while keeping shared ones."""
        keep = {
            "source_type": "jackett",
            "source_instance_id": jackett_instance.id,
            "source_instance_name": jackett_instance.name,
            "indexer_id": "keep",
            "indexer_name": "Keep",
        }
        drop = {
            "source_type": "jackett",
            "source_instance_id": jackett_instance.id,
            "source_instance_name": jackett_instance.name,
            "indexer_id": "drop",
            "indexer_name": "Drop",
        }
        added = {
            "source_type": "jackett",
            "source_instance_id": jackett_instance.id,
            "source_instance_name": jackett_instance.name,
            "indexer_id": "added",
            "indexer_name": "Added",
        }
        created = await client.post("/api/v1/feeds", json=_payload(indexers=[keep, drop]))
        feed_id = created.json()["id"]

        response = await client.put(
            f"/api/v1/feeds/{feed_id}",
            json={"indexers": [keep, added]},
        )
        assert response.status_code == 200
        ids = sorted(i["indexer_id"] for i in response.json()["indexers"])
        assert ids == ["added", "keep"]

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
        assert any("still configured" in e["message"] for e in data["errors"])

    @pytest.mark.asyncio
    async def test_create_feed_accepts_indexer_order_strategy(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        response = await client.post(
            "/api/v1/feeds",
            json=_payload(
                sort_strategy="indexer_order",
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "ip",
                        "indexer_name": "IP",
                    }
                ],
            ),
        )
        assert response.status_code == 201
        assert response.json()["sort_strategy"] == "indexer_order"

    @pytest.mark.asyncio
    async def test_create_feed_rejects_invalid_strategy(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        response = await client.post(
            "/api/v1/feeds",
            json=_payload(
                sort_strategy="alphabetic",
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "ip",
                        "indexer_name": "IP",
                    }
                ],
            ),
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_feed_changes_sort_strategy(
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
        assert created.json()["sort_strategy"] == "date_desc"

        response = await client.put(
            f"/api/v1/feeds/{feed_id}",
            json={"sort_strategy": "indexer_order"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["sort_strategy"] == "indexer_order"
        # Indexers are preserved across the partial update.
        assert len(data["indexers"]) == 1


class TestFeedsPolling:
    """Polling-config CRUD: poll interval, retention, enabled toggle."""

    @pytest.mark.asyncio
    async def test_create_feed_has_polling_defaults(
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
                        "indexer_id": "ip",
                        "indexer_name": "IP",
                    }
                ]
            ),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["poll_interval_minutes"] == 15
        assert data["retention_days"] == 30
        assert data["polling_enabled"] is True
        assert data["last_polled_at"] is None
        # stale_after_seconds = max(3600, 15*60*4) = 3600
        assert data["stale_after_seconds"] == 3600

    @pytest.mark.asyncio
    async def test_create_feed_with_explicit_polling_fields(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        response = await client.post(
            "/api/v1/feeds",
            json=_payload(
                poll_interval_minutes=60,
                retention_days=90,
                polling_enabled=False,
                indexers=[
                    {
                        "source_type": "jackett",
                        "source_instance_id": jackett_instance.id,
                        "source_instance_name": jackett_instance.name,
                        "indexer_id": "ip",
                        "indexer_name": "IP",
                    }
                ],
            ),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["poll_interval_minutes"] == 60
        assert data["retention_days"] == 90
        assert data["polling_enabled"] is False
        # stale_after_seconds = max(3600, 60*60*4) = 14400
        assert data["stale_after_seconds"] == 14400

    @pytest.mark.asyncio
    async def test_create_rejects_poll_interval_too_short(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/feeds",
            json=_payload(poll_interval_minutes=2),
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_rejects_retention_zero(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/feeds",
            json=_payload(retention_days=0),
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_polling_fields_round_trip(
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
            json={
                "poll_interval_minutes": 30,
                "retention_days": 7,
                "polling_enabled": False,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["poll_interval_minutes"] == 30
        assert data["retention_days"] == 7
        assert data["polling_enabled"] is False


class TestFeedItemsListing:
    """Items endpoint: pagination, sort, filter."""

    async def _seed(
        self,
        session: AsyncSession,
        jackett: JackettInstance,
    ) -> int:
        feed = Feed(
            name="Seeded",
            description=None,
            category="All",
            freeleech_only=False,
            min_seeders=0,
            sort_strategy="date_desc",
            poll_interval_minutes=15,
            retention_days=30,
            polling_enabled=True,
        )
        session.add(feed)
        await session.flush()
        now = datetime.now(UTC)
        items = [
            FeedItem(
                feed_id=feed.id,
                dedup_key="url:http://a",
                first_seen_at=now - timedelta(days=2),
                last_seen_at=now - timedelta(minutes=5),
                title="Alpha 4K",
                source_type="jackett",
                source_instance_name=jackett.name,
                indexer="ip",
                size_bytes=10_000_000_000,
                seeders=50,
                leechers=2,
                freeleech=True,
                pub_date=now - timedelta(days=1),
            ),
            FeedItem(
                feed_id=feed.id,
                dedup_key="url:http://b",
                first_seen_at=now - timedelta(days=1),
                last_seen_at=now - timedelta(hours=10),
                title="Bravo 1080p",
                source_type="jackett",
                source_instance_name=jackett.name,
                indexer="ip",
                size_bytes=2_000_000_000,
                seeders=5,
                leechers=1,
                freeleech=False,
                pub_date=now - timedelta(hours=12),
            ),
            FeedItem(
                feed_id=feed.id,
                dedup_key="url:http://c",
                first_seen_at=now - timedelta(hours=4),
                last_seen_at=now - timedelta(hours=1),
                title="Charlie 720p",
                source_type="jackett",
                source_instance_name=jackett.name,
                indexer="ip",
                size_bytes=500_000_000,
                seeders=200,
                leechers=10,
                freeleech=True,
                pub_date=now - timedelta(hours=2),
            ),
        ]
        session.add_all(items)
        await session.commit()
        return feed.id

    @pytest.mark.asyncio
    async def test_list_items_default_sort_is_last_seen_desc(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        jackett_instance: JackettInstance,
    ):
        feed_id = await self._seed(db_session, jackett_instance)
        response = await client.get(f"/api/v1/feeds/{feed_id}/items")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        # Default sort last_seen desc → "a" (5m ago), "c" (1h), "b" (10h).
        assert [e["title"] for e in data["entries"]] == [
            "Alpha 4K",
            "Charlie 720p",
            "Bravo 1080p",
        ]
        assert data["feed_id"] == feed_id
        assert data["polling_enabled"] is True
        assert data["stale_after_seconds"] == 3600

    @pytest.mark.asyncio
    async def test_list_items_filter_freeleech_only(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        jackett_instance: JackettInstance,
    ):
        feed_id = await self._seed(db_session, jackett_instance)
        response = await client.get(f"/api/v1/feeds/{feed_id}/items?freeleech_only=true")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert all(e["freeleech"] for e in data["entries"])

    @pytest.mark.asyncio
    async def test_list_items_sort_by_size_asc(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        jackett_instance: JackettInstance,
    ):
        feed_id = await self._seed(db_session, jackett_instance)
        response = await client.get(f"/api/v1/feeds/{feed_id}/items?sort_by=size&sort_order=asc")
        assert response.status_code == 200
        data = response.json()
        assert [e["title"] for e in data["entries"]] == [
            "Charlie 720p",
            "Bravo 1080p",
            "Alpha 4K",
        ]

    @pytest.mark.asyncio
    async def test_list_items_pagination(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        jackett_instance: JackettInstance,
    ):
        feed_id = await self._seed(db_session, jackett_instance)
        page1 = await client.get(f"/api/v1/feeds/{feed_id}/items?limit=2&offset=0")
        page2 = await client.get(f"/api/v1/feeds/{feed_id}/items?limit=2&offset=2")
        assert page1.status_code == 200
        assert page2.status_code == 200
        assert page1.json()["total"] == 3
        assert len(page1.json()["entries"]) == 2
        assert len(page2.json()["entries"]) == 1

    @pytest.mark.asyncio
    async def test_list_items_seen_within_hours(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        jackett_instance: JackettInstance,
    ):
        feed_id = await self._seed(db_session, jackett_instance)
        # Only "a" (5m ago) and "c" (1h ago) fall inside the 2h window.
        response = await client.get(f"/api/v1/feeds/{feed_id}/items?seen_within_hours=2")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert {e["title"] for e in data["entries"]} == {"Alpha 4K", "Charlie 720p"}

    @pytest.mark.asyncio
    async def test_list_items_404_unknown_feed(self, client: AsyncClient):
        response = await client.get("/api/v1/feeds/9999/items")
        assert response.status_code == 404


class TestRefreshEndpoint:
    """The refresh endpoint shells out to the lifespan-owned poller."""

    @pytest.mark.asyncio
    async def test_refresh_503_when_poller_missing(
        self,
        client: AsyncClient,
        jackett_instance: JackettInstance,
    ):
        """
        With no poller wired onto ``app.state`` (the test fixture never starts
        lifespan), the endpoint returns 503 instead of crashing.
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

        # Make sure no poller leaked onto app.state from a previous test.
        from app.main import app

        if hasattr(app.state, "feed_poller"):
            delattr(app.state, "feed_poller")

        response = await client.post(f"/api/v1/feeds/{feed_id}/refresh")
        assert response.status_code == 503

    @pytest.mark.asyncio
    async def test_refresh_invokes_poller_and_returns_items(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        jackett_instance: JackettInstance,
    ):
        feed = Feed(
            name="With items",
            description=None,
            category="All",
            freeleech_only=False,
            min_seeders=0,
            sort_strategy="date_desc",
            poll_interval_minutes=15,
            retention_days=30,
            polling_enabled=True,
        )
        db_session.add(feed)
        await db_session.flush()
        db_session.add(
            FeedItem(
                feed_id=feed.id,
                dedup_key="url:http://x",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                title="Existing",
                source_type="jackett",
                source_instance_name=jackett_instance.name,
                indexer="ip",
                size_bytes=1,
                seeders=1,
                leechers=0,
            )
        )
        await db_session.commit()

        from app.main import app

        called_with: list[int] = []

        class FakePoller:
            async def refresh_now(self, fid: int):
                called_with.append(fid)
                return (0, 1, [])

        app.state.feed_poller = FakePoller()

        try:
            response = await client.post(f"/api/v1/feeds/{feed.id}/refresh")
            assert response.status_code == 200
            assert called_with == [feed.id]
            data = response.json()
            assert data["total"] == 1
            assert data["entries"][0]["title"] == "Existing"
        finally:
            delattr(app.state, "feed_poller")

    @pytest.mark.asyncio
    async def test_items_endpoint_surfaces_last_poll_errors(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        jackett_instance: JackettInstance,
    ):
        """``GET /feeds/{id}/items`` reports the errors recorded on the last poll."""
        feed = Feed(
            name="Errored feed",
            description=None,
            category="All",
            freeleech_only=False,
            min_seeders=0,
            sort_strategy="date_desc",
            poll_interval_minutes=15,
            retention_days=30,
            polling_enabled=True,
            last_polled_at=datetime.now(UTC),
            last_poll_errors=[
                {
                    "source": "Main Prowlarr",
                    "message": "Rate limited by the indexer — retry after 297s",
                    "source_type": "prowlarr",
                    "indexer": "REDacted",
                }
            ],
        )
        db_session.add(feed)
        await db_session.commit()

        response = await client.get(f"/api/v1/feeds/{feed.id}/items")
        assert response.status_code == 200
        data = response.json()
        assert len(data["source_errors"]) == 1
        err = data["source_errors"][0]
        assert err["source"] == "Main Prowlarr"
        assert err["indexer"] == "REDacted"
        assert "rate limited" in err["message"].lower()

    @pytest.mark.asyncio
    async def test_refresh_404_when_poller_reports_not_found(
        self,
        client: AsyncClient,
    ):
        from app.main import app

        class FakePoller:
            async def refresh_now(self, fid: int):
                from app.schemas import IndexerError

                return (0, 0, [IndexerError(source="", message="Feed not found")])

        app.state.feed_poller = FakePoller()

        try:
            response = await client.post("/api/v1/feeds/9999/refresh")
            assert response.status_code == 404
        finally:
            delattr(app.state, "feed_poller")
