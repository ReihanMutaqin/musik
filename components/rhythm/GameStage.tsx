"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImportedSong, PlayableChart, RhythmNote } from "@/lib/rhythm/types";
import type { MultiplayerRoom } from "@/lib/firebase/multiplayer";

type InputMode = "tap" | "strum";

type GameStageProps = {
  song: ImportedSong;
  chart: PlayableChart;
  speed: number;
  offsetMs: number;
  inputMode: InputMode;
  multiplayerRoom?: MultiplayerRoom;
  onExit: () => void;
};

type Stats = {
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  misses: number;
  energy: number;
  feedback: string;
};

const colors = ["#68f65d", "#ff4c67", "#ffd84d", "#4ba9ff", "#ff7a3d"];
const laneLabels = ["D", "F", "J", "K", "L"];
const keyLanes: Record<string, number> = {
  KeyD: 0,
  KeyF: 1,
  KeyJ: 2,
  KeyK: 3,
  KeyL: 4,
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
};

const initialStats: Stats = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  hits: 0,
  misses: 0,
  energy: 0,
  feedback: "LOCK IN",
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function scoreRank(accuracy: number) {
  if (accuracy >= 97) return "S";
  if (accuracy >= 91) return "A";
  if (accuracy >= 82) return "B";
  if (accuracy >= 70) return "C";
  return "D";
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export function GameStage({ song, chart, speed, offsetMs, inputMode, multiplayerRoom, onExit }: GameStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement[]>([]);
  const statusesRef = useRef(new Uint8Array(chart.notes.length));
  const pressedRef = useRef(new Set<number>());
  const statsRef = useRef<Stats>({ ...initialStats });
  const phaseRef = useRef<"ready" | "playing" | "paused" | "finished">("ready");
  const lastHudUpdateRef = useRef(0);
  const activePulseUntilRef = useRef(0);
  const flashRef = useRef<{ lane: number; until: number; hit: boolean }[]>([]);
  const [phase, setPhase] = useState<"ready" | "playing" | "paused" | "finished">("ready");
  const [stats, setStats] = useState<Stats>({ ...initialStats });
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [section, setSection] = useState("Opening");
  const objectUrls = useMemo(() => song.audio.map((asset) => URL.createObjectURL(asset.blob)), [song]);

  const duration = Math.max(
    song.metadata.durationMs / 1000,
    chart.notes.at(-1)?.time ?? 0,
  );
  const judged = stats.hits + stats.misses;
  const accuracy = judged ? (stats.hits / judged) * 100 : 100;

  useEffect(() => {
    const audio = objectUrls.map((url) => {
      const element = new Audio(url);
      element.preload = "auto";
      element.playbackRate = speed;
      element.volume = Math.min(1, 1 / Math.sqrt(objectUrls.length));
      return element;
    });
    audioRef.current = audio;
    return () => {
      audio.forEach((element) => {
        element.pause();
        element.src = "";
      });
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [objectUrls, speed]);

  const publishStats = useCallback((next: Stats) => {
    statsRef.current = next;
    setStats(next);
  }, []);

  const songTime = useCallback(() => {
    const primary = audioRef.current[0];
    return (primary?.currentTime ?? 0) + offsetMs / 1000;
  }, [offsetMs]);

  const hitNote = useCallback((note: RhythmNote) => {
    if (statusesRef.current[note.id] !== 0) return;
    statusesRef.current[note.id] = 1;
    const current = statsRef.current;
    const nextCombo = current.combo + 1;
    const multiplier = Math.min(4, 1 + Math.floor(nextCombo / 10));
    const pulseActive = songTime() < activePulseUntilRef.current;
    const next: Stats = {
      score: current.score + 100 * Math.max(1, note.lanes.length) * multiplier * (pulseActive ? 2 : 1),
      combo: nextCombo,
      maxCombo: Math.max(current.maxCombo, nextCombo),
      hits: current.hits + 1,
      misses: current.misses,
      energy: Math.min(100, current.energy + (note.overdrive ? 12 : 3)),
      feedback: nextCombo % 25 === 0 ? "UNBROKEN" : note.lanes.length > 1 ? "CHORD!" : "PERFECT",
    };
    flashRef.current.push(...note.lanes.map((lane) => ({ lane, until: performance.now() + 150, hit: true })));
    publishStats(next);
  }, [publishStats, songTime]);

  const findCandidate = useCallback((now: number, lane?: number) => {
    let best: RhythmNote | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (const note of chart.notes) {
      if (statusesRef.current[note.id] !== 0) continue;
      const delta = Math.abs(note.time - now);
      if (note.time > now + 0.16) break;
      if (delta <= 0.145 && delta < distance && (lane === undefined || note.lanes.includes(lane))) {
        best = note;
        distance = delta;
      }
    }
    return best;
  }, [chart.notes]);

  const attemptTap = useCallback((lane: number) => {
    if (phaseRef.current !== "playing") return;
    const candidate = findCandidate(songTime(), lane);
    if (!candidate) {
      flashRef.current.push({ lane, until: performance.now() + 120, hit: false });
      return;
    }
    const lanesReady = candidate.lanes.every((required) => required === -1 || pressedRef.current.has(required));
    if (lanesReady) hitNote(candidate);
  }, [findCandidate, hitNote, songTime]);

  const attemptStrum = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    const candidate = findCandidate(songTime());
    if (!candidate) return;
    const required = candidate.lanes.filter((lane) => lane >= 0);
    const held = [...pressedRef.current].sort((a, b) => a - b);
    const exact = required.length === held.length && required.every((lane, index) => held[index] === lane);
    if (exact) hitNote(candidate);
  }, [findCandidate, hitNote, songTime]);

  const activatePulse = useCallback(() => {
    if (phaseRef.current !== "playing" || statsRef.current.energy < 50) return;
    activePulseUntilRef.current = songTime() + 8;
    publishStats({ ...statsRef.current, energy: statsRef.current.energy - 50, feedback: "PULSE SHIFT" });
  }, [publishStats, songTime]);

  const pause = useCallback(() => {
    if (phaseRef.current === "playing") {
      audioRef.current.forEach((audio) => audio.pause());
      phaseRef.current = "paused";
      setPhase("paused");
    } else if (phaseRef.current === "paused") {
      const primaryTime = audioRef.current[0]?.currentTime ?? 0;
      audioRef.current.forEach((audio) => { audio.currentTime = primaryTime; });
      void Promise.all(audioRef.current.map((audio) => audio.play()));
      phaseRef.current = "playing";
      setPhase("playing");
    }
  }, []);

  const launch = useCallback(() => {
    const audio = audioRef.current;
    if (!audio.length) return;
    statusesRef.current.fill(0);
    publishStats({ ...initialStats });
    setProgress(0);
    setElapsed(0);
    activePulseUntilRef.current = 0;
    audio.forEach((element) => {
      element.currentTime = 0;
      element.playbackRate = speed;
    });
    void Promise.all(audio.map((element) => element.play())).then(() => {
      phaseRef.current = "playing";
      setPhase("playing");
    }).catch(() => {
      publishStats({ ...statsRef.current, feedback: "TAP TO RETRY" });
    });
  }, [publishStats, speed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const lane = keyLanes[event.code];
      if (lane !== undefined) {
        event.preventDefault();
        pressedRef.current.add(lane);
        if (inputMode === "tap") attemptTap(lane);
        return;
      }
      if (["Space", "Enter", "ArrowUp", "ArrowDown"].includes(event.code)) {
        event.preventDefault();
        if (inputMode === "strum") attemptStrum();
        else attemptTap(-1);
      } else if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        activatePulse();
      } else if (event.code === "Escape" || event.code === "KeyP") {
        pause();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const lane = keyLanes[event.code];
      if (lane !== undefined) pressedRef.current.delete(lane);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [activatePulse, attemptStrum, attemptTap, inputMode, pause]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && phaseRef.current === "playing") pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;

    const draw = (timestamp: number) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.floor(rect.width * ratio);
      const pixelHeight = Math.floor(rect.height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = rect.width;
      const height = rect.height;
      const now = songTime();
      const pulseActive = now < activePulseUntilRef.current;

      const background = context.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, pulseActive ? "#20043e" : "#07070b");
      background.addColorStop(0.55, pulseActive ? "#101647" : "#0a0a0f");
      background.addColorStop(1, "#020204");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      const horizonY = Math.max(82, height * 0.13);
      const hitY = height * 0.84;
      const centerX = width / 2;
      const topWidth = Math.min(width * 0.24, 220);
      const bottomWidth = Math.min(width * 0.92, 820);
      const travel = 2.35 / speed;
      const widthAt = (y: number) => topWidth + (bottomWidth - topWidth) * ((y - horizonY) / (hitY - horizonY));
      const yAt = (time: number) => {
        const progressValue = 1 - (time - now) / travel;
        return horizonY + (hitY - horizonY) * Math.pow(Math.max(0, Math.min(1.18, progressValue)), 1.62);
      };
      const laneX = (lane: number, y: number) => centerX + (lane - 2) * (widthAt(y) / 5);

      context.save();
      context.beginPath();
      context.moveTo(centerX - topWidth / 2, horizonY);
      context.lineTo(centerX + topWidth / 2, horizonY);
      context.lineTo(centerX + bottomWidth / 2, hitY + 80);
      context.lineTo(centerX - bottomWidth / 2, hitY + 80);
      context.closePath();
      const board = context.createLinearGradient(0, horizonY, 0, hitY);
      board.addColorStop(0, "rgba(20,20,30,.4)");
      board.addColorStop(1, "rgba(28,28,38,.96)");
      context.fillStyle = board;
      context.fill();
      context.clip();

      for (let beat = Math.floor(now * 2); beat < Math.floor((now + travel) * 2) + 2; beat += 1) {
        const y = yAt(beat / 2);
        if (y < horizonY || y > hitY + 20) continue;
        context.strokeStyle = beat % 2 === 0 ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.05)";
        context.lineWidth = beat % 2 === 0 ? 1.5 : 1;
        context.beginPath();
        context.moveTo(centerX - widthAt(y) / 2, y);
        context.lineTo(centerX + widthAt(y) / 2, y);
        context.stroke();
      }

      for (let lane = 0; lane < 5; lane += 1) {
        const xTop = centerX + (lane - 2.5) * (topWidth / 5);
        const xBottom = centerX + (lane - 2.5) * (bottomWidth / 5);
        context.strokeStyle = "rgba(255,255,255,.11)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(xTop, horizonY);
        context.lineTo(xBottom, hitY + 80);
        context.stroke();
      }

      for (const note of chart.notes) {
        const status = statusesRef.current[note.id];
        if (status === 1) continue;
        if (note.time < now - 0.25) continue;
        if (note.time > now + travel) break;
        const y = yAt(note.time);
        if (y < horizonY - 8 || y > hitY + 55) continue;
        const noteSize = Math.max(6, 9 + ((y - horizonY) / (hitY - horizonY)) * 17);

        if (note.lanes.includes(-1)) {
          const openWidth = widthAt(y) * 0.76;
          context.shadowColor = note.overdrive ? "#ca7cff" : "#e8e6dc";
          context.shadowBlur = 18;
          context.fillStyle = status === 2 ? "#40242b" : note.overdrive ? "#ca7cff" : "#e8e6dc";
          roundedRect(context, centerX - openWidth / 2, y - 5, openWidth, 10, 5);
          context.fill();
          context.shadowBlur = 0;
        }

        note.lanes.filter((lane) => lane >= 0).forEach((lane) => {
          const x = laneX(lane, y);
          if (note.duration > 0.09) {
            const tailY = yAt(note.time + note.duration);
            context.strokeStyle = status === 2 ? "rgba(110,50,60,.5)" : `${colors[lane]}99`;
            context.lineWidth = Math.max(3, noteSize * 0.38);
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(laneX(lane, tailY), tailY);
            context.stroke();
          }
          context.shadowColor = note.overdrive ? "#d383ff" : colors[lane];
          context.shadowBlur = note.overdrive ? 28 : 15;
          context.fillStyle = status === 2 ? "#48242d" : note.overdrive ? "#d383ff" : colors[lane];
          roundedRect(context, x - noteSize, y - noteSize * 0.62, noteSize * 2, noteSize * 1.24, noteSize * 0.4);
          context.fill();
          context.fillStyle = "rgba(255,255,255,.48)";
          roundedRect(context, x - noteSize * 0.66, y - noteSize * 0.38, noteSize * 1.32, noteSize * 0.22, noteSize * 0.12);
          context.fill();
          context.shadowBlur = 0;
        });
      }
      context.restore();

      flashRef.current = flashRef.current.filter((flash) => flash.until > timestamp);
      for (let lane = 0; lane < 5; lane += 1) {
        const x = laneX(lane, hitY);
        const laneWidth = bottomWidth / 5;
        const flash = flashRef.current.find((item) => item.lane === lane);
        const held = pressedRef.current.has(lane);
        context.shadowColor = flash?.hit ? colors[lane] : held ? colors[lane] : "transparent";
        context.shadowBlur = flash?.hit ? 42 : held ? 20 : 0;
        context.fillStyle = flash ? (flash.hit ? colors[lane] : "#ff3859") : held ? `${colors[lane]}cc` : "#24242d";
        roundedRect(context, x - laneWidth * 0.36, hitY - 8, laneWidth * 0.72, 16, 8);
        context.fill();
        context.shadowBlur = 0;
      }

      context.strokeStyle = pulseActive ? "#d783ff" : "rgba(255,255,255,.75)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(centerX - bottomWidth / 2, hitY + 18);
      context.lineTo(centerX + bottomWidth / 2, hitY + 18);
      context.stroke();

      if (phaseRef.current === "playing") {
        for (const note of chart.notes) {
          if (statusesRef.current[note.id] !== 0) continue;
          if (note.time >= now - 0.155) break;
          statusesRef.current[note.id] = 2;
          const current = statsRef.current;
          const next = {
            ...current,
            combo: 0,
            misses: current.misses + 1,
            feedback: "MISS",
          };
          statsRef.current = next;
          flashRef.current.push(...note.lanes.map((lane) => ({ lane, until: timestamp + 180, hit: false })));
        }

        if (timestamp - lastHudUpdateRef.current > 80) {
          lastHudUpdateRef.current = timestamp;
          const primary = audioRef.current[0];
          const rawTime = primary?.currentTime ?? 0;
          setElapsed(rawTime);
          setProgress(duration ? Math.min(100, (rawTime / duration) * 100) : 0);
          const currentSection = [...chart.sections].reverse().find((marker) => marker.time <= now);
          if (currentSection) setSection(currentSection.name);
          setStats({ ...statsRef.current });

          audioRef.current.slice(1).forEach((audio) => {
            if (primary && Math.abs(audio.currentTime - primary.currentTime) > 0.09) audio.currentTime = primary.currentTime;
          });
        }

        const primary = audioRef.current[0];
        if ((primary?.ended || (duration > 0 && now > duration + 0.5)) && phaseRef.current === "playing") {
          audioRef.current.forEach((audio) => audio.pause());
          phaseRef.current = "finished";
          setPhase("finished");
          setStats({ ...statsRef.current });
        }
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [chart.notes, chart.sections, duration, songTime, speed]);

  const touchLane = (lane: number, pressed: boolean) => {
    if (pressed) {
      pressedRef.current.add(lane);
      attemptTap(lane);
    } else {
      pressedRef.current.delete(lane);
    }
  };

  return (
    <main className="game-stage">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Five lane rhythm game highway" />

      <header className="game-topbar">
        <button className="game-quiet-button" type="button" onClick={pause} aria-label="Pause game">
          {phase === "paused" ? "RESUME" : "PAUSE"}
        </button>
        <div className="game-track-copy">
          <span>{song.metadata.artist}</span>
          <strong>{song.metadata.title}</strong>
        </div>
        <div className="game-time"><span>{formatTime(elapsed)}</span><i /><span>{formatTime(duration)}</span></div>
      </header>

      <div className="game-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>

      <section className="game-hud" aria-label="Game score">
        <div className="score-stack">
          <span>SCORE</span>
          <strong>{stats.score.toString().padStart(7, "0")}</strong>
        </div>
        <div className="combo-stack">
          <strong>{stats.combo}</strong>
          <span>STREAK</span>
          <em>{stats.feedback}</em>
        </div>
        <div className="accuracy-stack">
          <span>SYNC</span>
          <strong>{accuracy.toFixed(1)}%</strong>
        </div>
      </section>

      <div className="section-callout"><span>NOW</span>{section}</div>

      <button
        className="pulse-meter"
        type="button"
        onClick={activatePulse}
        disabled={stats.energy < 50 || phase !== "playing"}
        aria-label={`Pulse Shift energy ${Math.round(stats.energy)} percent`}
      >
        <span style={{ height: `${stats.energy}%` }} />
        <b>PULSE</b>
        <small>SHIFT</small>
      </button>

      <div className="touch-frets" aria-label="Touch fret controls">
        {colors.map((color, lane) => (
          <button
            key={color}
            type="button"
            style={{ "--lane-color": color } as React.CSSProperties}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); touchLane(lane, true); }}
            onPointerUp={() => touchLane(lane, false)}
            onPointerCancel={() => touchLane(lane, false)}
          >{laneLabels[lane]}</button>
        ))}
        {inputMode === "strum" && <button type="button" className="touch-strum" onPointerDown={attemptStrum}>STRUM</button>}
      </div>

      {phase === "ready" && (
        <div className="game-overlay">
          <div className="overlay-kicker">STAGE ARMED</div>
          <h1>{chart.label}<br /><span>{chart.difficulty}</span></h1>
          <p>{inputMode === "tap" ? "Tekan D F J K L saat not menyentuh garis." : "Tahan fret D F J K L, lalu strum dengan Space."}</p>
          <button className="launch-button" type="button" onClick={launch}>LAUNCH TRACK <span>↗</span></button>
          <button className="text-button" type="button" onClick={onExit}>Kembali ke soundcheck</button>
        </div>
      )}

      {phase === "paused" && (
        <div className="game-overlay pause-overlay">
          <div className="overlay-kicker">SIGNAL HELD</div>
          <h1>PAUSED<span>.</span></h1>
          <div className="overlay-actions">
            <button className="launch-button" type="button" onClick={pause}>RESUME <span>▶</span></button>
            <button className="text-button" type="button" onClick={launch}>Restart track</button>
            <button className="text-button" type="button" onClick={onExit}>Exit to soundcheck</button>
          </div>
        </div>
      )}

      {phase === "finished" && (
        <div className="game-overlay result-overlay">
          <div className="rank-orbit"><span>RANK</span><strong>{scoreRank(accuracy)}</strong></div>
          <div className="result-copy">
            <div className="overlay-kicker">SET COMPLETE</div>
            <h1>{stats.score.toLocaleString("id-ID")}<span> pts</span></h1>
            <div className="result-grid">
              <div><strong>{accuracy.toFixed(1)}%</strong><span>SYNC</span></div>
              <div><strong>{stats.maxCombo}</strong><span>MAX STREAK</span></div>
              <div><strong>{stats.hits}</strong><span>HITS</span></div>
              <div><strong>{stats.misses}</strong><span>MISSES</span></div>
            </div>
            <div className="overlay-actions result-actions">
              <button className="launch-button" type="button" onClick={launch}>PLAY AGAIN <span>↻</span></button>
              <button className="text-button" type="button" onClick={onExit}>Choose another chart</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
