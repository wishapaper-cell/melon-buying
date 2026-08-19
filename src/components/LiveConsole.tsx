import { useState } from "react";
import { apiPost } from "../api";

type LiveStatus = {
  state: string;
  gameId?: string;
  roomId?: number;
  anchorName?: string;
  lastError?: string;
};

type Props = {
  configured: boolean;
  status: LiveStatus;
  onStatus: (status: LiveStatus) => void;
  simulatorValue: string;
  onSimulatorValue: (value: string) => void;
  onSimulatorSend: () => void;
};

export function LiveConsole({
  configured,
  status,
  onStatus,
  simulatorValue,
  onSimulatorValue,
  onSimulatorSend,
}: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      onStatus(await apiPost<LiveStatus>("/api/live/start", { code }));
      setCode("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "连接失败");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setError(null);
    try {
      onStatus(await apiPost<LiveStatus>("/api/live/stop"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "关闭失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="live-console">
      <div className="console-title">
        <span className={`live-dot state-${status.state}`} />
        <div>
          <strong>BILIBILI LIVE</strong>
          <small>
            {status.state === "connected"
              ? `${status.anchorName ?? "主播"} · 房间 ${status.roomId ?? "-"}`
              : configured
                ? "等待连接"
                : "未配置开放平台密钥"}
          </small>
        </div>
      </div>

      {status.state !== "connected" ? (
        <div className="connect-row">
          <input
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="主播身份码"
            disabled={!configured || busy}
          />
          <button type="button" onClick={start} disabled={!configured || !code || busy}>
            接入
          </button>
        </div>
      ) : (
        <button type="button" className="stop-live" onClick={stop} disabled={busy}>
          结束本场并调用 END
        </button>
      )}

      {error && <p className="console-error">{error}</p>}

      <div className="simulator">
        <span>本地 A / B / C 投票模拟器</span>
        <div>
          <input
            value={simulatorValue}
            onChange={(event) => onSimulatorValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSimulatorSend();
            }}
            placeholder="输入 A、B 或 C"
          />
          <button type="button" onClick={onSimulatorSend}>发送</button>
        </div>
      </div>
    </section>
  );
}
