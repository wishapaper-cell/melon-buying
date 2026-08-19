from __future__ import annotations

import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8767"))

    ai_base_url: str = os.getenv(
        "AI_BASE_URL", "https://api.openai.com/v1"
    ).rstrip("/")
    ai_api_key: str = os.getenv("AI_API_KEY", "")
    ai_model: str = os.getenv("AI_MODEL", "")
    ai_timeout_seconds: float = float(
        os.getenv("AI_TIMEOUT_MS", "15000")
    ) / 1000

    tts_provider: str = os.getenv(
        "TTS_PROVIDER", "volcengine"
    ).strip().lower()
    tts_api_key: str = os.getenv("VOLC_TTS_API_KEY", "")
    tts_create_url: str = os.getenv(
        "VOLC_TTS_CREATE_URL",
        "https://openspeech.bytedance.com/api/v3/tts/create",
    )
    tts_model: str = os.getenv("VOLC_TTS_MODEL", "seed-audio-1.0")
    tts_timeout_seconds: float = float(
        os.getenv("VOLC_TTS_TIMEOUT_MS", "300000")
    ) / 1000
    tts_sample_rate: int = int(
        os.getenv("VOLC_TTS_SAMPLE_RATE", "48000")
    )
    tts_speech_rate: int = int(
        os.getenv("VOLC_TTS_SPEECH_RATE", "8")
    )
    dots_tts_base_url: str = os.getenv(
        "DOTS_TTS_BASE_URL",
        "https://px-wj-2.matpool.com:29920",
    ).rstrip("/")
    dots_tts_prompt_audio: str = os.getenv(
        "DOTS_TTS_PROMPT_AUDIO", ""
    )
    dots_tts_prompt_text: str = os.getenv(
        "DOTS_TTS_PROMPT_TEXT", ""
    )
    dots_tts_ode_method: str = os.getenv(
        "DOTS_TTS_ODE_METHOD", "euler"
    )
    dots_tts_num_steps: float = float(
        os.getenv("DOTS_TTS_NUM_STEPS", "10")
    )
    dots_tts_guidance_scale: float = float(
        os.getenv("DOTS_TTS_GUIDANCE_SCALE", "1.2")
    )
    dots_tts_speaker_scale: float = float(
        os.getenv("DOTS_TTS_SPEAKER_SCALE", "1.5")
    )
    dots_tts_normalize_text: bool = os.getenv(
        "DOTS_TTS_NORMALIZE_TEXT", "false"
    ).strip().lower() in {"1", "true", "yes", "on"}
    dots_tts_seed: int = int(os.getenv("DOTS_TTS_SEED", "42"))
    commentary_idle_seconds: float = float(
        os.getenv("COMMENTARY_IDLE_SECONDS", "18")
    )
    commentary_danmaku_seconds: float = float(
        os.getenv("COMMENTARY_DANMAKU_SECONDS", "1.5")
    )
    commentary_welcome_seconds: float = float(
        os.getenv("COMMENTARY_WELCOME_SECONDS", "8")
    )
    commentary_prewarm_concurrency: int = int(
        os.getenv("COMMENTARY_PREWARM_CONCURRENCY", "3")
    )

    bilibili_app_id: int = int(os.getenv("BILIBILI_APP_ID", "0") or "0")
    bilibili_access_key: str = os.getenv("BILIBILI_ACCESS_KEY", "")
    bilibili_access_secret: str = os.getenv("BILIBILI_ACCESS_SECRET", "")
    bilibili_identity_code: str = os.getenv(
        "BILIBILI_IDENTITY_CODE", ""
    )
    bilibili_api_base: str = "https://live-open.biliapi.com"

    @property
    def ai_configured(self) -> bool:
        return bool(self.ai_api_key and self.ai_model)

    @property
    def bilibili_configured(self) -> bool:
        return bool(
            self.bilibili_app_id
            and self.bilibili_access_key
            and self.bilibili_access_secret
        )

    @property
    def bilibili_auto_start_ready(self) -> bool:
        return bool(
            self.bilibili_configured and self.bilibili_identity_code
        )

    @property
    def tts_configured(self) -> bool:
        if self.tts_provider == "dots":
            return bool(
                self.dots_tts_base_url
                and self.dots_tts_prompt_audio
                and self.dots_tts_prompt_text
            )
        if self.tts_provider == "volcengine":
            return bool(self.tts_api_key)
        return False


settings = Settings()
