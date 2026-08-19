from __future__ import annotations

import asyncio
import copy
import re
import time
from contextlib import suppress
from dataclasses import dataclass
from typing import Any

from backend.ai_service import AiService
from backend.commentary_presets import (
    ROUND_CUE_SCHEDULE,
    VOTE_RESULT_LINES,
    build_round_script_segments,
    choose_round_cue,
)
from backend.config import Settings
from backend.live_hub import LiveEventHub
from backend.tts_service import TtsService


@dataclass(frozen=True)
class CommentaryJob:
    reason: str
    state: dict[str, Any]
    danmaku: list[dict[str, str]]
    entrants: list[dict[str, str]]


@dataclass(frozen=True)
class CommentaryAudioJob:
    text: str
    mood: str
    reason: str
    node_id: str
    created_at: float


class CommentaryService:
    def __init__(
        self,
        settings: Settings,
        ai: AiService,
        tts: TtsService,
        source_hub: LiveEventHub,
        output_hub: LiveEventHub,
    ) -> None:
        self.settings = settings
        self.ai = ai
        self.tts = tts
        self.source_hub = source_hub
        self.output_hub = output_hub
        self.state: dict[str, Any] = {}
        self.recent_danmaku: list[dict[str, str]] = []
        self.recent_entrants: list[dict[str, str]] = []
        self._last_spoken_at = 0.0
        self._last_danmaku_queued_at = 0.0
        self._last_danmaku_id = ""
        self._last_welcome_queued_at = 0.0
        self._last_entrant_id = ""
        self._last_vote_shift_at = 0.0
        self._last_vote_result_at = 0.0
        self._last_scene_action_at = 0.0
        self._briefed_round_key = ""
        self._last_idle_key = ""
        self._round_cues_played: set[str] = set()
        self._seen_entrants: set[str] = set()
        self._pending_reasons: set[str] = set()
        self._sequence = 0
        self._jobs: asyncio.PriorityQueue[
            tuple[int, int, CommentaryJob]
        ] = asyncio.PriorityQueue(maxsize=12)
        self._audio_sequence = 0
        self._audio_jobs: asyncio.PriorityQueue[
            tuple[int, int, CommentaryAudioJob]
        ] = asyncio.PriorityQueue(maxsize=32)
        self._tasks: list[asyncio.Task[Any]] = []
        self._latest_payload: dict[str, Any] | None = None

    @property
    def status(self) -> dict[str, Any]:
        return {
            "state": "ready" if self.state else "waiting_for_game",
            "aiConfigured": self.ai.configured,
            "ttsConfigured": self.tts.configured,
            "ttsProvider": self.settings.tts_provider,
            "voiceEnabled": self.tts.configured,
            "latestLine": copy.deepcopy(self._latest_payload),
        }

    def start(self) -> None:
        if self._tasks:
            return
        self._tasks = [
            asyncio.create_task(self._consume_live_events()),
            asyncio.create_task(self._schedule_loop()),
            asyncio.create_task(self._worker_loop()),
            asyncio.create_task(self._tts_worker_loop()),
        ]

    async def close(self) -> None:
        tasks, self._tasks = self._tasks, []
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError):
                await task

    def update_state(self, state: dict[str, Any]) -> None:
        previous = self.state
        self.state = copy.deepcopy(state)
        is_voting = bool(state.get("votingOpen"))
        round_key = (
            f"{state.get('nodeId', '')}:"
            f"{state.get('routeLength', 0)}"
        )
        if (
            is_voting
            and state.get("choices")
            and round_key != self._briefed_round_key
        ):
            self._briefed_round_key = round_key
            self._round_cues_played.clear()
            self._last_spoken_at = time.monotonic()
            self._enqueue_nowait("round_briefing", priority=0)
        if is_voting:
            self._schedule_round_cues(state, round_key)
        old_result = previous.get("voteResult")
        new_result = state.get("voteResult")
        if not old_result and new_result:
            self._last_vote_result_at = time.monotonic()
            self._discard_pending_audio()
            self._tasks.append(
                asyncio.create_task(
                    self._publish_vote_result(state)
                )
            )
        old_performance = previous.get("performance") or {}
        new_performance = state.get("performance") or {}
        beat_label = str(new_performance.get("beatLabel") or "")
        now = time.monotonic()
        if (
            beat_label
            and beat_label != str(old_performance.get("beatLabel") or "")
            and now - self._last_scene_action_at >= 7
            and not is_voting
            and not new_result
        ):
            self._last_scene_action_at = now
            self._enqueue_nowait("scene_action", priority=4)
        if (
            is_voting
            and self._leader(previous.get("votes"))
            != self._leader(state.get("votes"))
            and self._total_votes(state.get("votes")) >= 2
            and now - self._last_vote_shift_at >= 12
        ):
            self._last_vote_shift_at = now
            self._enqueue_nowait("vote_shift", priority=3)

    async def _consume_live_events(self) -> None:
        async for envelope in self.source_hub.subscribe(
            {"state": "commentary_listener"}
        ):
            if not envelope or envelope.get("type") != "bilibili":
                continue
            payload = envelope.get("payload") or {}
            command = str(payload.get("cmd") or "")
            data = payload.get("data") or {}
            if command in {
                "LIVE_OPEN_PLATFORM_LIVE_ROOM_ENTER",
                "OPEN_LIVEROOM_LIVE_ROOM_ENTER",
                "OPEN_PLATFORM_LIVE_ROOM_ENTER",
            }:
                entrant_id = str(
                    data.get("open_id")
                    or data.get("union_id")
                    or data.get("uid")
                    or ""
                )
                if not entrant_id or entrant_id in self._seen_entrants:
                    continue
                self._seen_entrants.add(entrant_id)
                if len(self._seen_entrants) > 1024:
                    self._seen_entrants = {entrant_id}
                self._last_entrant_id = entrant_id
                self.recent_entrants.append(
                    {
                        "id": entrant_id,
                        "uname": self._clean_text(
                            data.get("uname") or "新观众", 16
                        ),
                    }
                )
                self.recent_entrants = self.recent_entrants[-8:]
                continue
            if command != "LIVE_OPEN_PLATFORM_DM":
                continue
            message_id = str(data.get("msg_id") or "")
            message = self._clean_text(data.get("msg"), 60)
            if not message_id or not message:
                continue
            self._last_danmaku_id = message_id
            self.recent_danmaku.append(
                {
                    "id": message_id,
                    "uname": self._clean_text(
                        data.get("uname") or "观众", 16
                    ),
                    "msg": message,
                }
            )
            self.recent_danmaku = self.recent_danmaku[-8:]
            if re.match(
                r"^[ABC](?:\s+|[:：\-—]+)\s*\S+",
                message,
                flags=re.IGNORECASE,
            ):
                self._enqueue_nowait("custom_proposal", priority=0)
                self._last_danmaku_id = ""

    async def _schedule_loop(self) -> None:
        while True:
            await asyncio.sleep(1)
            if not self.state:
                continue
            now = time.monotonic()
            if (
                self.recent_entrants
                and self.recent_entrants[-1]["id"]
                == self._last_entrant_id
                and now - self._last_welcome_queued_at
                >= self.settings.commentary_welcome_seconds
            ):
                self._last_welcome_queued_at = now
                self._last_entrant_id = ""
                self._enqueue_nowait("viewer_enter", priority=2)
                continue
            if (
                self.recent_danmaku
                and self.recent_danmaku[-1]["id"]
                == self._last_danmaku_id
                and now - self._last_danmaku_queued_at
                >= self.settings.commentary_danmaku_seconds
            ):
                self._last_danmaku_queued_at = now
                self._last_danmaku_id = ""
                self._enqueue_nowait("danmaku", priority=0)
                continue
            if (
                not self.state.get("votingOpen")
                and not self.state.get("voteResult")
                and not (
                    self.state.get("performance") or {}
                ).get("scenePerforming")
                and not (
                    self.state.get("performance") or {}
                ).get("directorExecuting")
                and
                now - self._last_spoken_at
                >= self.settings.commentary_idle_seconds
            ):
                idle_key = (
                    f"{self.state.get('nodeId', '')}:"
                    f"{self.state.get('routeLength', 0)}"
                )
                if idle_key != self._last_idle_key:
                    self._last_idle_key = idle_key
                    self._enqueue_nowait("idle", priority=5)

    async def _worker_loop(self) -> None:
        while True:
            _, _, job = await self._jobs.get()
            try:
                if not self._job_still_relevant(job):
                    continue
                result = await self.ai.generate_commentary(
                    {
                        "reason": job.reason,
                        "state": job.state,
                        "recentDanmaku": job.danmaku,
                        "recentEntrants": job.entrants,
                        "rules": {
                            "voteSyntax": "发送 A、B 或 C",
                            "customSyntax": "发送 A 自定义描述可改写A选项",
                        },
                    }
                )
                if not self._job_still_relevant(job):
                    continue
                if job.reason == "round_briefing":
                    speech_segments = list(
                        build_round_script_segments(job.state)
                    )
                elif job.reason in {
                    "vote_result",
                    "vote_shift",
                    "idle",
                }:
                    speech_segments = [result["text"]]
                else:
                    speech_segments = self._speech_segments(
                        result["text"]
                    )
                await self._publish_commentary(
                    {
                        "text": (
                            speech_segments[0]
                            if self.tts.configured
                            else result["text"]
                        ),
                        "mood": result["mood"],
                        "reason": job.reason,
                        "audioUrl": None,
                    },
                )
                self._last_spoken_at = time.monotonic()
                for segment in speech_segments:
                    self._enqueue_audio(
                        CommentaryAudioJob(
                            text=segment,
                            mood=result["mood"],
                            reason=job.reason,
                            node_id=str(job.state.get("nodeId") or ""),
                            created_at=time.monotonic(),
                        )
                    )
            except asyncio.CancelledError:
                raise
            except Exception as error:
                print(f"解说任务失败：{error}")
            finally:
                self._pending_reasons.discard(job.reason)
                self._jobs.task_done()

    async def _tts_worker_loop(self) -> None:
        while True:
            _, _, job = await self._audio_jobs.get()
            try:
                if not self._audio_job_still_relevant(job):
                    continue
                clip = await self.tts.synthesize(job.text, job.mood)
                if not clip or not self._audio_job_still_relevant(job):
                    continue
                await self._publish_commentary(
                    {
                        "text": job.text,
                        "mood": job.mood,
                        "reason": job.reason,
                        "interrupt": (
                            job.reason == "custom_proposal"
                        ),
                        "audioUrl": (
                            f"/api/commentary/audio/{clip[0]}"
                        ),
                    },
                )
            except asyncio.CancelledError:
                raise
            except Exception as error:
                print(f"解说语音生成失败，本轮仅显示字幕：{error}")
            finally:
                self._audio_jobs.task_done()

    async def _publish_vote_result(
        self, state: dict[str, Any]
    ) -> None:
        winner = str(
            (state.get("voteResult") or {}).get("winner", "A")
        )
        text, mood = VOTE_RESULT_LINES.get(
            winner, VOTE_RESULT_LINES["A"]
        )
        payload = {
            "text": text,
            "mood": mood,
            "reason": "vote_result",
            "audioUrl": None,
            "interrupt": True,
        }
        await self._publish_commentary(payload)
        self._last_spoken_at = time.monotonic()
        if not self.tts.configured:
            return
        try:
            clip = await self.tts.synthesize(text, mood)
            if not clip:
                return
            await self._publish_commentary(
                {
                    **payload,
                    "audioUrl": (
                        f"/api/commentary/audio/{clip[0]}"
                    ),
                },
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            print(f"投票结果语音播放失败：{error}")

    def _discard_pending_audio(self) -> None:
        while True:
            try:
                self._audio_jobs.get_nowait()
                self._audio_jobs.task_done()
            except asyncio.QueueEmpty:
                return

    async def _publish_commentary(
        self, payload: dict[str, Any]
    ) -> None:
        self._latest_payload = copy.deepcopy(payload)
        await self.output_hub.publish("commentary", payload)

    def _enqueue_audio(self, job: CommentaryAudioJob) -> None:
        if not self.tts.configured:
            return
        self._audio_sequence += 1
        with suppress(asyncio.QueueFull):
            self._audio_jobs.put_nowait(
                (
                    self._audio_priority(job.reason),
                    self._audio_sequence,
                    job,
                )
            )

    @staticmethod
    def _audio_priority(reason: str) -> int:
        if reason == "custom_proposal":
            return 0
        if reason == "danmaku":
            return 1
        if reason in {"viewer_enter", "vote_shift"}:
            return 2
        if reason in {"round_briefing", "scene_action"}:
            return 3
        if reason.startswith("preset:"):
            return 5
        if reason == "idle":
            return 8
        return 4

    def _enqueue_nowait(self, reason: str, priority: int) -> None:
        if not self.state or reason in self._pending_reasons:
            return
        self._sequence += 1
        job = CommentaryJob(
            reason=reason,
            state=copy.deepcopy(self.state),
            danmaku=copy.deepcopy(self.recent_danmaku[-5:]),
            entrants=copy.deepcopy(self.recent_entrants[-3:]),
        )
        try:
            self._jobs.put_nowait((priority, self._sequence, job))
            self._pending_reasons.add(reason)
        except asyncio.QueueFull:
            return

    def _schedule_round_cues(
        self, state: dict[str, Any], round_key: str
    ) -> None:
        remaining = int(self._number(state.get("remainingSeconds")))
        node_id = str(state.get("nodeId") or "")
        for threshold, cue_id in ROUND_CUE_SCHEDULE:
            if remaining > threshold or cue_id in self._round_cues_played:
                continue
            text, mood = choose_round_cue(
                cue_id, round_key, state
            )
            self._round_cues_played.add(cue_id)
            self._enqueue_audio(
                CommentaryAudioJob(
                    text=text,
                    mood=mood,
                    reason=f"preset:{cue_id}",
                    node_id=node_id,
                    created_at=time.monotonic(),
                )
            )

    def _job_still_relevant(self, job: CommentaryJob) -> bool:
        if job.reason in {"danmaku", "viewer_enter"}:
            return True
        if job.state.get("nodeId") != self.state.get("nodeId"):
            return job.reason == "vote_result"
        if job.reason == "vote_shift":
            return bool(self.state.get("votingOpen"))
        return True

    def _audio_job_still_relevant(
        self, job: CommentaryAudioJob
    ) -> bool:
        if time.monotonic() - job.created_at > 55:
            return False
        if (
            job.reason
            in {"custom_proposal", "danmaku", "viewer_enter"}
            and job.created_at < self._last_vote_result_at
        ):
            return False
        if job.reason in {"danmaku", "viewer_enter"}:
            return True
        if job.reason == "vote_result":
            return True
        if job.reason.startswith("preset:"):
            return (
                bool(self.state.get("votingOpen"))
                and job.node_id
                == str(self.state.get("nodeId") or "")
            )
        return job.node_id == str(self.state.get("nodeId") or "")

    @staticmethod
    def _clean_text(value: Any, maximum: int) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()[:maximum]

    @classmethod
    def _speech_segments(cls, text: str) -> list[str]:
        normalized = cls._clean_text(text, 240)
        clauses = re.findall(r"[^。！？；]+[。！？；]?", normalized)
        segments: list[str] = []
        for clause in clauses:
            clause = clause.strip()
            if not clause:
                continue
            if len(clause) <= 38:
                segments.append(clause)
                continue
            pieces = re.findall(r"[^，、：]+[，、：]?", clause)
            current = ""
            for piece in pieces:
                piece = piece.strip()
                if not piece:
                    continue
                if current and len(current) + len(piece) > 38:
                    segments.append(current)
                    current = piece
                else:
                    current += piece
            if current:
                segments.append(current)
        return segments or [normalized]

    @staticmethod
    def _number(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0

    @classmethod
    def _total_votes(cls, votes: Any) -> int:
        if not isinstance(votes, dict):
            return 0
        return sum(int(cls._number(value)) for value in votes.values())

    @classmethod
    def _leader(cls, votes: Any) -> str | None:
        if not isinstance(votes, dict) or cls._total_votes(votes) == 0:
            return None
        return max(votes, key=lambda key: cls._number(votes[key]))
