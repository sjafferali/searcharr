"""
Tests for download endpoints.
"""

import pytest
from httpx import AsyncClient

from app.models import DownloadClient


class TestDownload:
    """Tests for download functionality."""

    @pytest.mark.asyncio
    async def test_download_client_not_found(self, client: AsyncClient):
        """Test sending torrent to non-existent client."""
        response = await client.post(
            "/api/v1/download",
            json={
                "client_id": 999,
                "magnet_link": "magnet:?xt=urn:btih:example",
            },
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_download_validation_no_link(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test download without magnet or torrent URL."""
        response = await client.post(
            "/api/v1/download",
            json={
                "client_id": download_client.id,
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_download_with_magnet(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test sending magnet link to client."""
        response = await client.post(
            "/api/v1/download",
            json={
                "client_id": download_client.id,
                "magnet_link": "magnet:?xt=urn:btih:EXAMPLEHASH&dn=Example",
            },
        )
        # Will fail because client is not running, but we test the endpoint works
        assert response.status_code == 400  # Authentication will fail
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_download_with_torrent_url(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test sending torrent URL to client."""
        response = await client.post(
            "/api/v1/download",
            json={
                "client_id": download_client.id,
                "torrent_url": "http://example.com/file.torrent",
            },
        )
        # Will fail because client is not running
        assert response.status_code == 400
