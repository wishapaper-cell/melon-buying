import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveEventEnvelope } from "../shared/types";

export type CommentaryMood =
  | "ENERGETIC"
  | "SUSPENSE"
  | "PLAYFUL"
  | "CALM"
  | "URGENT"
  | "UNCANNY";

export type CommentaryLine = {
  text: string;
  mood: CommentaryMood;
  reason: string;
  audioUrl?: string | null;
  interrupt?: boolean;
};

export function useCommentary() {
  const [line, setLine] = useState<CommentaryLine | null>(null);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const queueRef = useRef<CommentaryLine[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);
  const mutedRef = useRef(false);
  const pumpRef = useRef<() => void>(() => undefined);

  const pump = useCallback(() => {
    if (playingRef.current) return;
    const next = queueRef.current.shift();
    if (!next?.audioUrl) return;
    playingRef.current = true;
    setLine(next);
    const audio = new Audio(next.audioUrl);
    audio.preload = "auto";
    audio.muted = mutedRef.current;
    audio.hidden = true;
    audio.dataset.audioRole = "commentary";
    document.body.append(audio);
    audioRef.current = audio;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      playingRef.current = false;
      setIsSpeaking(false);
      audioRef.current = null;
      audio.remove();
      pumpRef.current();
    };
    audio.onended = finish;
    audio.onerror = finish;
    void audio
      .play()
      .then(() => setIsSpeaking(true))
      .catch((error: unknown) => {
        if (finished) return;
        finished = true;
        playingRef.current = false;
        setIsSpeaking(false);
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        audio.remove();

        // 浏览器拦截有声自动播放时保留原语音，等待下一次播放机会，
        // 不能像真正的媒体错误一样把尚未播出的解说直接丢弃。
        if (
          error instanceof DOMException &&
          error.name === "NotAllowedError"
        ) {
          queueRef.current.unshift(next);
          queueRef.current = queueRef.current.slice(0, 12);
          return;
        }
        pumpRef.current();
      });
  }, []);
  pumpRef.current = pump;

  useEffect(() => {
    const receiveCommentary = (payload: Partial<CommentaryLine>) => {
      if (!payload.text || !payload.mood) return;
      const next: CommentaryLine = {
        text: payload.text.slice(0, 240),
        mood: payload.mood,
        reason: payload.reason ?? "idle",
        audioUrl: payload.audioUrl,
        interrupt: Boolean(payload.interrupt),
      };
      if (next.interrupt) {
        const currentAudio = audioRef.current;
        if (currentAudio) {
          currentAudio.onended = null;
          currentAudio.onerror = null;
          currentAudio.pause();
          currentAudio.remove();
        }
        audioRef.current = null;
        queueRef.current = [];
        playingRef.current = false;
        setIsSpeaking(false);
      }
      if (next.audioUrl) {
        queueRef.current.push(next);
        queueRef.current = queueRef.current.slice(-12);
        pumpRef.current();
      } else {
        setLine(next);
      }
    };
    const retryBlockedPlayback = () => {
      pumpRef.current();
    };
    window.addEventListener("pointerdown", retryBlockedPlayback, {
      passive: true,
    });
    window.addEventListener("keydown", retryBlockedPlayback);

    const events = new EventSource("/api/commentary/events");
    events.onopen = () => setConnected(true);
    events.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data) as LiveEventEnvelope;
        if (envelope.type === "status") {
          setConnected(true);
          const status = envelope.payload as {
            latestLine?: Partial<CommentaryLine> | null;
          };
          if (status.latestLine) {
            receiveCommentary(status.latestLine);
          }
          return;
        }
        if (envelope.type !== "commentary") return;
        receiveCommentary(
          envelope.payload as Partial<CommentaryLine>,
        );
      } catch {
        // 后端事件格式不可信时忽略，不影响游戏主循环。
      }
    };
    events.onerror = () => setConnected(false);
    return () => {
      events.close();
      window.removeEventListener("pointerdown", retryBlockedPlayback);
      window.removeEventListener("keydown", retryBlockedPlayback);
      audioRef.current?.pause();
      audioRef.current?.remove();
      audioRef.current = null;
      queueRef.current = [];
      playingRef.current = false;
      setIsSpeaking(false);
    };
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  return {
    line,
    connected,
    muted,
    isSpeaking,
    toggleMuted,
  };
}
