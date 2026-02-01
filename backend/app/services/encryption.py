"""
Encryption service for securing sensitive credentials.

Uses Fernet symmetric encryption to encrypt API keys and passwords
before storing them in the database.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)


class EncryptionService:
    """
    Service for encrypting and decrypting sensitive data.

    Uses Fernet symmetric encryption. If no ENCRYPTION_KEY is configured,
    falls back to using SECRET_KEY to derive an encryption key.
    """

    def __init__(self) -> None:
        """Initialize the encryption service with the configured key."""
        self._fernet: Fernet | None = None
        self._initialize_fernet()

    def _initialize_fernet(self) -> None:
        """Initialize Fernet with the encryption key."""
        key = settings.ENCRYPTION_KEY

        if key:
            # Use the provided encryption key directly
            try:
                self._fernet = Fernet(key.encode() if isinstance(key, str) else key)
                logger.info("Encryption service initialized with ENCRYPTION_KEY")
                return
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid ENCRYPTION_KEY format: {e}. Falling back to SECRET_KEY derivation.")

        # Fallback: derive a Fernet-compatible key from SECRET_KEY
        secret = settings.SECRET_KEY.encode()
        # Use SHA256 to create a 32-byte key, then base64 encode it for Fernet
        derived_key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
        self._fernet = Fernet(derived_key)
        logger.info("Encryption service initialized with derived key from SECRET_KEY")

    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a plaintext string.

        Args:
            plaintext: The string to encrypt.

        Returns:
            The encrypted string (base64 encoded).

        Raises:
            RuntimeError: If encryption service is not initialized.
        """
        if not self._fernet:
            raise RuntimeError("Encryption service not initialized")

        if not plaintext:
            return ""

        encrypted = self._fernet.encrypt(plaintext.encode())
        return encrypted.decode()

    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt an encrypted string.

        Args:
            ciphertext: The encrypted string to decrypt.

        Returns:
            The decrypted plaintext string.

        Raises:
            RuntimeError: If encryption service is not initialized.
            ValueError: If decryption fails (invalid token or corrupted data).
        """
        if not self._fernet:
            raise RuntimeError("Encryption service not initialized")

        if not ciphertext:
            return ""

        try:
            decrypted = self._fernet.decrypt(ciphertext.encode())
            return decrypted.decode()
        except InvalidToken as e:
            logger.error(f"Failed to decrypt data: invalid token")
            raise ValueError("Failed to decrypt data: invalid or corrupted ciphertext") from e

    def is_encrypted(self, value: str) -> bool:
        """
        Check if a value appears to be encrypted (Fernet token format).

        Args:
            value: The value to check.

        Returns:
            True if the value appears to be a Fernet token.
        """
        if not value:
            return False

        try:
            # Fernet tokens are base64 encoded and start with 'gAAAAA'
            # They are also at least 64 bytes when decoded
            decoded = base64.urlsafe_b64decode(value.encode())
            return len(decoded) >= 64 and value.startswith("gAAAAA")
        except Exception:
            return False


# Global encryption service instance
encryption_service = EncryptionService()


def encrypt_credential(plaintext: str) -> str:
    """
    Encrypt a credential (API key, password, etc.).

    Args:
        plaintext: The credential to encrypt.

    Returns:
        The encrypted credential.
    """
    return encryption_service.encrypt(plaintext)


def decrypt_credential(ciphertext: str) -> str:
    """
    Decrypt a credential.

    Args:
        ciphertext: The encrypted credential.

    Returns:
        The decrypted credential.
    """
    return encryption_service.decrypt(ciphertext)
