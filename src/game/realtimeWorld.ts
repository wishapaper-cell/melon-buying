import { useEffect, useMemo, useState } from "react";

export type DayPhase = "DAWN" | "DAY" | "DUSK" | "NIGHT";
export type SanStage = "NORMAL" | "HALLUCINATION" | "ANOMALY";

export type RealtimeWorld = {
  now: Date;
  beijingTimeLabel: string;
  phase: DayPhase;
  san: number;
  sanStage: SanStage;
  isNight: boolean;
};

const BEIJING_TIMEZONE = "Asia/Shanghai";

const beijingHour = (date: Date): number =>
  Number(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: BEIJING_TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).format(date),
  ) % 24;

export const getDayPhase = (date: Date): DayPhase => {
  const hour = beijingHour(date);
  if (hour >= 5 && hour < 6) return "DAWN";
  if (hour >= 6 && hour < 18) return "DAY";
  if (hour >= 18 && hour < 19) return "DUSK";
  return "NIGHT";
};

export const getSanStage = (
  san: number,
  phase: DayPhase,
): SanStage => {
  if (phase !== "NIGHT" || san >= 50) return "NORMAL";
  return san < 20 ? "ANOMALY" : "HALLUCINATION";
};

export const useRealtimeWorld = (san: number): RealtimeWorld => {
  const [now, setNow] = useState(() => new Date());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  useEffect(() => {
    let disposed = false;
    const synchronize = async () => {
      try {
        const startedAt = Date.now();
        const response = await fetch("/api/world/time");
        if (!response.ok) return;
        const payload = (await response.json()) as { serverTime?: string };
        if (!payload.serverTime || disposed) return;
        const roundTrip = Date.now() - startedAt;
        const estimatedServerNow =
          new Date(payload.serverTime).getTime() + roundTrip / 2;
        setServerOffsetMs(estimatedServerNow - Date.now());
      } catch {
        // 后端暂不可用时继续使用本机时钟，下一轮自动重试。
      }
    };
    void synchronize();
    const syncTimer = window.setInterval(synchronize, 30_000);
    return () => {
      disposed = true;
      window.clearInterval(syncTimer);
    };
  }, []);

  useEffect(() => {
    const update = () => setNow(new Date(Date.now() + serverOffsetMs));
    update();
    const timer = window.setInterval(update, 1000);
    const resume = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [serverOffsetMs]);

  return useMemo(() => {
    const phase = getDayPhase(now);
    return {
      now,
      phase,
      san,
      sanStage: getSanStage(san, phase),
      isNight: phase === "NIGHT",
      beijingTimeLabel: new Intl.DateTimeFormat("zh-CN", {
        timeZone: BEIJING_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now),
    };
  }, [now, san]);
};

export const anomalyVisibleFor = (
  entityId: string,
  stage: SanStage,
  timestamp: number,
): boolean => {
  if (stage === "NORMAL") return false;
  if (stage === "ANOMALY") return true;
  let hash = 0;
  for (let index = 0; index < entityId.length; index += 1) {
    hash = (hash * 31 + entityId.charCodeAt(index)) >>> 0;
  }
  const period = 12_000;
  const visibleFor = 5_000;
  return (timestamp + (hash % period)) % period < visibleFor;
};
