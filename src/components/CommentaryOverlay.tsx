import { useState } from "react";
import type { CommentaryLine } from "../hooks/useCommentary";

const COMMENTARY_CAPTIONS_KEY = "fuctown:hide-commentary-captions";

type CommentaryOverlayProps = {
  line: CommentaryLine | null;
  connected: boolean;
  speaking: boolean;
  muted: boolean;
  musicMuted: boolean;
  onToggleMuted: () => void;
  onToggleMusicMuted: () => void;
};

export function CommentaryOverlay({
  line,
  connected,
  speaking,
  muted,
  musicMuted,
  onToggleMuted,
  onToggleMusicMuted,
}: CommentaryOverlayProps) {
  const [captionsHidden, setCaptionsHidden] = useState(() => {
    try {
      return sessionStorage.getItem(COMMENTARY_CAPTIONS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleCaptions = () => {
    setCaptionsHidden((current) => {
      const next = !current;
      try {
        sessionStorage.setItem(COMMENTARY_CAPTIONS_KEY, next ? "1" : "0");
      } catch {
        // 会话存储不可用时，仍保留当前页面内的显示状态。
      }
      return next;
    });
  };

  return (
    <aside
      className="commentary-overlay"
      data-mood={line?.mood ?? "CALM"}
      data-captions-hidden={captionsHidden}
      data-speaking={speaking}
      aria-live="polite"
    >
      <header>
        <i className={connected ? "is-connected" : ""} />
        <strong>街口解说台</strong>
        <span className="commentary-actions">
          <button
            type="button"
            onClick={toggleCaptions}
            aria-pressed={captionsHidden}
          >
            {captionsHidden ? "显示字幕" : "隐藏字幕"}
          </button>
          <button
            type="button"
            onClick={onToggleMuted}
            aria-label={muted ? "打开解说声音" : "关闭解说声音"}
          >
            {muted ? "解说静音" : "解说有声"}
          </button>
          <button
            type="button"
            onClick={onToggleMusicMuted}
            aria-label={musicMuted ? "打开背景音乐" : "关闭背景音乐"}
          >
            {musicMuted ? "音乐静音" : "音乐有声"}
          </button>
        </span>
      </header>
      {!captionsHidden ? (
        <>
          <p>
            {line?.text ??
              (connected
                ? "解说员正在观察场上局势……"
                : "正在连接街口解说台……")}
          </p>
        </>
      ) : null}
    </aside>
  );
}
