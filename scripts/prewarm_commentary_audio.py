from __future__ import annotations

import asyncio
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.commentary_presets import PRESET_COMMENTARY_LINES
from backend.config import settings
from backend.tts_service import TtsService


async def main() -> int:
    output_dir = (
        PROJECT_ROOT / "backend" / ".runtime" / "commentary_audio"
    )
    service = TtsService(settings, output_dir)
    if settings.tts_provider != "volcengine":
        print(
            "语音包要求使用火山引擎，请设置 "
            "TTS_PROVIDER=volcengine。"
        )
        return 1
    if not service.configured:
        print(
            f"TTS 未配置完成，当前提供方：{settings.tts_provider}"
        )
        return 1
    total = len(PRESET_COMMENTARY_LINES)
    cached_before = sum(
        service.has_cached(text, mood)
        for text, mood in PRESET_COMMENTARY_LINES
    )
    print(
        f"开始使用火山引擎预生成主播解说：共 {total} 条，"
        f"已有缓存 {cached_before} 条。"
    )
    concurrency = max(
        1, min(settings.commentary_prewarm_concurrency, 6)
    )
    print(f"并行生成数：{concurrency}")
    await service.prewarm(
        PRESET_COMMENTARY_LINES,
        concurrency=concurrency,
    )
    cached_after = sum(
        service.has_cached(text, mood)
        for text, mood in PRESET_COMMENTARY_LINES
    )
    print(
        f"预生成完成：{cached_after}/{total} 条可直接播放。"
    )
    return 0 if cached_after == total else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
