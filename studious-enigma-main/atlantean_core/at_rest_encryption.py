"""At-rest encryption helpers with key rotation support."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from cryptography.fernet import Fernet, InvalidToken

_TEXT_PREFIX = "enc:v1"


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class AtRestEncryptor:
    enabled: bool
    keys: Dict[str, Fernet]
    active_key_id: Optional[str]

    @classmethod
    def from_env(cls, env: Optional[dict] = None) -> "AtRestEncryptor":
        src = env or os.environ
        enabled_flag = _parse_bool(src.get("ATLANTEAN_ENCRYPTION_ENABLED"), default=True)

        keys: Dict[str, Fernet] = {}

        keys_json_raw = src.get("ATLANTEAN_ENCRYPTION_KEYS_JSON", "").strip()
        if keys_json_raw:
            parsed = json.loads(keys_json_raw)
            if not isinstance(parsed, dict):
                raise ValueError("ATLANTEAN_ENCRYPTION_KEYS_JSON must be a JSON object")
            for key_id, key_value in parsed.items():
                keys[str(key_id)] = Fernet(str(key_value).encode("utf-8"))

        keys_csv_raw = src.get("ATLANTEAN_ENCRYPTION_KEYS", "").strip()
        if keys_csv_raw:
            for row in keys_csv_raw.split(","):
                chunk = row.strip()
                if not chunk:
                    continue
                if "=" in chunk:
                    key_id, key_value = chunk.split("=", 1)
                elif ":" in chunk:
                    key_id, key_value = chunk.split(":", 1)
                else:
                    continue
                keys[key_id.strip()] = Fernet(key_value.strip().encode("utf-8"))

        single_key = src.get("ATLANTEAN_ENCRYPTION_KEY", "").strip()
        if single_key:
            single_key_id = src.get("ATLANTEAN_ENCRYPTION_KEY_ID", "primary").strip() or "primary"
            keys[single_key_id] = Fernet(single_key.encode("utf-8"))

        active_key_id = src.get("ATLANTEAN_ENCRYPTION_ACTIVE_KEY_ID", "").strip() or None
        if not active_key_id and keys:
            active_key_id = sorted(keys.keys())[0]

        enabled = enabled_flag and bool(keys) and bool(active_key_id)
        return cls(enabled=enabled, keys=keys, active_key_id=active_key_id)

    def encrypt_text(self, text: str) -> str:
        if not self.enabled:
            return text
        if not self.active_key_id or self.active_key_id not in self.keys:
            raise ValueError("No active encryption key is configured")

        token = self.keys[self.active_key_id].encrypt(text.encode("utf-8")).decode("utf-8")
        return f"{_TEXT_PREFIX}:{self.active_key_id}:{token}"

    def decrypt_text(self, text: str) -> str:
        output, _ = self.decrypt_text_with_metadata(text)
        return output

    def decrypt_text_with_metadata(self, text: str) -> Tuple[str, bool]:
        if not self.is_encrypted_text(text):
            return text, False

        parts = text.split(":", 3)
        if len(parts) != 4:
            raise ValueError("Invalid encrypted text format")

        _, _, key_id, token = parts

        if key_id in self.keys:
            try:
                return self.keys[key_id].decrypt(token.encode("utf-8")).decode("utf-8"), True
            except InvalidToken:
                pass

        for fallback_key_id, fernet in self.keys.items():
            if fallback_key_id == key_id:
                continue
            try:
                return fernet.decrypt(token.encode("utf-8")).decode("utf-8"), True
            except InvalidToken:
                continue

        raise ValueError("Unable to decrypt payload with configured keyring")

    @staticmethod
    def is_encrypted_text(value: str) -> bool:
        return value.startswith(f"{_TEXT_PREFIX}:")
