from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from typing import Any

import httpx
import websockets
from websockets.asyncio.client import ClientConnection

from backend.bilibili.protocol import (
    OP_AUTH,
    OP_AUTH_REPLY,
    OP_HEARTBEAT,
    decode_packets,
    encode_packet,
    parse_commands,
)
from backend.bilibili.signature import Credentials, build_signed_request
from backend.live_hub import LiveEventHub
class BilibiliApiError(RuntimeError):
    pass


class BilibiliLiveClient:
    def __init__(
        self,
        app_id: int,
        credentials: Credentials,
        api_base: str,
        hub: LiveEventHub,
    ) -> None:
        self.app_id = app_id
        self.credentials = credentials
        self.api_base = api_base.rstrip("/")
        self.hub = hub
        self.game_id: str | None = None
        self.websocket: ClientConnection | None = None
        self.tasks: list[asyncio.Task[Any]] = []
        self._lock = asyncio.Lock()
        self._status: dict[str, Any] = {"state": "idle"}
        self._http = httpx.AsyncClient(
            timeout=15,
            verify=True,
            trust_env=False,
        )

    @property
    def status(self) -> dict[str, Any]:
        return dict(self._status)

    async def start(self, identity_code: str) -> dict[str, Any]:
        async with self._lock:
            if self._status["state"] == "connected":
                return self.status
            await self._set_status({"state": "starting"})
            try:
                result = await self._post(
                    "/v2/app/start",
                    {"code": identity_code, "app_id": self.app_id},
                )
                data = result["data"]
                self.game_id = str(data["game_info"]["game_id"])
                ws_info = data["websocket_info"]
                self.websocket = await self._connect(
                    ws_info["wss_link"], ws_info["auth_body"]
                )
                anchor = data["anchor_info"]
                await self._set_status(
                    {
                        "state": "connected",
                        "gameId": self.game_id,
                        "roomId": anchor.get("room_id"),
                        "anchorName": anchor.get("uname"),
                    }
                )
                self.tasks = [
                    asyncio.create_task(
                        self._receive_loop(), name="bili-receive"
                    ),
                    asyncio.create_task(
                        self._websocket_heartbeat_loop(),
                        name="bili-ws-heartbeat",
                    ),
                    asyncio.create_task(
                        self._project_heartbeat_loop(),
                        name="bili-project-heartbeat",
                    ),
                ]
                return self.status
            except Exception as error:
                await self._clear_socket_and_tasks()
                self.game_id = None
                await self._set_status(
                    {"state": "error", "lastError": str(error)}
                )
                raise

    async def stop(self) -> dict[str, Any]:
        async with self._lock:
            game_id = self.game_id
            await self._set_status(
                {**self._status, "state": "stopping"}
            )
            await self._clear_socket_and_tasks()
            if game_id:
                await self._post(
                    "/v2/app/end",
                    {"app_id": self.app_id, "game_id": game_id},
                )
            self.game_id = None
            await self._set_status({"state": "idle"})
            return self.status

    async def close(self) -> None:
        if self.game_id:
            with suppress(Exception):
                await self.stop()
        await self._http.aclose()

    async def _connect(
        self, links: list[str], auth_body: str
    ) -> ClientConnection:
        last_error: Exception | None = None
        for link in links:
            socket: ClientConnection | None = None
            try:
                socket = await asyncio.wait_for(
                    websockets.connect(
                        link,
                        ping_interval=None,
                        close_timeout=5,
                        open_timeout=12,
                        proxy=None,
                    ),
                    timeout=15,
                )
                await socket.send(
                    encode_packet(
                        OP_AUTH, auth_body.encode("utf-8")
                    )
                )
                raw = await asyncio.wait_for(socket.recv(), timeout=15)
                raw_bytes = (
                    raw.encode("utf-8")
                    if isinstance(raw, str)
                    else bytes(raw)
                )
                reply = next(
                    (
                        packet
                        for packet in decode_packets(raw_bytes)
                        if packet.operation == OP_AUTH_REPLY
                    ),
                    None,
                )
                if reply is None:
                    raise BilibiliApiError("未收到长连接鉴权响应")
                auth_result = json.loads(reply.body.decode("utf-8"))
                if auth_result.get("code") != 0:
                    raise BilibiliApiError(
                        f"长连接鉴权失败：{auth_result.get('code')}"
                    )
                return socket
            except Exception as error:
                last_error = error
                if socket:
                    with suppress(Exception):
                        await socket.close()
        raise last_error or BilibiliApiError("没有可用的WSS地址")

    async def _receive_loop(self) -> None:
        assert self.websocket is not None
        try:
            async for raw in self.websocket:
                raw_bytes = (
                    raw.encode("utf-8")
                    if isinstance(raw, str)
                    else bytes(raw)
                )
                for command in parse_commands(raw_bytes):
                    await self.hub.publish("bilibili", command)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            await self.hub.publish(
                "system",
                {"level": "warning", "message": str(error)},
            )

    async def _websocket_heartbeat_loop(self) -> None:
        assert self.websocket is not None
        while True:
            await asyncio.sleep(20)
            await self.websocket.send(encode_packet(OP_HEARTBEAT))

    async def _project_heartbeat_loop(self) -> None:
        while True:
            await asyncio.sleep(20)
            if not self.game_id:
                return
            try:
                await self._post(
                    "/v2/app/heartbeat",
                    {"game_id": self.game_id},
                )
            except Exception as error:
                await self.hub.publish(
                    "system",
                    {
                        "level": "warning",
                        "message": f"项目心跳失败：{error}",
                    },
                )

    async def _post(
        self, path: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        body, headers = build_signed_request(
            payload, self.credentials
        )
        response = await self._http.post(
            f"{self.api_base}{path}", headers=headers, content=body
        )
        response.raise_for_status()
        result = response.json()
        if result.get("code") != 0:
            raise BilibiliApiError(
                f"B站API {result.get('code')}: "
                f"{result.get('message', '未知错误')}"
            )
        return result

    async def _clear_socket_and_tasks(self) -> None:
        current = asyncio.current_task()
        tasks = [task for task in self.tasks if task is not current]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.tasks = []
        if self.websocket:
            with suppress(Exception):
                await self.websocket.close()
            self.websocket = None

    async def _set_status(self, status: dict[str, Any]) -> None:
        self._status = status
        await self.hub.publish("status", self.status)
