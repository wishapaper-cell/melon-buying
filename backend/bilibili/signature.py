from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Credentials:
    access_key: str
    access_secret: str


def build_signed_request(
    payload: Any,
    credentials: Credentials,
    now_seconds: int | None = None,
    nonce: str | None = None,
) -> tuple[str, dict[str, str]]:
    body = json.dumps(
        payload, ensure_ascii=False, separators=(",", ":")
    )
    content_md5 = hashlib.md5(
        body.encode("utf-8"), usedforsecurity=False
    ).hexdigest()
    signing_headers = {
        "x-bili-accesskeyid": credentials.access_key,
        "x-bili-content-md5": content_md5,
        "x-bili-signature-method": "HMAC-SHA256",
        "x-bili-signature-nonce": nonce or str(uuid.uuid4()),
        "x-bili-signature-version": "1.0",
        "x-bili-timestamp": str(now_seconds or int(time.time())),
    }
    signing_text = "\n".join(
        f"{key}:{signing_headers[key]}" for key in sorted(signing_headers)
    )
    authorization = hmac.new(
        credentials.access_secret.encode("utf-8"),
        signing_text.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return body, {
        "Accept": "application/json",
        "Content-Type": "application/json",
        **signing_headers,
        "Authorization": authorization.lower(),
    }
