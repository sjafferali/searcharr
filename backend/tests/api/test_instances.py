"""
Tests for instance management endpoints.
"""

import pytest
from app.models import JackettInstance, ProwlarrInstance
from httpx import AsyncClient

# =============================================================================
# Jackett Instance Tests
# =============================================================================


class TestJackettInstances:
    """Tests for Jackett instance CRUD operations."""

    @pytest.mark.asyncio
    async def test_list_jackett_instances_empty(self, client: AsyncClient):
        """Test listing Jackett instances when none exist."""
        response = await client.get("/api/v1/instances/jackett")
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_jackett_instances(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """Test listing Jackett instances."""
        response = await client.get("/api/v1/instances/jackett")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test Jackett"
        assert data[0]["url"] == "http://localhost:9117"
        # API key should be masked
        assert "..." in data[0]["api_key"]

    @pytest.mark.asyncio
    async def test_create_jackett_instance(self, client: AsyncClient):
        """Test creating a new Jackett instance."""
        response = await client.post(
            "/api/v1/instances/jackett",
            json={
                "name": "New Jackett",
                "url": "http://192.168.1.100:9117",
                "api_key": "my-secret-api-key",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New Jackett"
        assert data["url"] == "http://192.168.1.100:9117"
        assert "..." in data["api_key"]  # Masked
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_create_jackett_instance_validation_error(self, client: AsyncClient):
        """Test creating a Jackett instance with invalid data."""
        response = await client.post(
            "/api/v1/instances/jackett",
            json={
                "name": "",  # Empty name should fail
                "url": "http://localhost:9117",
                "api_key": "key",
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_jackett_instance(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """Test getting a specific Jackett instance."""
        response = await client.get(f"/api/v1/instances/jackett/{jackett_instance.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == jackett_instance.id
        assert data["name"] == "Test Jackett"

    @pytest.mark.asyncio
    async def test_get_jackett_instance_not_found(self, client: AsyncClient):
        """Test getting a non-existent Jackett instance."""
        response = await client.get("/api/v1/instances/jackett/999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_jackett_instance(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """Test updating a Jackett instance."""
        response = await client.put(
            f"/api/v1/instances/jackett/{jackett_instance.id}",
            json={"name": "Updated Jackett"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Jackett"
        assert data["url"] == "http://localhost:9117"  # Unchanged

    @pytest.mark.asyncio
    async def test_update_jackett_instance_not_found(self, client: AsyncClient):
        """Test updating a non-existent Jackett instance."""
        response = await client.put(
            "/api/v1/instances/jackett/999",
            json={"name": "Updated"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_jackett_instance(
        self, client: AsyncClient, jackett_instance: JackettInstance
    ):
        """Test deleting a Jackett instance."""
        response = await client.delete(f"/api/v1/instances/jackett/{jackett_instance.id}")
        assert response.status_code == 204

        # Verify it's gone
        response = await client.get(f"/api/v1/instances/jackett/{jackett_instance.id}")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_jackett_instance_not_found(self, client: AsyncClient):
        """Test deleting a non-existent Jackett instance."""
        response = await client.delete("/api/v1/instances/jackett/999")
        assert response.status_code == 404


# =============================================================================
# Prowlarr Instance Tests
# =============================================================================


class TestProwlarrInstances:
    """Tests for Prowlarr instance CRUD operations."""

    @pytest.mark.asyncio
    async def test_list_prowlarr_instances_empty(self, client: AsyncClient):
        """Test listing Prowlarr instances when none exist."""
        response = await client.get("/api/v1/instances/prowlarr")
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_prowlarr_instances(
        self, client: AsyncClient, prowlarr_instance: ProwlarrInstance
    ):
        """Test listing Prowlarr instances."""
        response = await client.get("/api/v1/instances/prowlarr")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test Prowlarr"

    @pytest.mark.asyncio
    async def test_create_prowlarr_instance(self, client: AsyncClient):
        """Test creating a new Prowlarr instance."""
        response = await client.post(
            "/api/v1/instances/prowlarr",
            json={
                "name": "New Prowlarr",
                "url": "http://192.168.1.100:9696",
                "api_key": "my-secret-api-key",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New Prowlarr"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_get_prowlarr_instance(
        self, client: AsyncClient, prowlarr_instance: ProwlarrInstance
    ):
        """Test getting a specific Prowlarr instance."""
        response = await client.get(f"/api/v1/instances/prowlarr/{prowlarr_instance.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == prowlarr_instance.id

    @pytest.mark.asyncio
    async def test_update_prowlarr_instance(
        self, client: AsyncClient, prowlarr_instance: ProwlarrInstance
    ):
        """Test updating a Prowlarr instance."""
        response = await client.put(
            f"/api/v1/instances/prowlarr/{prowlarr_instance.id}",
            json={"name": "Updated Prowlarr"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Prowlarr"

    @pytest.mark.asyncio
    async def test_delete_prowlarr_instance(
        self, client: AsyncClient, prowlarr_instance: ProwlarrInstance
    ):
        """Test deleting a Prowlarr instance."""
        response = await client.delete(f"/api/v1/instances/prowlarr/{prowlarr_instance.id}")
        assert response.status_code == 204


# =============================================================================
# Instance Status Tests
# =============================================================================


class TestInstanceStatus:
    """Tests for instance status endpoint."""

    @pytest.mark.asyncio
    async def test_get_all_instances_status_empty(self, client: AsyncClient):
        """Test getting status when no instances exist."""
        response = await client.get("/api/v1/instances/status")
        assert response.status_code == 200
        data = response.json()
        assert data["jackett"] == []
        assert data["prowlarr"] == []
        assert data["total_online"] == 0

    @pytest.mark.asyncio
    async def test_get_all_instances_status(
        self,
        client: AsyncClient,
        jackett_instance: JackettInstance,
        prowlarr_instance: ProwlarrInstance,
    ):
        """Test getting status for all instances."""
        response = await client.get("/api/v1/instances/status")
        assert response.status_code == 200
        data = response.json()
        assert len(data["jackett"]) == 1
        assert len(data["prowlarr"]) == 1
        # Instances will be offline since servers aren't running
        assert data["jackett"][0]["status"] == "offline"
        assert data["prowlarr"][0]["status"] == "offline"
