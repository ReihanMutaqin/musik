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
  const isApiLoadedRef = useRef(false);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.YT && window.YT.Player) {
      isApiLoadedRef.current = true;
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      isApiLoadedRef.current = true;
    };
  }, []);

  // Initialize or re-create YouTube Player when videoId changes
  useEffect(() => {
    if (!videoId || !enabled || typeof window === "undefined") return;

    let isMounted = true;
    const initPlayer = () => {
      if (!window.YT || !window.YT.Player || !containerRef.current) {
        setTimeout(initPlayer, 100);
        return;
      }

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
      }

      const playerElementId = "yt-bg-player-iframe";
      let iframeHolder = document.getElementById(playerElementId);
      if (!iframeHolder && containerRef.current) {
        iframeHolder = document.createElement("div");
        iframeHolder.id = playerElementId;
        containerRef.current.appendChild(iframeHolder);
      }

      playerRef.current = new window.YT.Player(playerElementId, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          loop: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0,
          mute: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            if (!isMounted) return;
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
          },
          onError: (e: any) => {
            console.warn("YouTube Player error:", e);
          },
        },
      });
    };

    initPlayer();

    return () => {
      isMounted = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
    };
  }, [videoId, enabled]);

  // Handle phase changes (play / pause)
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

  // Handle speed changes
  useEffect(() => {
    if (!playerRef.current || !isReady) return;
    try {
      playerRef.current.setPlaybackRate(speed);
    } catch {}
  }, [speed, isReady]);

  // Continuous smart drift compensation (Keeps video perfectly locked to audio)
  useEffect(() => {
    if (!playerRef.current || !isReady || phase !== "playing") return;

    const targetSec = Math.max(0, songTime + offsetMs / 1000);
    try {
      const currentYtSec = playerRef.current.getCurrentTime() || 0;
      const drift = Math.abs(currentYtSec - targetSec);

      // If drift is more than 0.35s, seek smoothly
      if (drift > 0.35) {
        playerRef.current.seekTo(targetSec, true);
      }
    } catch {}
  }, [songTime, offsetMs, isReady, phase]);

  if (!videoId || !enabled) return null;

  return (
    <div className="yt-video-bg-container" aria-hidden="true">
      {/* Video IFrame Wrapper */}
      <div className="yt-video-frame-wrap" ref={containerRef} />

      {/* Cinematic Darkening & Vignette Overlay */}
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
