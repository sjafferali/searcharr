"""
Tests for download history endpoints.
"""

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from app.models import DownloadHistory, HistoryAction, HistoryStatus
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def _entry(
    *,
    title: str = "Ubuntu 24.04 LTS",
    action: HistoryAction = HistoryAction.SENT_TO_CLIENT,
    source_type: str = "jackett",
    source_instance_id: int | None = 1,
    source_instance_name: str = "Test Jackett",
    indexer: str = "rarbg",
    client_id: int | None = 1,
    client_name: str | None = "qbit-main",
    status: HistoryStatus = HistoryStatus.SUCCESS,
    size_bytes: int | None = 4_700_000_000,
    occurred_at: datetime | None = None,
    error_message: str | None = None,
    search_query: str | None = "ubuntu",
) -> DownloadHistory:
    entry = DownloadHistory(
        title=title,
        action=action,
        status=status,
        source_type=source_type,
        source_instance_id=source_instance_id,
        source_instance_name=source_instance_name,
        indexer=indexer,
        client_id=client_id,
        client_name=client_name,
        size_bytes=size_bytes,
        info_url="http://example.com/info",
        torrent_url="http://example.com/file.torrent",
        magnet_link="magnet:?xt=urn:btih:EXAMPLEHASH",
        search_query=search_query,
        error_message=error_message,
    )
    if occurred_at is not None:
        entry.occurred_at = occurred_at
    return entry


@pytest_asyncio.fixture
async def seeded_history(db_session: AsyncSession) -> list[DownloadHistory]:
    base_time = datetime(2026, 5, 9, 12, 0, 0, tzinfo=UTC)
    entries = [
        _entry(
            title="Ubuntu 24.04 LTS",
            action=HistoryAction.SENT_TO_CLIENT,
            source_type="jackett",
            source_instance_id=1,
            source_instance_name="Test Jackett",
            indexer="rarbg",
            client_id=1,
            client_name="qbit-main",
            occurred_at=base_time,
        ),
        _entry(
            title="The Office S03E14",
            action=HistoryAction.DOWNLOADED_TORRENT,
            source_type="prowlarr",
            source_instance_id=2,
            source_instance_name="Test Prowlarr",
            indexer="1337x",
            client_id=None,
            client_name=None,
            occurred_at=base_time - timedelta(hours=1),
            search_query="the office",
        ),
        _entry(
            title="Failed Movie",
            action=HistoryAction.SENT_TO_CLIENT,
            source_type="jackett",
            source_instance_id=1,
            source_instance_name="Test Jackett",
            indexer="rarbg",
            client_id=1,
            client_name="qbit-main",
            status=HistoryStatus.FAILED,
            error_message="connection refused",
            occurred_at=base_time - timedelta(hours=2),
            search_query="action movie",
        ),
    ]
    for entry in entries:
        db_session.add(entry)
    await db_session.commit()
    for entry in entries:
        await db_session.refresh(entry)
    return entries


class TestHistoryCreate:
    @pytest.mark.asyncio
    async def test_create_downloaded_torrent_entry(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        response = await client.post(
            "/api/v1/history",
            json={
                "title": "Big Buck Bunny 4K",
                "size_bytes": 2_100_000_000,
                "info_url": "http://example.com/bbb",
                "torrent_url": "http://example.com/bbb.torrent",
                "source_type": "jackett",
                "source_instance_id": 1,
                "source_instance_name": "Test Jackett",
                "indexer": "tpb",
                "search_query": "big buck bunny",
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["title"] == "Big Buck Bunny 4K"
        assert body["action"] == "downloaded_torrent"
        assert body["status"] == "success"
        assert body["size_formatted"]

        rows = (await db_session.execute(select(DownloadHistory))).scalars().all()
        assert len(rows) == 1

    @pytest.mark.asyncio
    async def test_create_requires_title(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/history",
            json={
                "title": "",
                "source_type": "jackett",
                "source_instance_name": "Test Jackett",
                "indexer": "rarbg",
            },
        )
        assert response.status_code == 422


class TestHistoryList:
    @pytest.mark.asyncio
    async def test_list_returns_newest_first(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.get("/api/v1/history")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert data["limit"] == 50
        assert data["offset"] == 0
        titles = [e["title"] for e in data["entries"]]
        assert titles == ["Ubuntu 24.04 LTS", "The Office S03E14", "Failed Movie"]

    @pytest.mark.asyncio
    async def test_list_filter_by_action(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.get("/api/v1/history", params={"action": "downloaded_torrent"})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["entries"][0]["title"] == "The Office S03E14"

    @pytest.mark.asyncio
    async def test_list_filter_by_source_type(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.get("/api/v1/history", params={"source_type": "jackett"})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2

    @pytest.mark.asyncio
    async def test_list_filter_by_status(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.get("/api/v1/history", params={"status": "failed"})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["entries"][0]["error_message"] == "connection refused"

    @pytest.mark.asyncio
    async def test_list_filter_by_query(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.get("/api/v1/history", params={"q": "ubuntu"})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["entries"][0]["title"] == "Ubuntu 24.04 LTS"

    @pytest.mark.asyncio
    async def test_list_filter_by_query_matches_search_query(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.get("/api/v1/history", params={"q": "action"})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["entries"][0]["title"] == "Failed Movie"

    @pytest.mark.asyncio
    async def test_list_pagination(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.get("/api/v1/history", params={"limit": 2, "offset": 1})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert data["limit"] == 2
        assert data["offset"] == 1
        assert len(data["entries"]) == 2

    @pytest.mark.asyncio
    async def test_list_filter_by_date_range(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        cutoff = datetime(2026, 5, 9, 10, 30, 0, tzinfo=UTC)
        response = await client.get("/api/v1/history", params={"since": cutoff.isoformat()})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2

    @pytest.mark.asyncio
    async def test_list_sort_by_title_asc(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.get(
            "/api/v1/history", params={"sort_by": "title", "sort_order": "asc"}
        )
        assert response.status_code == 200
        data = response.json()
        titles = [e["title"] for e in data["entries"]]
        assert titles == sorted(titles)

    @pytest.mark.asyncio
    async def test_list_filter_by_min_size_excludes_smaller(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        # Three entries with distinct sizes.
        sizes = [500_000_000, 4_700_000_000, 50_000_000_000]
        for s in sizes:
            db_session.add(_entry(title=f"row-{s}", size_bytes=s))
        await db_session.commit()

        response = await client.get("/api/v1/history", params={"min_size_bytes": 1_000_000_000})
        assert response.status_code == 200
        returned = sorted(e["size_bytes"] for e in response.json()["entries"])
        assert returned == [4_700_000_000, 50_000_000_000]

    @pytest.mark.asyncio
    async def test_list_filter_by_max_size_excludes_larger(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        sizes = [500_000_000, 4_700_000_000, 50_000_000_000]
        for s in sizes:
            db_session.add(_entry(title=f"row-{s}", size_bytes=s))
        await db_session.commit()

        response = await client.get("/api/v1/history", params={"max_size_bytes": 5_000_000_000})
        assert response.status_code == 200
        returned = sorted(e["size_bytes"] for e in response.json()["entries"])
        assert returned == [500_000_000, 4_700_000_000]

    @pytest.mark.asyncio
    async def test_list_filter_by_size_range(self, client: AsyncClient, db_session: AsyncSession):
        sizes = [500_000_000, 4_700_000_000, 50_000_000_000]
        for s in sizes:
            db_session.add(_entry(title=f"row-{s}", size_bytes=s))
        await db_session.commit()

        response = await client.get(
            "/api/v1/history",
            params={"min_size_bytes": 1_000_000_000, "max_size_bytes": 10_000_000_000},
        )
        assert response.status_code == 200
        returned = [e["size_bytes"] for e in response.json()["entries"]]
        assert returned == [4_700_000_000]


class TestHistoryDelete:
    @pytest.mark.asyncio
    async def test_delete_entry(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        seeded_history: list[DownloadHistory],
    ):
        target_id = seeded_history[0].id
        response = await client.delete(f"/api/v1/history/{target_id}")
        assert response.status_code == 204

        remaining = (await db_session.execute(select(DownloadHistory))).scalars().all()
        assert len(remaining) == 2
        assert all(e.id != target_id for e in remaining)

    @pytest.mark.asyncio
    async def test_delete_missing_entry(self, client: AsyncClient):
        response = await client.delete("/api/v1/history/99999")
        assert response.status_code == 404


class TestHistoryLookup:
    @pytest.mark.asyncio
    async def test_lookup_empty_input(self, client: AsyncClient):
        response = await client.post("/api/v1/history/lookup", json={"items": []})
        assert response.status_code == 200
        assert response.json() == {"matches": []}

    @pytest.mark.asyncio
    async def test_lookup_no_matches(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.post(
            "/api/v1/history/lookup",
            json={
                "items": [
                    {"title": "Nothing Like This", "size_bytes": 123, "info_url": None},
                ]
            },
        )
        assert response.status_code == 200
        assert response.json() == {"matches": []}

    @pytest.mark.asyncio
    async def test_lookup_match_by_title_and_size(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        response = await client.post(
            "/api/v1/history/lookup",
            json={
                "items": [
                    {
                        "title": "Ubuntu 24.04 LTS",
                        "size_bytes": 4_700_000_000,
                        "info_url": None,
                    },
                ]
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["matches"]) == 1
        match = data["matches"][0]
        assert match["index"] == 0
        assert match["count"] == 1
        assert match["entries"][0]["action"] == "sent_to_client"

    @pytest.mark.asyncio
    async def test_lookup_match_by_info_url(
        self, client: AsyncClient, seeded_history: list[DownloadHistory]
    ):
        # Same title is intentionally different from any seeded row; only
        # info_url should drive the match.
        response = await client.post(
            "/api/v1/history/lookup",
            json={
                "items": [
                    {
                        "title": "Different Title But Same Page",
                        "size_bytes": None,
                        "info_url": "http://example.com/info",
                    },
                ]
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["matches"]) == 1
        assert data["matches"][0]["index"] == 0
        assert data["matches"][0]["count"] == 3

    @pytest.mark.asyncio
    async def test_lookup_size_must_match_when_using_title(
        self,
        client: AsyncClient,
        seeded_history: list[DownloadHistory],
    ):
        # Same title, different size => no match (and info_url omitted).
        response = await client.post(
            "/api/v1/history/lookup",
            json={
                "items": [
                    {
                        "title": "Ubuntu 24.04 LTS",
                        "size_bytes": 999,
                        "info_url": None,
                    },
                ]
            },
        )
        assert response.status_code == 200
        assert response.json()["matches"] == []

    @pytest.mark.asyncio
    async def test_lookup_partial_batch_returns_only_matches(
        self,
        client: AsyncClient,
        seeded_history: list[DownloadHistory],
    ):
        response = await client.post(
            "/api/v1/history/lookup",
            json={
                "items": [
                    {"title": "Brand New Result", "size_bytes": 100, "info_url": None},
                    {
                        "title": "The Office S03E14",
                        "size_bytes": 4_700_000_000,
                        "info_url": None,
                    },
                ]
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["matches"]) == 1
        assert data["matches"][0]["index"] == 1


class TestHistorySurvivesInstanceDeletion:
    @pytest.mark.asyncio
    async def test_history_survives_instance_deletion(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        seeded_history: list[DownloadHistory],
    ):
        from app.models import JackettInstance
        from app.services import encrypt_credential

        instance = JackettInstance(
            name="Doomed Jackett",
            url="http://localhost:9117",
            api_key=encrypt_credential("k"),
        )
        db_session.add(instance)
        await db_session.commit()
        await db_session.refresh(instance)

        await db_session.delete(instance)
        await db_session.commit()

        response = await client.get("/api/v1/history")
        assert response.status_code == 200
        assert response.json()["total"] == 3
