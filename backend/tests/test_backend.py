from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import struct
import unittest
import zlib

from fastapi.testclient import TestClient

from backend.ai_service import AiService
from backend.bilibili.protocol import (
    OP_MESSAGE,
    decode_packets,
    encode_packet,
    parse_commands,
)
from backend.bilibili.signature import Credentials, build_signed_request
from backend.commentary_service import CommentaryService
from backend.config import Settings
from backend.live_hub import LiveEventHub
from backend.main import app


class FastApiTests(unittest.TestCase):
    def test_health_identifies_fastapi_backend(self) -> None:
        with TestClient(app) as client:
            response = client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        self.assertEqual(response.json()["backend"], "fastapi")
        self.assertIn("bilibiliAutoStartReady", response.json())

    def test_local_option_fallback_returns_four_actions(self) -> None:
        service = AiService(Settings(ai_api_key="", ai_model=""))
        context = {
            "worldlineId": "world-test",
            "sceneId": "melon_street",
            "objectId": "price_sign",
            "targetKind": "OBJECT",
            "targetDisplayName": "价格牌",
            "actorId": "HUAQIANG",
            "supportedActions": ["OBSERVE", "QUESTION", "WAIT"],
            "nearbyNpcIds": ["VENDOR"],
            "recentEvents": [],
            "objectState": {"baseVisualState": "normal"},
            "canonRouteActive": False,
            "canonBeatId": None,
        }
        result = asyncio.run(service.generate_options(context))
        self.assertEqual([item["id"] for item in result["options"]], list("ABCD"))
        self.assertTrue(result["degraded"])

    def test_commentary_start_does_not_prewarm_tts(self) -> None:
        class TtsStub:
            configured = False
            prewarm_calls = 0

            async def prewarm(self, _presets: object) -> None:
                self.prewarm_calls += 1

            async def synthesize(
                self, _text: str, _mood: str
            ) -> None:
                return None

        async def exercise() -> int:
            tts = TtsStub()
            live_hub = LiveEventHub()
            service = CommentaryService(
                Settings(ai_api_key="", ai_model=""),
                AiService(Settings(ai_api_key="", ai_model="")),
                tts,  # type: ignore[arg-type]
                live_hub,
                LiveEventHub(),
            )
            service.start()
            await asyncio.sleep(0)
            await service.close()
            return tts.prewarm_calls

        self.assertEqual(asyncio.run(exercise()), 0)

    def test_commentary_status_replays_first_line_to_late_listener(
        self,
    ) -> None:
        class TtsStub:
            configured = False

            async def synthesize(
                self, _text: str, _mood: str
            ) -> None:
                return None

        async def exercise() -> dict[str, object]:
            settings = Settings(ai_api_key="", ai_model="")
            service = CommentaryService(
                settings,
                AiService(settings),
                TtsStub(),  # type: ignore[arg-type]
                LiveEventHub(),
                LiveEventHub(),
            )
            service.start()
            service.update_state(
                {
                    "nodeId": "arrival",
                    "routeLength": 1,
                    "votingOpen": True,
                    "choices": [
                        {"id": "A", "label": "走向瓜摊"},
                        {"id": "B", "label": "查看价牌"},
                        {"id": "C", "label": "停好摩托"},
                    ],
                    "votes": {"A": 0, "B": 0, "C": 0},
                    "remainingSeconds": 60,
                    "voteResult": None,
                    "performance": {},
                    "narration": "华强来到街口，准备决定下一步。",
                }
            )
            try:
                for _ in range(50):
                    latest = service.status.get("latestLine")
                    if latest:
                        return latest
                    await asyncio.sleep(0.01)
                self.fail("首轮解说没有在状态中留下可回放事件")
            finally:
                await service.close()

        latest = asyncio.run(exercise())
        self.assertEqual(latest["reason"], "round_briefing")
        self.assertIn("华强来到街口", str(latest["text"]))

    def test_director_rejects_internal_ids_in_visible_text(self) -> None:
        settings = Settings(ai_api_key="", ai_model="")
        service = AiService(settings)
        context = {
            "nodeId": "test-node",
            "winningChoiceId": "A",
            "worldRevision": 3,
            "allowedActorIds": ["HUAQIANG"],
            "allowedObjectIds": [
                "hidden_magnet",
                "scale_weight",
                "hao_scale_prop",
                "single_melon",
            ],
            "allowedExpressions": {"HUAQIANG": ["idle"]},
        }
        plan = {
            "planId": "test-plan",
            "nodeId": "test-node",
            "winningChoiceId": "A",
            "basedOnWorldRevision": 3,
            "requiredLocks": [],
            "fallbackNodeId": "next-node",
            "beats": [
                {
                    "id": "inspect",
                    "label": "华强取下hidden_magnet逐次复秤",
                    "commands": [
                        {"command": "WAIT", "durationMs": 100}
                    ],
                }
            ],
        }

        with self.assertRaisesRegex(ValueError, "泄露内部ID"):
            service._validate_director_plan(plan, context)

    def test_director_accepts_short_natural_visible_text(self) -> None:
        settings = Settings(ai_api_key="", ai_model="")
        service = AiService(settings)
        context = {
            "nodeId": "test-node",
            "winningChoiceId": "A",
            "worldRevision": 3,
            "allowedActorIds": ["HUAQIANG"],
            "allowedObjectIds": ["hidden_magnet"],
            "allowedExpressions": {"HUAQIANG": ["idle"]},
        }
        plan = {
            "planId": "test-plan",
            "nodeId": "test-node",
            "winningChoiceId": "A",
            "basedOnWorldRevision": 3,
            "requiredLocks": [],
            "fallbackNodeId": "next-node",
            "beats": [
                {
                    "id": "inspect",
                    "label": "取下秤底磁铁",
                    "commands": [
                        {"command": "WAIT", "durationMs": 100}
                    ],
                }
            ],
        }

        service._validate_director_plan(plan, context)

    def test_director_detects_repeated_recent_plan(self) -> None:
        service = AiService(Settings(ai_api_key="", ai_model=""))
        beats = [
            {
                "id": "approach",
                "label": "走到台秤旁",
                "commands": [
                    {
                        "command": "MOVE_TO",
                        "actorId": "HUAQIANG",
                        "destination": "nearest_interaction_cell",
                        "targetId": "hao_scale_prop",
                    }
                ],
            }
        ]
        context = {
            "winningChoice": {"label": "再检查一次台秤"},
            "recentDirectorPlans": [
                {
                    "choiceLabel": "再检查一次台秤",
                    "beats": beats,
                }
            ],
        }

        self.assertTrue(
            service._director_plan_repeats({"beats": beats}, context)
        )

    def test_story_progress_rejects_near_duplicate_scene(self) -> None:
        node = {
            "narration": "华强再次走到台秤旁，低头检查秤盘。",
            "dialogue": "我再看看这里。",
            "stageDirection": "华强检查台秤。",
        }
        context = {
            "recentStory": [
                {
                    "narration": "华强走到台秤旁，再次低头检查秤盘。",
                    "dialogue": "我再看看这里。",
                    "stageDirection": "华强检查台秤。",
                }
            ]
        }

        with self.assertRaisesRegex(ValueError, "高度重复"):
            AiService._validate_story_progress(node, context)


class BilibiliProtocolTests(unittest.TestCase):
    def test_auto_start_requires_credentials_and_identity_code(self) -> None:
        ready = Settings(
            bilibili_app_id=7,
            bilibili_access_key="access",
            bilibili_access_secret="secret",
            bilibili_identity_code="identity",
        )
        missing_code = Settings(
            bilibili_app_id=7,
            bilibili_access_key="access",
            bilibili_access_secret="secret",
            bilibili_identity_code="",
        )
        self.assertTrue(ready.bilibili_auto_start_ready)
        self.assertFalse(missing_code.bilibili_auto_start_ready)

    def test_signed_request_matches_hmac_sha256(self) -> None:
        body, headers = build_signed_request(
            {"code": "测试", "app_id": 7},
            Credentials("access-key", "secret"),
            now_seconds=1_700_000_000,
            nonce="fixed-nonce",
        )
        signing_keys = sorted(
            key for key in headers if key.startswith("x-bili-")
        )
        signing_text = "\n".join(
            f"{key}:{headers[key]}" for key in signing_keys
        )
        expected = hmac.new(
            b"secret", signing_text.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        self.assertEqual(headers["Authorization"], expected)
        self.assertEqual(json.loads(body)["code"], "测试")

    def test_plain_and_zlib_command_packets(self) -> None:
        command = {
            "cmd": "LIVE_OPEN_PLATFORM_DM",
            "data": {"uname": "Brooke01", "msg": "111"},
        }
        packet = encode_packet(
            OP_MESSAGE,
            json.dumps(command, ensure_ascii=False).encode("utf-8"),
        )
        self.assertEqual(parse_commands(packet), [command])

        compressed = zlib.compress(packet)
        outer = (
            struct.pack(
                ">IHHII", 16 + len(compressed), 16, 2, OP_MESSAGE, 1
            )
            + compressed
        )
        self.assertEqual(parse_commands(outer), [command])
        self.assertEqual(len(decode_packets(outer)), 1)


if __name__ == "__main__":
    unittest.main()
