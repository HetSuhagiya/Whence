import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CredentialCrypto:
    """Handles AES-256-GCM encryption and decryption of warehouse credentials at rest."""

    def __init__(self, master_key_hex_or_b64: str) -> None:
        key_bytes: bytes
        try:
            if len(master_key_hex_or_b64) == 64:
                key_bytes = bytes.fromhex(master_key_hex_or_b64)
            else:
                decoded = base64.b64decode(master_key_hex_or_b64, validate=True)
                key_bytes = decoded
        except Exception as e:
            raise ValueError(
                f"Master key must be a 64-character hex string or 32-byte base64 string: {e}"
            ) from e

        if len(key_bytes) != 32:
            raise ValueError(f"AES-256 requires exactly 32 bytes, got {len(key_bytes)} bytes.")

        self._aesgcm = AESGCM(key_bytes)

    def encrypt(self, plaintext: str) -> str:
        """Encrypts plaintext and returns base64-encoded payload (nonce + ciphertext + tag)."""
        nonce = os.urandom(12)  # 96-bit nonce for AES-GCM
        data = plaintext.encode("utf-8")
        ciphertext = self._aesgcm.encrypt(nonce, data, None)
        payload = nonce + ciphertext
        return base64.b64encode(payload).decode("utf-8")

    def decrypt(self, encrypted_b64: str) -> str:
        """Decrypts base64-encoded encrypted payload into original plaintext string."""
        raw = base64.b64decode(encrypted_b64.encode("utf-8"))
        if len(raw) < 28:  # 12 bytes nonce + 16 bytes auth tag minimum
            raise ValueError("Invalid encrypted payload size")
        nonce = raw[:12]
        ciphertext = raw[12:]
        decrypted_bytes = self._aesgcm.decrypt(nonce, ciphertext, None)
        return decrypted_bytes.decode("utf-8")
