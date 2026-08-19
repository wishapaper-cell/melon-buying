from __future__ import annotations

import json
import struct
import zlib
from dataclasses import dataclass
from typing import Any

try:
    import brotli
except ImportError:  # 仅影响 B 站 version=3 压缩包，服务本身仍可启动。
    brotli = None

HEADER_LENGTH = 16
OP_HEARTBEAT = 2
OP_HEARTBEAT_REPLY = 3
OP_MESSAGE = 5
OP_AUTH = 7
OP_AUTH_REPLY = 8


@dataclass(frozen=True)
class Packet:
    version: int
    operation: int
    sequence: int
    body: bytes


def encode_packet(
    operation: int, body: bytes = b"", version: int = 1
) -> bytes:
    packet_length = HEADER_LENGTH + len(body)
    return (
        struct.pack(
            ">IHHII",
            packet_length,
            HEADER_LENGTH,
            version,
            operation,
            1,
        )
        + body
    )


def decode_packets(data: bytes) -> list[Packet]:
    packets: list[Packet] = []
    offset = 0
    while offset + HEADER_LENGTH <= len(data):
        packet_length, header_length, version, operation, sequence = (
            struct.unpack_from(">IHHII", data, offset)
        )
        if (
            packet_length < header_length
            or header_length < HEADER_LENGTH
            or offset + packet_length > len(data)
        ):
            break
        body = data[
            offset + header_length : offset + packet_length
        ]
        if version == 2:
            packets.extend(decode_packets(zlib.decompress(body)))
        elif version == 3:
            if brotli is None:
                raise RuntimeError(
                    "收到 Brotli 压缩弹幕包，请先执行 pip install -r requirements.txt"
                )
            packets.extend(decode_packets(brotli.decompress(body)))
        else:
            packets.append(Packet(version, operation, sequence, body))
        offset += packet_length
    return packets


def parse_commands(data: bytes) -> list[dict[str, Any]]:
    commands: list[dict[str, Any]] = []
    for packet in decode_packets(data):
        if packet.operation != OP_MESSAGE:
            continue
        try:
            command = json.loads(packet.body.decode("utf-8"))
            if isinstance(command, dict):
                commands.append(command)
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    return commands
