"""
Tests for credential handling functions.
"""

from app.services.encryption import decrypt_credential, encrypt_credential


class TestCredentialHandling:
    """Tests for credential passthrough functions."""

    def test_encrypt_returns_same_value(self):
        """Test that encrypt_credential returns input unchanged."""
        original = "my-secret-api-key-123"
        result = encrypt_credential(original)
        assert result == original

    def test_decrypt_returns_same_value(self):
        """Test that decrypt_credential returns input unchanged."""
        original = "my-secret-api-key-123"
        result = decrypt_credential(original)
        assert result == original

    def test_roundtrip(self):
        """Test that encrypt/decrypt roundtrip returns original value."""
        original = "test-secret"
        encrypted = encrypt_credential(original)
        decrypted = decrypt_credential(encrypted)
        assert decrypted == original

    def test_empty_string(self):
        """Test handling empty string."""
        assert encrypt_credential("") == ""
        assert decrypt_credential("") == ""

    def test_special_characters(self):
        """Test handling strings with special characters."""
        original = "api-key!@#$%^&*()_+-=[]{}|;':\",./<>?"
        assert encrypt_credential(original) == original
        assert decrypt_credential(original) == original

    def test_unicode(self):
        """Test handling unicode strings."""
        original = "api-key-with-unicode-\u00e9\u00e8\u00ea"
        assert encrypt_credential(original) == original
        assert decrypt_credential(original) == original
