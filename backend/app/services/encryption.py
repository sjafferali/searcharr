"""
Credential handling service.

For simplicity, credentials are stored as plaintext in the database.
This is acceptable for a self-hosted application where database access
implies full system access anyway.
"""


def encrypt_credential(plaintext: str) -> str:
    """
    Store a credential (no-op, returns input as-is).

    Args:
        plaintext: The credential to store.

    Returns:
        The credential unchanged.
    """
    return plaintext


def decrypt_credential(ciphertext: str) -> str:
    """
    Retrieve a credential (no-op, returns input as-is).

    Args:
        ciphertext: The stored credential.

    Returns:
        The credential unchanged.
    """
    return ciphertext
