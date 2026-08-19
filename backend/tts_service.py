from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import threading
import uuid
from pathlib import Path
from typing import Any

import httpx

from backend.config import Settings


class TtsService:
    def __init__(self, settings: Settings, output_dir: Path) -> None:
        self.settings = settings
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._cache_locks: dict[str, asyncio.Lock] = {}
        self._pinned_cache_ids: set[str] = set()
        self._dots_client: Any | None = None
        self._dots_prompt_file: Any | None = None
        self._dots_client_lock = threading.Lock()
        self._pin_known_presets()

    @property
    def configured(self) -> bool:
        return self.settings.tts_configured

    def has_cached(self, text: str, mood: str) -> bool:
        path = self._cache_path(self._cache_id(text, mood))
        return path.is_file() and path.stat().st_size > 0

    async def synthesize(
        self, text: str, mood: str
    ) -> tuple[str, Path] | None:
        if not self.configured:
            return None
        clip_id = self._cache_id(text, mood)
        path = self._cache_path(clip_id)
        cached = self._cached_clip(clip_id, path)
        if cached:
            return cached
        lock = self._cache_locks.setdefault(clip_id, asyncio.Lock())
        async with lock:
            cached = self._cached_clip(clip_id, path)
            if cached:
                return cached
            if self.settings.tts_provider == "dots":
                audio = await asyncio.to_thread(
                    self._synthesize_dots, text
                )
            else:
                audio = await self._synthesize_volcengine(text, mood)
            if not audio:
                raise ValueError("语音服务未返回可识别的音频")
            path.write_bytes(audio)
            self._trim_cache()
            return clip_id, path

    async def prewarm(
        self,
        presets: tuple[tuple[str, str], ...],
        concurrency: int = 1,
    ) -> None:
        if not self.configured:
            return
        for text, mood in presets:
            self._pinned_cache_ids.add(self._cache_id(text, mood))
        semaphore = asyncio.Semaphore(max(1, min(concurrency, 6)))

        async def warm_one(text: str, mood: str) -> None:
            if self.has_cached(text, mood):
                return
            try:
                async with semaphore:
                    await self.synthesize(text, mood)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                print(f"预设解说语音生成失败：{error}")

        await asyncio.gather(
            *(warm_one(text, mood) for text, mood in presets)
        )

    def _cache_id(self, text: str, mood: str) -> str:
        if self.settings.tts_provider == "dots":
            provider_identity = (
                self.settings.dots_tts_base_url,
                self.settings.dots_tts_prompt_audio,
                self.settings.dots_tts_prompt_text,
                self.settings.dots_tts_ode_method,
                str(self.settings.dots_tts_num_steps),
                str(self.settings.dots_tts_guidance_scale),
                str(self.settings.dots_tts_speaker_scale),
                str(self.settings.dots_tts_normalize_text),
                str(self.settings.dots_tts_seed),
            )
        else:
            provider_identity = (
                self.settings.tts_create_url,
                self.settings.tts_model,
                str(self.settings.tts_sample_rate),
                str(self.settings.tts_speech_rate),
            )
        identity = "\0".join(
            (
                "commentary-tts-v2-female-host",
                self.settings.tts_provider,
                *provider_identity,
                mood,
                text,
            )
        )
        return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]

    def _cache_path(self, clip_id: str) -> Path:
        extension = (
            ".wav" if self.settings.tts_provider == "dots" else ".mp3"
        )
        return self.output_dir / f"{clip_id}{extension}"

    def _pin_known_presets(self) -> None:
        try:
            from backend.commentary_presets import (
                PRESET_COMMENTARY_LINES,
            )
        except ImportError:
            return
        self._pinned_cache_ids.update(
            self._cache_id(text, mood)
            for text, mood in PRESET_COMMENTARY_LINES
        )

    @staticmethod
    def _cached_clip(
        clip_id: str, path: Path
    ) -> tuple[str, Path] | None:
        if not path.is_file() or path.stat().st_size == 0:
            return None
        path.touch()
        return clip_id, path

    async def _synthesize_volcengine(
        self, text: str, mood: str
    ) -> bytes:
        request_id = str(uuid.uuid4())
        prompt = self._audio_prompt(text, mood)
        timeout = httpx.Timeout(self.settings.tts_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                self.settings.tts_create_url,
                headers={
                    "Content-Type": "application/json",
                    "X-Api-Key": self.settings.tts_api_key,
                    "X-Api-Request-Id": request_id,
                },
                json={
                    "model": self.settings.tts_model,
                    "text_prompt": prompt,
                    "audio_config": {
                        "format": "mp3",
                        "sample_rate": self.settings.tts_sample_rate,
                        "pitch_rate": 0,
                        "speech_rate": self.settings.tts_speech_rate,
                        "loudness_rate": 0,
                    },
                    "watermark": {},
                },
            )
            response.raise_for_status()
            return await self._read_audio_response(client, response)

    def _synthesize_dots(self, text: str) -> bytes:
        from gradio_client import Client, handle_file

        with self._dots_client_lock:
            if self._dots_client is None:
                self._dots_client = Client(
                    self.settings.dots_tts_base_url,
                    verbose=False,
                )
            if self._dots_prompt_file is None:
                self._dots_prompt_file = handle_file(
                    self.settings.dots_tts_prompt_audio
                )
            client = self._dots_client
            prompt_file = self._dots_prompt_file
        result = client.predict(
            text=text,
            synthesis_mode="tts",
            prompt_audio_path=prompt_file,
            prompt_text=self.settings.dots_tts_prompt_text,
            ode_method=self.settings.dots_tts_ode_method,
            num_steps=self.settings.dots_tts_num_steps,
            guidance_scale=self.settings.dots_tts_guidance_scale,
            speaker_scale=self.settings.dots_tts_speaker_scale,
            normalize_text=self.settings.dots_tts_normalize_text,
            seed=self.settings.dots_tts_seed,
            api_name="/run_synthesis",
        )
        output = result[0] if isinstance(result, (list, tuple)) else result
        if isinstance(output, dict):
            output = output.get("path")
        elif hasattr(output, "path"):
            output = output.path
        if not output:
            raise ValueError("Dots TTS 未返回音频文件")
        output_path = Path(str(output))
        if not output_path.is_file():
            raise ValueError("Dots TTS 返回的音频文件不存在")
        return output_path.read_bytes()

    async def _read_audio_response(
        self,
        client: httpx.AsyncClient,
        response: httpx.Response,
    ) -> bytes:
        content_type = response.headers.get(
            "content-type", ""
        ).lower()
        if content_type.startswith("audio/"):
            return response.content
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("语音服务返回格式无效")
        code = payload.get("code")
        if code not in (None, 0, "0"):
            message = payload.get("message") or payload.get("msg")
            raise ValueError(f"语音生成失败：{message or code}")
        encoded = self._find_string(
            payload,
            {
                "audio",
                "audio_data",
                "audio_base64",
                "base64_audio",
            },
        )
        if encoded:
            if encoded.startswith(("https://", "http://")):
                audio_response = await client.get(encoded)
                audio_response.raise_for_status()
                return audio_response.content
            decoded = self._decode_audio(encoded)
            if decoded:
                return decoded
        url = self._find_string(
            payload, {"url", "audio_url", "download_url"}
        )
        if url and url.startswith(("https://", "http://")):
            audio_response = await client.get(url)
            audio_response.raise_for_status()
            return audio_response.content
        raise ValueError("语音响应中没有音频数据或下载地址")

    @classmethod
    def _find_string(
        cls, value: Any, keys: set[str]
    ) -> str | None:
        if isinstance(value, dict):
            for key, item in value.items():
                if key.lower() in keys and isinstance(item, str) and item:
                    return item
            for item in value.values():
                found = cls._find_string(item, keys)
                if found:
                    return found
        elif isinstance(value, list):
            for item in value:
                found = cls._find_string(item, keys)
                if found:
                    return found
        return None

    @staticmethod
    def _decode_audio(value: str) -> bytes | None:
        encoded = value.split(",", 1)[-1] if value.startswith("data:") else value
        encoded = "".join(encoded.split())
        try:
            return base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            return None

    @staticmethod
    def _audio_prompt(text: str, mood: str) -> str:
        delivery = {
            "ENERGETIC": "有精神、带笑意的游戏主播语气，节奏明快",
            "SUSPENSE": "稍微压低声线、像等反转一样留住悬念",
            "PLAYFUL": "灵动、幽默、像刚看到有趣弹幕一样带着笑意",
            "CALM": "自然、清楚、像陪观众一起看剧情一样放松",
            "URGENT": "略微加快语速、有倒计时感但咬字清楚",
            "UNCANNY": "轻轻压低声音、略带诡异感但仍然自然清楚",
        }.get(mood, "自然、有感情的中文游戏主播语气")
        safe_text = text.replace('"', "“").replace("\n", " ")
        return (
            "[Language: Chinese only.]\n"
            "[Environment: clean broadcast booth, no music, no sound effects, "
            "no audience noise.]\n"
            "一名年轻女性游戏主播，声音灵动自然，不端腔，不像广告配音，"
            f"用{delivery}说道："
            f"“{safe_text}”\n"
            "[Outro: brief silence.]"
        )

    def _trim_cache(self) -> None:
        files = sorted(
            (
                *self.output_dir.glob("*.mp3"),
                *self.output_dir.glob("*.wav"),
            ),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
        removable = [
            item
            for item in files
            if item.stem not in self._pinned_cache_ids
        ]
        for stale in removable[512:]:
            stale.unlink(missing_ok=True)
