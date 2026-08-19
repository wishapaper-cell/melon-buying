import { useCallback, useEffect, useRef, useState } from "react";

const BGM_URL = "/assets/audio/西瓜摊疑云.mp3";
const BGM_MUTED_KEY = "fuctown:bgm-muted";
const NORMAL_VOLUME = 0.18;
const DUCKED_VOLUME = 0.06;

type BackgroundMusicOptions = {
  ducked?: boolean;
};

export function useBackgroundMusic({
  ducked = false,
}: BackgroundMusicOptions = {}) {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(BGM_MUTED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(BGM_URL);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = ducked ? DUCKED_VOLUME : NORMAL_VOLUME;
    audio.muted = true;
    audio.hidden = true;
    audio.dataset.audioRole = "background-music";
    document.body.append(audio);
    audioRef.current = audio;

    const play = () => {
      void audio
        .play()
        .then(() => {
          audio.muted = muted;
        })
        .catch(() => undefined);
    };

    play();
    window.addEventListener("pointerdown", play, { passive: true });
    window.addEventListener("keydown", play);

    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      audio.pause();
      audio.src = "";
      audio.remove();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = ducked ? DUCKED_VOLUME : NORMAL_VOLUME;
  }, [ducked]);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      const audio = audioRef.current;
      if (audio) {
        audio.muted = next;
        if (!next) {
          void audio.play().catch(() => undefined);
        }
      }
      try {
        localStorage.setItem(BGM_MUTED_KEY, next ? "1" : "0");
      } catch {
        // 本地存储不可用时，仍保留当前页面内的静音状态。
      }
      return next;
    });
  }, []);

  return { muted, toggleMuted };
}
