"""
Tests for encryption service.
"""

import pytest
from app.services.encryption import (
    decrypt_credential,
    encrypt_credential,
    encryption_service,
)


class TestEncryptionService:
    """Tests for the encryption service."""

    def test_encrypt_decrypt_roundtrip(self):
        """Test that encrypting and decrypting returns original value."""
        original = "my-secret-api-key-123"
        encrypted = encrypt_credential(original)
        decrypted = decrypt_credential(encrypted)
        assert decrypted == original

    def test_encrypt_produces_different_output(self):
        """Test that encryption produces different ciphertext each time."""
        original = "test-secret"
        encrypted1 = encrypt_credential(original)
        encrypted2 = encrypt_credential(original)
        # Fernet produces different ciphertexts due to random IV
        assert encrypted1 != encrypted2
        # But both decrypt to the same value
        assert decrypt_credential(encrypted1) == original
        assert decrypt_credential(encrypted2) == original

    def test_encrypt_empty_string(self):
        """Test encrypting empty string."""
        encrypted = encrypt_credential("")
        assert encrypted == ""
        assert decrypt_credential("") == ""

    def test_decrypt_invalid_ciphertext(self):
        """Test decrypting invalid data raises error."""
        with pytest.raises(ValueError, match="invalid or corrupted"):
            decrypt_credential("not-valid-ciphertext")

    def test_encrypt_special_characters(self):
        """Test encrypting strings with special characters."""
        original = "api-key!@#$%^&*()_+-=[]{}|;':\",./<>?"
        encrypted = encrypt_credential(original)
        decrypted = decrypt_credential(encrypted)
        assert decrypted == original

    def test_encrypt_unicode(self):
        """Test encrypting unicode strings."""
        original = "api-key-with-unicode-\u00e9\u00e8\u00ea"
        encrypted = encrypt_credential(original)
        decrypted = decrypt_credential(encrypted)
        assert decrypted == original

    def test_is_encrypted_valid_token(self):
        """Test is_encrypted returns True for encrypted data."""
        encrypted = encrypt_credential("test")
        assert encryption_service.is_encrypted(encrypted) is True

    def test_is_encrypted_plaintext(self):
        """Test is_encrypted returns False for plaintext."""
        assert encryption_service.is_encrypted("plaintext") is False
        assert encryption_service.is_encrypted("my-api-key") is False

    def test_is_encrypted_empty(self):
        """Test is_encrypted returns False for empty string."""
        assert encryption_service.is_encrypted("") is False

    def test_encryption_service_singleton(self):
        """Test that encryption service is properly initialized."""
        assert encryption_service is not None
        assert encryption_service._fernet is not None
