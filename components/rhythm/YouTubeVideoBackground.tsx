"use client";

import React, { useEffect, useRef, useState } from "react";

type YouTubeVideoBackgroundProps = {
  videoId: string | null;
  offsetMs: number;
  phase: "ready" | "playing" | "paused" | "finished";
  songTime: number; // in seconds
  speed?: number;
  dimPercent?: number; // 0 to 100
  enabled?: boolean;
};

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export function YouTubeVideoBackground({
  videoId,
  offsetMs,
  phase,
  songTime,
  speed = 1,
  dimPercent = 45,
  enabled = true,
}: YouTubeVideoBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.YT && window.YT.Player) {
      return;
    }

    if (!document.getElementById("yt-iframe-api-script")) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Initialize YouTube Player
  useEffect(() => {
    if (!videoId || !enabled || typeof window === "undefined") return;

    let isMounted = true;
    let retryTimer: NodeJS.Timeout;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player || !containerRef.current) {
        retryTimer = setTimeout(initPlayer, 150);
        return;
      }

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }

      const holder = document.createElement("div");
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(holder);

      try {
        playerRef.current = new window.YT.Player(holder, {
          videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            loop: 1,
            playlist: videoId,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            showinfo: 0,
            mute: 1,
            enablejsapi: 1,
          },
          events: {
            onReady: (event: any) => {
              if (!isMounted) return;
              try {
                event.target.mute();
                event.target.setPlaybackRate(speed);
                setIsReady(true);
                const targetSec = Math.max(0, songTime + offsetMs / 1000);
                event.target.seekTo(targetSec, true);
                if (phase === "playing") {
                  event.target.playVideo();
                } else {
                  event.target.pauseVideo();
                }
              } catch {}
            },
            onStateChange: (event: any) => {
              if (event.data === window.YT?.PlayerState?.ENDED) {
                try {
                  event.target.seekTo(0, true);
                  event.target.playVideo();
                } catch {}
              }
            },
            onError: (e: any) => {
              console.warn("YouTube Player error:", e);
            },
          },
        });
      } catch (err) {
        console.warn("Failed to instantiate YT.Player:", err);
      }
    };

    initPlayer();

    return () => {
      isMounted = false;
      clearTimeout(retryTimer);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
    };
  }, [videoId, enabled]);

  // Sync play / pause
  useEffect(() => {
    if (!playerRef.current || !isReady) return;
    try {
      if (phase === "playing") {
        playerRef.current.playVideo();
      } else if (phase === "paused" || phase === "ready" || phase === "finished") {
        playerRef.current.pauseVideo();
      }
    } catch {}
  }, [phase, isReady]);

  // Sync speed
  useEffect(() => {
    if (!playerRef.current || !isReady) return;
    try {
      playerRef.current.setPlaybackRate(speed);
    } catch {}
  }, [speed, isReady]);

  // Sync seek drift
  useEffect(() => {
    if (!playerRef.current || !isReady || phase !== "playing") return;
    const targetSec = Math.max(0, songTime + offsetMs / 1000);
    try {
      const currentYtSec = playerRef.current.getCurrentTime() || 0;
      const drift = Math.abs(currentYtSec - targetSec);
      if (drift > 0.4) {
        playerRef.current.seekTo(targetSec, true);
      }
    } catch {}
  }, [songTime, offsetMs, isReady, phase]);

  if (!videoId || !enabled) return null;

  return (
    <div className="yt-video-bg-container" aria-hidden="true">
      <div className="yt-video-frame-wrap" ref={containerRef} />
      <div
        className="yt-video-dim-overlay"
        style={{
          backgroundColor: `rgba(6, 6, 12, ${dimPercent / 100})`,
        }}
      />
      <div className="yt-video-vignette" />
    </div>
  );
}
