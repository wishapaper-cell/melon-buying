from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from contextlib import suppress
from pathlib import Path
from typing import Sequence


PROJECT_ROOT = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv

    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

DEFAULT_HOST = os.getenv("HOST", "127.0.0.1")
DEFAULT_BACKEND_PORT = int(os.getenv("PORT", "8767"))
FRONTEND_PORT = 5174


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="同时启动《华强买瓜：无限世界线》的前后端服务",
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_BACKEND_PORT,
        help="FastAPI 端口，默认读取 .env 的 PORT 或使用 8767",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="开启 FastAPI 开发热重载；默认关闭以避免 Windows 遗留进程",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="服务就绪后自动打开浏览器",
    )
    return parser.parse_args()


def port_is_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.3):
            return True
    except OSError:
        return False


def require_free_port(host: str, port: int, label: str) -> None:
    if port_is_open(host, port):
        raise RuntimeError(
            f"{label}端口 {port} 已被占用。请先关闭旧服务后再运行。"
        )


def process_options() -> dict[str, object]:
    if os.name == "nt":
        return {
            "creationflags": subprocess.CREATE_NEW_PROCESS_GROUP,
        }
    return {"start_new_session": True}


def start_process(
    command: Sequence[str],
    *,
    environment: dict[str, str],
) -> subprocess.Popen[bytes]:
    return subprocess.Popen(
        list(command),
        cwd=PROJECT_ROOT,
        env=environment,
        **process_options(),
    )


def wait_for_backend(
    process: subprocess.Popen[bytes],
    host: str,
    port: int,
    timeout_seconds: float = 30,
) -> None:
    url = f"http://{host}:{port}/api/health"
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({})
    )
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        exit_code = process.poll()
        if exit_code is not None:
            raise RuntimeError(
                f"FastAPI 启动失败，退出码：{exit_code}"
            )
        try:
            with opener.open(url, timeout=0.8) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(0.25)
    raise RuntimeError("等待 FastAPI 就绪超时，请查看上方后端日志。")


def wait_for_frontend(
    process: subprocess.Popen[bytes],
    host: str,
    timeout_seconds: float = 20,
) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        exit_code = process.poll()
        if exit_code is not None:
            raise RuntimeError(
                f"Vite 启动失败，退出码：{exit_code}"
            )
        if port_is_open(host, FRONTEND_PORT):
            return
        time.sleep(0.25)
    raise RuntimeError("等待 Vite 就绪超时，请查看上方前端日志。")


def stop_process(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            [
                "taskkill",
                "/PID",
                str(process.pid),
                "/T",
                "/F",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        with suppress(subprocess.TimeoutExpired):
            process.wait(timeout=5)
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
        return
    except (OSError, subprocess.TimeoutExpired):
        pass

    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def run() -> int:
    args = parse_args()
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        print("未找到 npm，请先安装 Node.js 22+。", file=sys.stderr)
        return 1
    if not (PROJECT_ROOT / "node_modules").is_dir():
        print(
            "尚未安装前端依赖，请先运行：npm install",
            file=sys.stderr,
        )
        return 1

    try:
        require_free_port(args.host, args.port, "FastAPI")
        require_free_port(args.host, FRONTEND_PORT, "Vite")
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    environment["PYTHONUNBUFFERED"] = "1"
    backend: subprocess.Popen[bytes] | None = None
    frontend: subprocess.Popen[bytes] | None = None
    backend_command = [
        sys.executable,
        "-X",
        "utf8",
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host",
        args.host,
        "--port",
        str(args.port),
    ]
    if args.reload:
        backend_command.append("--reload")

    try:
        print(f"[启动器] 正在启动 FastAPI：{args.host}:{args.port}")
        backend = start_process(
            backend_command,
            environment=environment,
        )
        wait_for_backend(backend, args.host, args.port)
        print("[启动器] FastAPI 已就绪，正在启动 Vite……")
        frontend = start_process(
            [npm, "run", "dev:game"],
            environment=environment,
        )
        wait_for_frontend(frontend, args.host)
        game_url = f"http://{args.host}:{FRONTEND_PORT}/"
        print(f"[启动器] 游戏已启动：{game_url}")
        print("[启动器] 按 Ctrl+C 同时关闭前后端。")
        if args.open:
            webbrowser.open(game_url)

        while True:
            backend_code = backend.poll()
            frontend_code = frontend.poll()
            if backend_code is not None:
                print(
                    f"[启动器] FastAPI 已退出，退出码：{backend_code}",
                    file=sys.stderr,
                )
                return backend_code or 1
            if frontend_code is not None:
                print(
                    f"[启动器] Vite 已退出，退出码：{frontend_code}",
                    file=sys.stderr,
                )
                return frontend_code or 1
            time.sleep(0.4)
    except KeyboardInterrupt:
        print("\n[启动器] 正在关闭项目……")
        return 0
    except RuntimeError as error:
        print(f"[启动器] {error}", file=sys.stderr)
        return 1
    finally:
        stop_process(frontend)
        stop_process(backend)


if __name__ == "__main__":
    raise SystemExit(run())
