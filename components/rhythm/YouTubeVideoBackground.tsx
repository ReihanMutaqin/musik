"use client";

import React, { useEffect, useRef, useState } from "react";

export type VideoPlaybackMode = "full" | "loop" | "off";

type YouTubeVideoBackgroundProps = {
  videoId: string | null;
  offsetMs: number;
  phase: "ready" | "playing" | "paused" | "finished";
  songTime: number; // in seconds
  speed?: number;
  dimPercent?: number; // 0 to 100
  enabled?: boolean;
  mode?: VideoPlaybackMode;
};

export function YouTubeVideoBackground({
  videoId,
  offsetMs,
  phase,
  songTime,
  speed = 1,
  dimPercent = 45,
  enabled = true,
  mode = "full",
}: YouTubeVideoBackgroundProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const lastSyncTimeRef = useRef(0);

  const isVideoActive = Boolean(videoId && enabled && mode !== "off");

  // Helper to send postMessage commands to YouTube IFrame
  const sendCommand = (func: string, args: any[] = []) => {
    if (!iframeRef.current?.contentWindow) return;
    try {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "*"
      );
    } catch {}
  };

  // When iframe loads, initialize volume/speed/time
  const handleIframeLoad = () => {
    setIframeLoaded(true);
    sendCommand("mute");
    sendCommand("setPlaybackRate", [speed]);
    const targetSec = Math.max(0, songTime + offsetMs / 1000);
    sendCommand("seekTo", [targetSec, true]);
    if (phase === "playing") {
      sendCommand("playVideo");
    } else {
      sendCommand("pauseVideo");
    }
  };

  // Play / Pause synchronizer
  useEffect(() => {
    if (!iframeLoaded || !isVideoActive) return;
    if (phase === "playing") {
      sendCommand("playVideo");
    } else {
      sendCommand("pauseVideo");
    }
  }, [phase, iframeLoaded, isVideoActive]);

  // Speed synchronizer
  useEffect(() => {
    if (!iframeLoaded || !isVideoActive) return;
    sendCommand("setPlaybackRate", [speed]);
  }, [speed, iframeLoaded, isVideoActive]);

  // Periodic drift correction (resyncs video to song audio every 2.5 seconds)
  useEffect(() => {
    if (!iframeLoaded || !isVideoActive || phase !== "playing") return;
    const now = Date.now();
    if (now - lastSyncTimeRef.current > 2500) {
      lastSyncTimeRef.current = now;
      const targetSec = Math.max(0, songTime + offsetMs / 1000);
      sendCommand("seekTo", [targetSec, true]);
    }
  }, [songTime, offsetMs, iframeLoaded, phase, isVideoActive]);

  if (!isVideoActive || !videoId) return null;

  const isLoop = mode === "loop";
  const loopParams = isLoop ? `&loop=1&playlist=${videoId}` : "";
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&showinfo=0${loopParams}&enablejsapi=1&origin=${typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : ""}`;

  return (
    <div className="yt-video-bg-container" aria-hidden="true">
      <div className="yt-video-frame-wrap">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title="YouTube Music Video Background"
          tabIndex={-1}
          aria-hidden="true"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          onLoad={handleIframeLoad}
          style={{
            pointerEvents: "none",
            userSelect: "none",
            border: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </div>

      {/* Input Blocker Shield so no clicks or keypresses can ever reach the YouTube Player */}
      <div className="yt-video-click-shield" />

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
