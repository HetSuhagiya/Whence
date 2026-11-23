import pytest

from app.crypto import CredentialCrypto


def test_credential_crypto_encrypt_and_decrypt() -> None:
    # 32-byte hex key (64 chars)
    hex_key = "a" * 64
    crypto = CredentialCrypto(hex_key)

    plaintext = '{"type": "service_account", "project_id": "test-project-123"}'
    encrypted = crypto.encrypt(plaintext)

    assert encrypted != plaintext
    decrypted = crypto.decrypt(encrypted)
    assert decrypted == plaintext


def test_credential_crypto_different_ciphertexts() -> None:
    # Encrypting twice produces different ciphertexts due to distinct random nonces
    hex_key = "b" * 64
    crypto = CredentialCrypto(hex_key)

    plaintext = "super-secret-service-account-key"
    c1 = crypto.encrypt(plaintext)
    c2 = crypto.encrypt(plaintext)
    assert c1 != c2

    assert crypto.decrypt(c1) == plaintext
    assert crypto.decrypt(c2) == plaintext


def test_credential_crypto_invalid_key_length() -> None:
    with pytest.raises(ValueError):
        CredentialCrypto("short")
