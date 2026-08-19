from __future__ import annotations

import asyncio
import json
import runpy
import sys
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Any
from datetime import datetime
from zoneinfo import ZoneInfo

if __name__ == "__main__" and __package__ in {None, ""}:
    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    runpy.run_path(
        str(project_root / "main.py"),
        run_name="__main__",
    )
    raise SystemExit(0)

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.ai_service import AiService
from backend.bilibili.client import BilibiliLiveClient
from backend.bilibili.signature import Credentials
from backend.commentary_service import CommentaryService
from backend.config import settings
from backend.live_hub import LiveEventHub, live_hub
from backend.tts_service import TtsService


class InteractionRequest(BaseModel):
    context: dict[str, Any]


class ProposalRequest(BaseModel):
    context: dict[str, Any]
    proposals: list[dict[str, Any]] = Field(
        default_factory=list, max_length=200
    )


class DialogueRequest(BaseModel):
    context: dict[str, Any]


class DirectorRequest(BaseModel):
    context: dict[str, Any]


class StoryAgentRequest(BaseModel):
    context: dict[str, Any]


class StoryProposalRequest(BaseModel):
    context: dict[str, Any]
    proposals: list[dict[str, Any]] = Field(
        default_factory=list, max_length=60
    )


class LiveStartRequest(BaseModel):
    code: str = Field(min_length=1, max_length=256)


class CommentaryStateRequest(BaseModel):
    state: dict[str, Any]


ai_service = AiService(settings)
commentary_hub = LiveEventHub()
commentary_audio_dir = (
    Path(__file__).resolve().parent / ".runtime" / "commentary_audio"
)
tts_service = TtsService(settings, commentary_audio_dir)
commentary_service = CommentaryService(
    settings,
    ai_service,
    tts_service,
    live_hub,
    commentary_hub,
)
bilibili = (
    BilibiliLiveClient(
        settings.bilibili_app_id,
        Credentials(
            settings.bilibili_access_key,
            settings.bilibili_access_secret,
        ),
        settings.bilibili_api_base,
        live_hub,
    )
    if settings.bilibili_configured
    else None
)
bilibili_start_task: asyncio.Task[None] | None = None


def ensure_bilibili_started() -> None:
    global bilibili_start_task
    if (
        not bilibili
        or not settings.bilibili_identity_code
        or bilibili.status.get("state") in {"starting", "connected"}
        or (
            bilibili_start_task is not None
            and not bilibili_start_task.done()
        )
    ):
        return

    async def connect() -> None:
        try:
            await bilibili.start(settings.bilibili_identity_code)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            await live_hub.publish(
                "system",
                {
                    "level": "error",
                    "message": f"B站直播自动连接失败：{error}",
                },
            )

    bilibili_start_task = asyncio.create_task(
        connect(),
        name="bilibili-auto-start",
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global bilibili_start_task
    commentary_service.start()
    yield
    if bilibili_start_task and not bilibili_start_task.done():
        bilibili_start_task.cancel()
        with suppress(asyncio.CancelledError):
            await bilibili_start_task
    if bilibili:
        await bilibili.close()
    bilibili_start_task = None
    await commentary_service.close()


app = FastAPI(
    title="华强买瓜：无限世界线",
    version="0.2.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "backend": "fastapi",
        "aiConfigured": ai_service.configured,
        "ttsConfigured": tts_service.configured,
        "ttsProvider": settings.tts_provider,
        "commentary": commentary_service.status,
        "bilibiliConfigured": settings.bilibili_configured,
        "bilibiliAutoStartReady": settings.bilibili_auto_start_ready,
        "bilibiliStatus": (
            bilibili.status
            if bilibili
            else {"state": "unconfigured"}
        ),
    }


@app.get("/api/world/time")
async def world_time() -> dict[str, Any]:
    timezone = ZoneInfo("Asia/Shanghai")
    now = datetime.now(timezone)
    hour = now.hour
    phase = (
        "DAWN"
        if 5 <= hour < 6
        else "DAY"
        if 6 <= hour < 18
        else "DUSK"
        if 18 <= hour < 19
        else "NIGHT"
    )
    return {
        "serverTime": now.isoformat(),
        "timezone": "Asia/Shanghai",
        "phase": phase,
    }


@app.post("/api/interaction/options")
async def interaction_options(
    request: InteractionRequest,
) -> dict[str, Any]:
    _validate_interaction_context(request.context)
    return await ai_service.generate_options(request.context)


@app.post("/api/interaction/proposal")
async def interaction_proposal(
    request: ProposalRequest,
) -> dict[str, Any]:
    _validate_interaction_context(request.context)
    return await ai_service.synthesize_proposal(
        request.proposals, request.context
    )


@app.post("/api/interaction/dialogue")
async def interaction_dialogue(
    request: DialogueRequest,
) -> dict[str, Any]:
    if not request.context.get("actionResult") or not request.context.get(
        "option"
    ):
        raise HTTPException(400, "对话上下文无效")
    return await ai_service.generate_dialogue(request.context)


@app.post("/api/director/plan")
async def director_plan(request: DirectorRequest) -> dict[str, Any]:
    required = {
        "nodeId",
        "winningChoiceId",
        "worldRevision",
        "allowedActorIds",
        "allowedObjectIds",
    }
    if not required.issubset(request.context):
        raise HTTPException(400, "剧情导演上下文无效")
    return await ai_service.generate_director_plan(request.context)


@app.post("/api/story/custom-choice")
async def story_custom_choice(
    request: StoryProposalRequest,
) -> dict[str, Any]:
    if not request.context.get("nodeId") or not request.context.get(
        "nextNodeId"
    ) or request.context.get("choiceId") not in {"A", "B", "C"}:
        raise HTTPException(400, "弹幕自定义选项上下文无效")
    return await ai_service.generate_story_custom_choice(
        request.proposals, request.context
    )


@app.post("/api/story/continuation/options")
async def story_continuation_options(
    request: StoryAgentRequest,
) -> dict[str, Any]:
    if not request.context.get("nodeId") or not request.context.get(
        "nextNodeIds"
    ):
        raise HTTPException(400, "剧情续写选项上下文无效")
    return await ai_service.generate_story_continuation_options(
        request.context
    )


@app.post("/api/story/continuation/node")
async def story_continuation_node(
    request: StoryAgentRequest,
) -> dict[str, Any]:
    required = {"nodeId", "targetNodeId", "winningChoice"}
    if not required.issubset(request.context):
        raise HTTPException(400, "剧情续写节点上下文无效")
    return await ai_service.generate_story_continuation_node(
        request.context
    )


@app.get("/api/live/events")
async def live_events(request: Request) -> StreamingResponse:
    ensure_bilibili_started()
    initial = (
        bilibili.status if bilibili else {"state": "unconfigured"}
    )

    async def stream():
        async for event in live_hub.subscribe(initial):
            if await request.is_disconnected():
                break
            if event is None:
                yield ": keepalive\n\n"
            else:
                yield "data: " + json.dumps(
                    event, ensure_ascii=False
                ) + "\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/live/status")
async def live_status() -> dict[str, Any]:
    return {
        "configured": settings.bilibili_configured,
        "status": (
            bilibili.status
            if bilibili
            else {"state": "unconfigured"}
        ),
    }


@app.post("/api/commentary/state")
async def commentary_state(
    request: CommentaryStateRequest,
) -> dict[str, Any]:
    node_id = request.state.get("nodeId")
    if not isinstance(node_id, str) or not node_id:
        raise HTTPException(400, "解说状态缺少剧情节点")
    commentary_service.update_state(request.state)
    return {"ok": True}


@app.get("/api/commentary/events")
async def commentary_events(request: Request) -> StreamingResponse:
    async def stream():
        async for event in commentary_hub.subscribe(
            commentary_service.status
        ):
            if await request.is_disconnected():
                break
            if event is None:
                yield ": keepalive\n\n"
            else:
                yield "data: " + json.dumps(
                    event, ensure_ascii=False
                ) + "\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/commentary/audio/{clip_id}")
async def commentary_audio(clip_id: str) -> FileResponse:
    if (
        len(clip_id) != 32
        or any(character not in "0123456789abcdef" for character in clip_id)
    ):
        raise HTTPException(404, "解说音频不存在")
    mp3_path = commentary_audio_dir / f"{clip_id}.mp3"
    wav_path = commentary_audio_dir / f"{clip_id}.wav"
    path = mp3_path if mp3_path.is_file() else wav_path
    if not path.is_file():
        raise HTTPException(404, "解说音频不存在")
    return FileResponse(
        path,
        media_type=(
            "audio/mpeg" if path.suffix == ".mp3" else "audio/wav"
        ),
    )


@app.post("/api/live/start")
async def live_start(request: LiveStartRequest) -> dict[str, Any]:
    if not bilibili:
        raise HTTPException(503, "B站开放平台密钥尚未配置")
    try:
        return await bilibili.start(request.code)
    except Exception as error:
        raise HTTPException(502, str(error)) from error


@app.post("/api/live/stop")
async def live_stop() -> dict[str, Any]:
    if not bilibili:
        raise HTTPException(503, "B站开放平台密钥尚未配置")
    try:
        return await bilibili.stop()
    except Exception as error:
        raise HTTPException(502, str(error)) from error


def _validate_interaction_context(context: dict[str, Any]) -> None:
    if not isinstance(context.get("objectId"), str) or not isinstance(
        context.get("supportedActions"), list
    ):
        raise HTTPException(400, "交互上下文无效")


dist_dir = Path(__file__).resolve().parents[1] / "dist"
if dist_dir.exists():
    app.mount(
        "/",
        StaticFiles(directory=dist_dir, html=True),
        name="frontend",
    )
