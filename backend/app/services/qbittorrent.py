"""
qBittorrent Web API service for managing torrent downloads.

qBittorrent provides a Web API for remote management of torrents.
This service handles authentication and torrent operations.
"""

import logging
from urllib.parse import urljoin

import httpx

logger = logging.getLogger(__name__)

# Default timeout for qBittorrent API requests (seconds)
QBITTORRENT_TIMEOUT = 10


class QBittorrentService:
    """Service for interacting with qBittorrent Web API."""

    def __init__(self, base_url: str, username: str, password: str) -> None:
        """
        Initialize the qBittorrent service.

        Args:
            base_url: The base URL of the qBittorrent web interface (e.g., http://localhost:8080)
            username: Username for authentication
            password: Password for authentication
        """
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.timeout = QBITTORRENT_TIMEOUT

    def _get_api_url(self, endpoint: str) -> str:
        """Build the full API URL for an endpoint."""
        return urljoin(self.base_url, f"/api/v2/{endpoint}")

    async def _login(self, client: httpx.AsyncClient) -> bool:
        """
        Authenticate with qBittorrent.

        On success, the session cookie is stored in the client's cookie jar and
        sent automatically on subsequent requests made with the same client.

        Returns:
            True if login successful, False otherwise
        """
        try:
            url = self._get_api_url("auth/login")
            response = await client.post(
                url,
                data={
                    "username": self.username,
                    "password": self.password,
                },
            )

            # A successful login returns 200 with the body "Ok." or 204 with no
            # body. Invalid credentials return 200 with the body "Fails.".
            if response.status_code in (200, 204):
                if "fails" in response.text.strip().lower():
                    logger.warning("qBittorrent login failed: invalid credentials")
                    return False
                return True

            return False

        except Exception as e:
            logger.exception(f"Error during qBittorrent login: {e}")
            return False

    @staticmethod
    def _interpret_add_response(response: httpx.Response) -> tuple[bool, str]:
        """Translate a torrents/add response into a (success, message) tuple."""
        # Success returns 200 with the body "Ok." or 204 with no body. A 200
        # body of "Fails." means qBittorrent rejected every supplied torrent.
        if response.status_code == 204:
            return True, "Torrent added successfully"
        if response.status_code == 200:
            if response.text.strip().lower() == "ok.":
                return True, "Torrent added successfully"
            return False, f"Failed to add torrent: {response.text}"
        if response.status_code == 415:
            return False, "Torrent file is not valid"
        return False, f"Failed to add torrent: HTTP {response.status_code}"

    async def test_connection(self) -> tuple[bool, str]:
        """
        Test the connection to the qBittorrent instance.

        Returns:
            Tuple of (success, message)
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Try to login
                if not await self._login(client):
                    return False, "Authentication failed: invalid credentials"

                # Verify we can access the API
                url = self._get_api_url("app/version")
                response = await client.get(url)

                if response.status_code == 200:
                    version = response.text.strip()
                    return True, f"Connected to qBittorrent {version}"
                else:
                    return False, f"API access failed: HTTP {response.status_code}"

        except httpx.TimeoutException:
            return False, "Connection timed out"
        except httpx.ConnectError:
            return False, "Could not connect to qBittorrent server"
        except Exception as e:
            logger.exception("Error testing qBittorrent connection")
            return False, f"Connection error: {str(e)}"

    async def add_torrent_magnet(
        self, magnet_link: str, category: str | None = None
    ) -> tuple[bool, str]:
        """
        Add a torrent using a magnet link.

        Args:
            magnet_link: The magnet URI to add
            category: Optional category to assign to the torrent

        Returns:
            Tuple of (success, message)
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Login first
                if not await self._login(client):
                    return False, "Authentication failed"

                url = self._get_api_url("torrents/add")
                data: dict[str, str] = {"urls": magnet_link}
                if category:
                    data["category"] = category
                response = await client.post(url, data=data)
                return self._interpret_add_response(response)

        except httpx.TimeoutException:
            return False, "Request timed out"
        except Exception as e:
            logger.exception(f"Error adding torrent via magnet: {e}")
            return False, f"Error: {str(e)}"

    async def add_torrent_file(
        self,
        torrent_content: bytes,
        filename: str = "torrent.torrent",
        category: str | None = None,
    ) -> tuple[bool, str]:
        """
        Add a torrent using a .torrent file.

        Args:
            torrent_content: The content of the .torrent file
            filename: The filename for the upload
            category: Optional category to assign to the torrent

        Returns:
            Tuple of (success, message)
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Login first
                if not await self._login(client):
                    return False, "Authentication failed"

                url = self._get_api_url("torrents/add")

                # Create multipart form data
                files = {"torrents": (filename, torrent_content, "application/x-bittorrent")}
                data: dict[str, str] = {}
                if category:
                    data["category"] = category

                response = await client.post(url, files=files, data=data if data else None)
                return self._interpret_add_response(response)

        except httpx.TimeoutException:
            return False, "Request timed out"
        except Exception as e:
            logger.exception(f"Error adding torrent file: {e}")
            return False, f"Error: {str(e)}"

    async def add_torrent_url(
        self, torrent_url: str, category: str | None = None
    ) -> tuple[bool, str]:
        """
        Add a torrent by downloading from a URL.

        This method downloads the .torrent file from the URL first,
        then adds it to qBittorrent.

        Args:
            torrent_url: URL to the .torrent file
            category: Optional category to assign to the torrent

        Returns:
            Tuple of (success, message)
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Download the torrent file
                try:
                    download_response = await client.get(torrent_url, follow_redirects=True)
                    if download_response.status_code != 200:
                        return (
                            False,
                            f"Failed to download torrent file: HTTP {download_response.status_code}",
                        )

                    torrent_content = download_response.content
                except Exception as e:
                    return False, f"Failed to download torrent file: {str(e)}"

                # Login to qBittorrent
                if not await self._login(client):
                    return False, "Authentication failed"

                # Add the torrent file
                url = self._get_api_url("torrents/add")
                files = {
                    "torrents": ("torrent.torrent", torrent_content, "application/x-bittorrent")
                }
                data: dict[str, str] = {}
                if category:
                    data["category"] = category

                response = await client.post(url, files=files, data=data if data else None)
                return self._interpret_add_response(response)

        except httpx.TimeoutException:
            return False, "Request timed out"
        except Exception as e:
            logger.exception(f"Error adding torrent from URL: {e}")
            return False, f"Error: {str(e)}"
