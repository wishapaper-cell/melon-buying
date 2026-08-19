from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from typing import Any


class LiveEventHub:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    async def publish(self, event_type: str, payload: Any) -> None:
        envelope = {
            "type": event_type,
            "payload": payload,
            "timestamp": int(time.time() * 1000),
        }
        stale: list[asyncio.Queue[dict[str, Any]]] = []
        for queue in self._subscribers:
            try:
                queue.put_nowait(envelope)
            except asyncio.QueueFull:
                stale.append(queue)
        for queue in stale:
            self._subscribers.discard(queue)

    async def subscribe(
        self, initial_status: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any] | None]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
        self._subscribers.add(queue)
        try:
            yield {
                "type": "status",
                "payload": initial_status,
                "timestamp": int(time.time() * 1000),
            }
            while True:
                try:
                    yield await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield None
        finally:
            self._subscribers.discard(queue)


live_hub = LiveEventHub()
