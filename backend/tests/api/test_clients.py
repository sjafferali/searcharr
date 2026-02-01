"""
Tests for download client management endpoints.
"""

import pytest
from httpx import AsyncClient

from app.models import DownloadClient


class TestDownloadClients:
    """Tests for download client CRUD operations."""

    @pytest.mark.asyncio
    async def test_list_clients_empty(self, client: AsyncClient):
        """Test listing clients when none exist."""
        response = await client.get("/api/v1/clients")
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_clients(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test listing download clients."""
        response = await client.get("/api/v1/clients")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test qBittorrent"
        assert data[0]["client_type"] == "qbittorrent"
        # Credentials should NOT be returned
        assert "username" not in data[0]
        assert "password" not in data[0]

    @pytest.mark.asyncio
    async def test_create_client(self, client: AsyncClient):
        """Test creating a new download client."""
        response = await client.post(
            "/api/v1/clients",
            json={
                "name": "New qBittorrent",
                "client_type": "qbittorrent",
                "url": "http://192.168.1.100:8080",
                "username": "admin",
                "password": "secret",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New qBittorrent"
        assert data["client_type"] == "qbittorrent"
        assert data["url"] == "http://192.168.1.100:8080"
        assert "id" in data
        assert "created_at" in data
        # Credentials should NOT be returned
        assert "username" not in data
        assert "password" not in data

    @pytest.mark.asyncio
    async def test_create_client_validation_error(self, client: AsyncClient):
        """Test creating a client with invalid data."""
        response = await client.post(
            "/api/v1/clients",
            json={
                "name": "",  # Empty name should fail
                "client_type": "qbittorrent",
                "url": "http://localhost:8080",
                "username": "admin",
                "password": "pass",
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_client_invalid_type(self, client: AsyncClient):
        """Test creating a client with invalid client type."""
        response = await client.post(
            "/api/v1/clients",
            json={
                "name": "Test",
                "client_type": "invalid_type",
                "url": "http://localhost:8080",
                "username": "admin",
                "password": "pass",
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_client(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test getting a specific download client."""
        response = await client.get(f"/api/v1/clients/{download_client.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == download_client.id
        assert data["name"] == "Test qBittorrent"

    @pytest.mark.asyncio
    async def test_get_client_not_found(self, client: AsyncClient):
        """Test getting a non-existent client."""
        response = await client.get("/api/v1/clients/999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_client(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test updating a download client."""
        response = await client.put(
            f"/api/v1/clients/{download_client.id}",
            json={"name": "Updated qBittorrent"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated qBittorrent"
        assert data["url"] == "http://localhost:8080"  # Unchanged

    @pytest.mark.asyncio
    async def test_update_client_password(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test updating a client's password."""
        response = await client.put(
            f"/api/v1/clients/{download_client.id}",
            json={"password": "new-secure-password"},
        )
        assert response.status_code == 200
        # Password should be updated (we can't verify directly, but no error means success)

    @pytest.mark.asyncio
    async def test_update_client_not_found(self, client: AsyncClient):
        """Test updating a non-existent client."""
        response = await client.put(
            "/api/v1/clients/999",
            json={"name": "Updated"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_client(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test deleting a download client."""
        response = await client.delete(f"/api/v1/clients/{download_client.id}")
        assert response.status_code == 204

        # Verify it's gone
        response = await client.get(f"/api/v1/clients/{download_client.id}")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_client_not_found(self, client: AsyncClient):
        """Test deleting a non-existent client."""
        response = await client.delete("/api/v1/clients/999")
        assert response.status_code == 404


class TestClientStatus:
    """Tests for client status endpoints."""

    @pytest.mark.asyncio
    async def test_get_all_clients_status_empty(self, client: AsyncClient):
        """Test getting client status when none exist."""
        response = await client.get("/api/v1/clients/status/all")
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_get_all_clients_status(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test getting status for all clients."""
        response = await client.get("/api/v1/clients/status/all")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test qBittorrent"
        # Client will be offline since server isn't running
        assert data[0]["status"] == "offline"

    @pytest.mark.asyncio
    async def test_test_client_connection(
        self, client: AsyncClient, download_client: DownloadClient
    ):
        """Test the connection test endpoint."""
        response = await client.post(f"/api/v1/clients/{download_client.id}/test")
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert "message" in data
        # Will fail since server isn't running
        assert data["success"] is False

    @pytest.mark.asyncio
    async def test_test_client_not_found(self, client: AsyncClient):
        """Test connection test for non-existent client."""
        response = await client.post("/api/v1/clients/999/test")
        assert response.status_code == 404
