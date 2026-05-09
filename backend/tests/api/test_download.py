"""
Tests for download endpoints.
"""

import pytest
from app.models import DownloadClient, DownloadHistory
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def _payload(**overrides):
    base = {
        "client_id": 1,
        "magnet_link": "magnet:?xt=urn:btih:EXAMPLEHASH&dn=Example",
        "title": "Ubuntu 24.04 LTS Desktop",
        "size_bytes": 5_000_000_000,
        "info_url": "http://example.com/info",
        "source_type": "jackett",
        "source_instance_id": 1,
        "source_instance_name": "Test Jackett",
        "indexer": "rarbg",
        "search_query": "ubuntu",
    }
    base.update(overrides)
    return base


class TestDownload:
    """Tests for download functionality."""

    @pytest.mark.asyncio
    async def test_download_client_not_found(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/download",
            json=_payload(client_id=999),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_download_validation_no_link(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        response = await client.post(
            "/api/v1/download",
            json=_payload(client_id=download_client.id, magnet_link=None, torrent_url=None),
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_download_validation_missing_metadata(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        response = await client.post(
            "/api/v1/download",
            json={
                "client_id": download_client.id,
                "magnet_link": "magnet:?xt=urn:btih:EXAMPLEHASH",
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_download_with_magnet(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        download_client: DownloadClient,
    ):
        response = await client.post(
            "/api/v1/download",
            json=_payload(client_id=download_client.id),
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data

        rows = (await db_session.execute(select(DownloadHistory))).scalars().all()
        assert len(rows) == 1
        assert rows[0].status.value == "failed"
        assert rows[0].action.value == "sent_to_client"
        assert rows[0].title == "Ubuntu 24.04 LTS Desktop"
        assert rows[0].client_name == download_client.name
        assert rows[0].error_message

    @pytest.mark.asyncio
    async def test_download_with_torrent_url(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        download_client: DownloadClient,
    ):
        response = await client.post(
            "/api/v1/download",
            json=_payload(
                client_id=download_client.id,
                magnet_link=None,
                torrent_url="http://example.com/file.torrent",
            ),
        )
        assert response.status_code == 400

        rows = (await db_session.execute(select(DownloadHistory))).scalars().all()
        assert len(rows) == 1
        assert rows[0].torrent_url == "http://example.com/file.torrent"
        assert rows[0].status.value == "failed"
