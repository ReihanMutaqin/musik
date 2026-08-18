"use client";

import { useMemo, useState } from "react";

export type RobotState = "idle" | "listening" | "thinking" | "speaking" | "happy" | "curious" | "music" | "sleeping" | "error";

const stateLabels: Record<RobotState, string> = {
  idle: "REIA siap diajak main",
  listening: "REIA sedang mendengarkan",
  thinking: "REIA sedang berpikir",
  speaking: "REIA sedang berbicara",
  happy: "REIA senang",
  curious: "REIA penasaran",
  music: "REIA mengikuti musikmu",
  sleeping: "REIA sedang beristirahat",
  error: "REIA sedang mencoba terhubung lagi",
};

export function Robot({ state = "idle", size = "large", interactive = true, className = "" }: { state?: RobotState; size?: "small" | "medium" | "large"; interactive?: boolean; className?: string }) {
  const [tapCount, setTapCount] = useState(0);
  const dizzy = tapCount >= 5;
  const effectiveState = dizzy ? "curious" : state;
  const label = useMemo(() => (dizzy ? "Waduh, kepalaku muter hehe" : stateLabels[state]), [dizzy, state]);

  const tap = () => {
    if (!interactive) return;
    setTapCount((count) => {
      const next = count + 1;
      if (next >= 5) window.setTimeout(() => setTapCount(0), 1800);
      return next;
    });
  };

  return (
    <div className={`robot robot--${size} robot--${effectiveState} ${dizzy ? "robot--dizzy" : ""} ${className}`} aria-label={label} role="img">
      <div className="robot__orbit robot__orbit--one" />
      <div className="robot__orbit robot__orbit--two" />
      <div className="robot__shadow" />
      <div className="robot__body">
        <button className="robot__head" type="button" onClick={tap} tabIndex={interactive ? 0 : -1} aria-label={interactive ? "Ketuk kepala REIA" : label}>
          <span className="robot__antenna"><span /></span>
          <span className="robot__ear robot__ear--left" />
          <span className="robot__ear robot__ear--right" />
          <span className="robot__face">
            <span className="robot__eyes"><i /><i /></span>
            <span className="robot__mouth"><b /><b /><b /><b /><b /></span>
            <span className="robot__cheek robot__cheek--left" />
            <span className="robot__cheek robot__cheek--right" />
          </span>
        </button>
        <span className="robot__neck" />
        <span className="robot__torso">
          <span className="robot__core"><i /></span>
          <span className="robot__arm robot__arm--left"><i /></span>
          <span className="robot__arm robot__arm--right"><i /></span>
        </span>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
