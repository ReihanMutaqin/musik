"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppSettings } from "@/components/AppProviders";
import { Robot, type RobotState } from "@/components/robot/Robot";
import { CameraIcon, ChevronDownIcon, HandIcon, PauseIcon, PlayIcon, RecordIcon, RefreshIcon, StopIcon, TrashIcon } from "@/components/ui/Icons";
import { ReiaAudioEngine } from "@/lib/audio/engine";
import { midiToFrequency, MUSIC_MODES, noteLabelFromMidi, PRESETS, scaleMidiAt, SCALES, type MusicModeId, type PresetId, type ScaleId } from "@/lib/audio/music";

type Landmark = { x: number; y: number; z: number };
type HandResult = { landmarks: Landmark[][]; handedness: Array<Array<{ categoryName: string; score: number }>> };
type HandLandmarkerLike = { detectForVideo: (video: HTMLVideoElement, timestamp: number) => HandResult; close: () => void };
type RecordedEvent = { id: string; time: number; midi?: number; drum?: "kick" | "snare" | "hat" | "clap"; label: string; velocity: number };

const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const KEY_NOTES: Record<string, number> = { a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71 };
const PAD_NOTES = [60, 62, 64, 65, 67, 69, 71];
const CHALLENGE = ["DO", "MI", "SOL"];

function countFingers(points: Landmark[], handedness: string) {
  if (points.length < 21) return 0;
  let count = 0;
  const fingers = [[8,6],[12,10],[16,14],[20,18]];
  for (const [tip, pip] of fingers) if (points[tip].y < points[pip].y - .025) count += 1;
  const thumbDirection = handedness.toLowerCase() === "right" ? points[4].x < points[3].x - .025 : points[4].x > points[3].x + .025;
  if (thumbDirection) count += 1;
  return count;
}

function palmCenter(points: Landmark[]) {
  const indices = [0, 5, 9, 13, 17];
  return indices.reduce((sum, index) => ({ x: sum.x + points[index].x / indices.length, y: sum.y + points[index].y / indices.length }), { x: 0, y: 0 });
}

function gestureLabel(count: number) {
  return ["FIST", "ONE", "TWO", "THREE", "FOUR", "OPEN PALM"][Math.max(0, Math.min(5, count))];
}

export function GestureExperience() {
  const { settings, updateSettings } = useAppSettings();
  const [cameraState, setCameraState] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState("");
  const [mode, setMode] = useState<MusicModeId>((settings.musicMode as MusicModeId) || "harmony");
  const [scale, setScale] = useState<ScaleId>((settings.scale as ScaleId) || "major-pentatonic");
  const [preset, setPreset] = useState<PresetId>("soft-bell");
  const [quantized, setQuantized] = useState(true);
  const [handFound, setHandFound] = useState(false);
  const [gesture, setGesture] = useState("—");
  const [note, setNote] = useState("—");
  const [frequency, setFrequency] = useState(0);
  const [pitchPosition, setPitchPosition] = useState(.5);
  const [robotState, setRobotState] = useState<RobotState>("curious");
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<RecordedEvent[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [challengeActive, setChallengeActive] = useState(false);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeSuccess, setChallengeSuccess] = useState(false);
  const [bpm, setBpm] = useState(96);
  const [fps, setFps] = useState(0);
  const [musicHydrated, setMusicHydrated] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const frameRef = useRef<number | null>(null);
  const engineRef = useRef<ReiaAudioEngine | null>(null);
  const modeRef = useRef(mode);
  const scaleRef = useRef(scale);
  const presetRef = useRef(preset);
  const quantizedRef = useRef(quantized);
  const recordingRef = useRef(recording);
  const recordStartRef = useRef(0);
  const smoothedRef = useRef({ x: .5, y: .5 });
  const previousRef = useRef({ x: .5, y: .5, time: 0 });
  const recentCountsRef = useRef<number[]>([]);
  const lastStableRef = useRef(-1);
  const lastTriggerRef = useRef({ key: "", time: 0 });
  const lastHandTimeRef = useRef(0);
  const lastDetectionTimeRef = useRef(0);
  const fpsRef = useRef({ frames: 0, since: 0 });
  const playbackTimersRef = useRef<number[]>([]);

  useEffect(() => { modeRef.current = mode; updateSettings({ musicMode: mode }); }, [mode, updateSettings]);
  useEffect(() => { scaleRef.current = scale; updateSettings({ scale }); }, [scale, updateSettings]);
  useEffect(() => { presetRef.current = preset; }, [preset]);
  useEffect(() => { quantizedRef.current = quantized; }, [quantized]);
  useEffect(() => { recordingRef.current = recording; if (recording) recordStartRef.current = performance.now(); }, [recording]);
  useEffect(() => { engineRef.current?.setMasterVolume(settings.masterVolume); }, [settings.masterVolume]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("reihan.music");
        if (saved) {
          const parsed = JSON.parse(saved) as { version?: number; recorded?: RecordedEvent[] };
          if (parsed.version === 1 && Array.isArray(parsed.recorded)) setRecorded(parsed.recorded.slice(-256));
        }
      } catch {
        localStorage.removeItem("reihan.music");
      } finally {
        setMusicHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (musicHydrated) localStorage.setItem("reihan.music", JSON.stringify({ version: 1, recorded: recorded.slice(-256) }));
  }, [musicHydrated, recorded]);

  const recordEvent = useCallback((event: Omit<RecordedEvent, "id" | "time">) => {
    if (!recordingRef.current) return;
    setRecorded((current) => [...current.slice(-255), { ...event, id: `${Date.now()}-${Math.random()}`, time: performance.now() - recordStartRef.current }]);
  }, []);

  const registerChallenge = useCallback((label: string) => {
    if (!challengeActive || challengeSuccess) return;
    const clean = label.replace(/\d/g, "").replace("♯", "");
    if (clean === CHALLENGE[challengeIndex]) {
      const next = challengeIndex + 1;
      setChallengeIndex(next);
      if (next >= CHALLENGE.length) {
        setChallengeSuccess(true);
        setRobotState("happy");
        window.setTimeout(() => setRobotState("music"), 1800);
      }
    } else if (clean === CHALLENGE[0]) {
      setChallengeIndex(1);
    } else {
      setChallengeIndex(0);
    }
  }, [challengeActive, challengeIndex, challengeSuccess]);

  const playMidi = useCallback(async (midi: number, velocity = .24, duration = .5) => {
    const engine = engineRef.current || new ReiaAudioEngine();
    engineRef.current = engine;
    await engine.initialize(settings.masterVolume);
    const label = noteLabelFromMidi(midi);
    engine.playNote(midiToFrequency(midi), { preset: presetRef.current, velocity, duration });
    setNote(label);
    setFrequency(Math.round(midiToFrequency(midi)));
    setRobotState("music");
    recordEvent({ midi, label, velocity });
    registerChallenge(label);
  }, [recordEvent, registerChallenge, settings.masterVolume]);

  const playDrum = useCallback(async (drum: "kick" | "snare" | "hat" | "clap", velocity = .34) => {
    const engine = engineRef.current || new ReiaAudioEngine();
    engineRef.current = engine;
    await engine.initialize(settings.masterVolume);
    engine.playDrum(drum, velocity);
    setNote(drum.toUpperCase());
    setRobotState("music");
    recordEvent({ drum, label: drum.toUpperCase(), velocity });
  }, [recordEvent, settings.masterVolume]);

  const drawHands = useCallback((hands: Landmark[][]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (!settings.showSkeleton) return;
    const mapX = (x: number) => (settings.cameraMirror ? 1 - x : x) * width;
    for (const points of hands) {
      context.lineWidth = Math.max(2, width / 520);
      context.strokeStyle = "rgba(184, 223, 207, .82)";
      for (const [a, b] of CONNECTIONS) {
        context.beginPath();
        context.moveTo(mapX(points[a].x), points[a].y * height);
        context.lineTo(mapX(points[b].x), points[b].y * height);
        context.stroke();
      }
      points.forEach((point, index) => {
        context.beginPath();
        context.arc(mapX(point.x), point.y * height, index === 0 || [4,8,12,16,20].includes(index) ? 6 : 3.4, 0, Math.PI * 2);
        context.fillStyle = [4,8,12,16,20].includes(index) ? "#f26b4f" : "rgba(255,253,249,.95)";
        context.fill();
      });
    }
  }, [settings.cameraMirror, settings.showSkeleton]);

  const triggerMode = useCallback((data: { count: number; x: number; y: number; velocity: number; hands: Landmark[][] }) => {
    const engine = engineRef.current;
    if (!engine) return;
    const position = 1 - data.y;
    const midi = quantizedRef.current ? scaleMidiAt(position, scaleRef.current, 43, 4) : Math.round(41 + position * 48);
    const freq = quantizedRef.current ? midiToFrequency(midi) : 48 * 2 ** (position * 5);
    const label = quantizedRef.current ? noteLabelFromMidi(midi) : `${Math.round(freq)} Hz`;
    const now = performance.now();
    const stableKey = `${modeRef.current}-${data.count}-${modeRef.current === "air-piano" ? Math.floor(data.x * 7) : ""}`;
    const mayTrigger = stableKey !== lastTriggerRef.current.key || now - lastTriggerRef.current.time > 520;
    const velocity = Math.min(.4, .14 + data.velocity * 6);
    setPitchPosition(position);
    setFrequency(Math.round(freq));
    setNote(label);
    engine.setGlobalFilter(data.x);

    if (modeRef.current === "theremin" || modeRef.current === "ambient") {
      if (!engine.hasContinuousVoice()) engine.startContinuous(freq, modeRef.current === "ambient" ? "warm-pad" : presetRef.current);
      engine.updateContinuous(freq, modeRef.current === "ambient" ? .09 + Math.min(.08, data.velocity * 2) : .13, data.x);
      return;
    }
    if (modeRef.current === "dual-hand" && data.hands.length >= 2) {
      const second = palmCenter(data.hands[1]);
      const distance = Math.hypot(data.x - second.x, data.y - second.y);
      engine.setReverb(Math.min(.5, distance * .7));
      if (!engine.hasContinuousVoice()) engine.startContinuous(freq, presetRef.current);
      engine.updateContinuous(freq, Math.max(.025, (1 - second.y) * .2), second.x);
      return;
    }
    engine.stopContinuous();
    if (modeRef.current === "conductor") {
      if (data.velocity > .025 && now - lastTriggerRef.current.time > 230) {
        const interval = now - lastTriggerRef.current.time;
        if (interval > 240 && interval < 1400) setBpm(Math.round(60_000 / interval));
        void playDrum(data.x < .5 ? "kick" : "snare", velocity);
        lastTriggerRef.current = { key: stableKey, time: now };
      }
      return;
    }
    if (!mayTrigger) return;
    lastTriggerRef.current = { key: stableKey, time: now };
    if (modeRef.current === "drums") {
      const drum = (["kick", "kick", "snare", "hat", "clap", "hat"] as const)[data.count];
      void playDrum(drum, velocity);
    } else if (modeRef.current === "chords") {
      const chordIntervals = [[0,7,12],[0,4,7],[0,3,7],[0,4,7,11],[0,3,7,10],[0,5,7]][data.count];
      const root = midi - (midi % 12) + ([0,2,4,5,7,9][data.count] || 0);
      engine.playChord(chordIntervals.map((interval) => midiToFrequency(root + interval)), presetRef.current, velocity * .62);
      const chordLabel = ["POWER", "MAJOR", "MINOR", "MAJOR 7", "MINOR 7", "SUS 4"][data.count];
      setNote(chordLabel);
      recordEvent({ midi: root, label: chordLabel, velocity });
    } else if (modeRef.current === "air-piano") {
      const zone = Math.max(0, Math.min(6, Math.floor(data.x * 7)));
      void playMidi([60,62,64,65,67,69,71][zone], velocity, .38);
    } else {
      const octave = 3 + Math.floor(position * 3);
      const intervals = SCALES[scaleRef.current].intervals;
      const degree = Math.max(0, data.count - 1) % intervals.length;
      const harmonyMidi = 48 + octave * 12 - 48 + intervals[degree];
      void playMidi(harmonyMidi, velocity, .48);
    }
  }, [playDrum, playMidi, recordEvent]);

  const processResult = useCallback((result: HandResult, timestamp: number) => {
    drawHands(result.landmarks);
    if (!result.landmarks.length) {
      if (timestamp - lastHandTimeRef.current > 340) {
        setHandFound(false); setGesture("—"); setRobotState("curious");
        engineRef.current?.stopContinuous();
      }
      return;
    }
    lastHandTimeRef.current = timestamp;
    setHandFound(true);
    setRobotState("music");
    const points = result.landmarks[0];
    const center = palmCenter(points);
    const smoothed = smoothedRef.current;
    smoothed.x += .2 * (center.x - smoothed.x);
    smoothed.y += .2 * (center.y - smoothed.y);
    const previous = previousRef.current;
    const deltaSeconds = Math.max(.016, (timestamp - previous.time) / 1000);
    const velocity = Math.hypot(smoothed.x - previous.x, smoothed.y - previous.y) / deltaSeconds;
    previousRef.current = { x: smoothed.x, y: smoothed.y, time: timestamp };
    const handedness = result.handedness[0]?.[0]?.categoryName || "Right";
    const count = countFingers(points, handedness);
    recentCountsRef.current.push(count);
    if (recentCountsRef.current.length > 6) recentCountsRef.current.shift();
    const votes = recentCountsRef.current.reduce<Record<number, number>>((map, value) => ({ ...map, [value]: (map[value] || 0) + 1 }), {});
    const stable = Number(Object.entries(votes).sort((a,b) => b[1] - a[1])[0]?.[0] ?? count);
    if ((votes[stable] || 0) >= 4) lastStableRef.current = stable;
    const stableCount = lastStableRef.current < 0 ? count : lastStableRef.current;
    setGesture(gestureLabel(stableCount));
    triggerMode({ count: stableCount, x: smoothed.x, y: smoothed.y, velocity, hands: result.landmarks });
  }, [drawHands, triggerMode]);

  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    engineRef.current?.stopContinuous();
    setCameraState("idle");
    setHandFound(false);
    setRobotState("curious");
    const context = canvasRef.current?.getContext("2d");
    if (context && canvasRef.current) context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraState("loading");
    setCameraError("");
    setRobotState("thinking");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Browser ini belum mendukung akses kamera.");
      const engine = engineRef.current || new ReiaAudioEngine();
      engineRef.current = engine;
      await engine.initialize(settings.masterVolume);
      const startedAt = performance.now();
      previousRef.current = { x: .5, y: .5, time: startedAt };
      fpsRef.current = { frames: 0, since: startedAt };
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Tampilan kamera belum siap.");
      video.srcObject = stream;
      await video.play();
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe");
      let landmarker;
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "GPU" }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: .58, minHandPresenceConfidence: .55, minTrackingConfidence: .55 });
      } catch {
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "CPU" }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: .58, minHandPresenceConfidence: .55, minTrackingConfidence: .55 });
      }
      landmarkerRef.current = landmarker;
      setCameraState("active");
      setRobotState("curious");
      const loopFrame = (timestamp: number) => {
        const currentVideo = videoRef.current;
        const currentLandmarker = landmarkerRef.current;
        if (!currentVideo || !currentLandmarker) return;
        if (timestamp - lastDetectionTimeRef.current >= 40 && currentVideo.readyState >= 2) {
          lastDetectionTimeRef.current = timestamp;
          processResult(currentLandmarker.detectForVideo(currentVideo, timestamp), timestamp);
          fpsRef.current.frames += 1;
          if (timestamp - fpsRef.current.since > 1000) {
            setFps(Math.round(fpsRef.current.frames * 1000 / (timestamp - fpsRef.current.since)));
            fpsRef.current = { frames: 0, since: timestamp };
          }
        }
        frameRef.current = requestAnimationFrame(loopFrame);
      };
      frameRef.current = requestAnimationFrame(loopFrame);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setCameraState("error");
      setRobotState("error");
      const message = error instanceof Error ? error.message : "Kameranya belum bisa diakses.";
      setCameraError(/permission|denied|notallowed/i.test(message) ? "Kamera belum diizinkan. Izinkan kamera dari pengaturan browser, lalu coba lagi." : message);
    }
  }, [processResult, settings.masterVolume]);

  const stopPlayback = useCallback(() => {
    playbackTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    playbackTimersRef.current = [];
    setPlaying(false);
  }, []);

  const playRecording = useCallback(() => {
    if (!recorded.length) return;
    stopPlayback();
    setPlaying(true);
    const schedule = () => {
      recorded.forEach((event) => {
        const timer = window.setTimeout(() => {
          if (event.drum) void playDrum(event.drum, event.velocity);
          else if (typeof event.midi === "number") void playMidi(event.midi, event.velocity);
        }, event.time);
        playbackTimersRef.current.push(timer);
      });
      const end = Math.max(...recorded.map((event) => event.time)) + 700;
      playbackTimersRef.current.push(window.setTimeout(() => {
        if (loop) schedule(); else setPlaying(false);
      }, end));
    };
    schedule();
  }, [loop, playDrum, playMidi, recorded, stopPlayback]);

  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const midi = KEY_NOTES[event.key.toLowerCase()];
      if (midi) { event.preventDefault(); void playMidi(midi); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [playMidi]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    landmarkerRef.current?.close();
    stopPlayback();
    engineRef.current?.dispose();
  }, [stopPlayback]);

  const activeMode = useMemo(() => MUSIC_MODES.find((item) => item.id === mode) || MUSIC_MODES[0], [mode]);
  const currentScale = SCALES[scale];

  return (
    <main className="gesture-page section-shell">
      <header className="gesture-heading">
        <div><p className="kicker">GESTURE MUSIC</p><h1>Tanganmu jadi<br /><span>alat musik.</span></h1></div>
        <div className="gesture-heading__robot"><Robot state={robotState} size="medium" /></div>
        <p>Angkat tangan ke kamera, pilih nada lewat gesture, lalu gerakkan ke atas atau bawah untuk mengubah pitch secara langsung.</p>
      </header>

      <nav className="mode-tabs" aria-label="Mode musik">
        {MUSIC_MODES.map((item, index) => <button key={item.id} type="button" className={mode === item.id ? "is-active" : ""} onClick={() => setMode(item.id)}><small>0{index + 1}</small>{item.label}</button>)}
      </nav>

      <section className="gesture-workspace">
        <div className="camera-stage">
          <video ref={videoRef} playsInline muted className={settings.cameraMirror ? "is-mirrored" : ""} aria-label="Kamera gesture tangan" />
          <canvas ref={canvasRef} aria-hidden="true" />
          {cameraState !== "active" && (
            <div className="camera-gate">
              {cameraState === "loading" ? (
                <><span className="camera-loader"><HandIcon /></span><h2>Menyiapkan pengenalan tangan...</h2><p>REIA sedang memuat model vision langsung di perangkatmu.</p></>
              ) : cameraState === "error" ? (
                <><span className="camera-loader camera-loader--error"><CameraIcon /></span><h2>Kameranya belum bisa diakses.</h2><p>{cameraError}</p><button className="button button--primary" type="button" onClick={() => void startCamera()}><RefreshIcon /> Coba lagi</button></>
              ) : (
                <><span className="camera-loader"><HandIcon /></span><p className="kicker">KAMERA BELUM AKTIF</p><h2>Mainkan musik dengan tanganmu.</h2><p>Kamera hanya aktif setelah kamu menekan tombol. Video tidak dikirim ke server.</p><button className="button button--primary" type="button" onClick={() => void startCamera()}><CameraIcon /> Aktifkan Kamera</button><small>Pemrosesan tangan berjalan lokal di perangkat.</small></>
              )}
            </div>
          )}

          {cameraState === "active" && (
            <>
              <div className="camera-topbar"><span className={handFound ? "is-found" : ""}><i />{handFound ? "Tangan terdeteksi" : "Angkat tanganmu"}</span><button type="button" onClick={stopCamera}><StopIcon /> Matikan kamera</button></div>
              <div className="pitch-meter"><b>HIGH</b><i><em style={{ top: `${(1 - pitchPosition) * 100}%` }} /></i><b>LOW</b></div>
              <div className="camera-readout">
                <div><small>GESTURE</small><strong>{gesture}</strong></div>
                <div><small>NADA</small><strong>{note}</strong></div>
                <div><small>PITCH</small><strong>{frequency ? `${frequency} Hz` : "—"}</strong></div>
              </div>
              <div className="music-ripples" style={{ "--pitch": pitchPosition } as React.CSSProperties}><i /><i /><i /></div>
            </>
          )}
        </div>

        <aside className="gesture-controls">
          <div className="control-title"><span>MODE AKTIF</span><strong>{activeMode.label}</strong><p>{activeMode.short}</p></div>
          <label className="select-control"><span>Tangga nada</span><select value={scale} onChange={(event) => setScale(event.target.value as ScaleId)}>{Object.entries(SCALES).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select><ChevronDownIcon /></label>
          <label className="select-control"><span>Karakter suara</span><select value={preset} onChange={(event) => setPreset(event.target.value as PresetId)}>{PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDownIcon /></label>
          <div className="segmented-control"><span>Pitch</span><div><button type="button" className={!quantized ? "is-active" : ""} onClick={() => setQuantized(false)}>Bebas</button><button type="button" className={quantized ? "is-active" : ""} onClick={() => setQuantized(true)}>Tangga Nada</button></div></div>
          <label className="range-control"><span>Volume <b>{Math.round(settings.masterVolume * 100)}%</b></span><input type="range" min="0" max="0.85" step="0.01" value={settings.masterVolume} onChange={(event) => updateSettings({ masterVolume: Number(event.target.value) })} /></label>
          <div className="gesture-stats"><span><small>SKALA</small><strong>{currentScale.label}</strong></span><span><small>LATENSI VISUAL</small><strong>{cameraState === "active" ? `${fps} FPS` : "—"}</strong></span></div>
          <div className="privacy-compact"><CameraIcon /><p><strong>Privat secara desain.</strong><br />Frame kamera tidak meninggalkan perangkatmu.</p></div>
        </aside>
      </section>

      <section className="music-tools">
        <div className="touch-player">
          <div><p className="kicker">FALLBACK KEYBOARD & SENTUH</p><h2>Tetap bisa main tanpa kamera.</h2><p>Sentuh pad atau gunakan tombol A–J di keyboard.</p></div>
          <div className="note-pads">{PAD_NOTES.map((midi, index) => <button key={midi} type="button" onPointerDown={() => void playMidi(midi)} aria-label={`Mainkan ${["DO","RE","MI","FA","SOL","LA","SI"][index]}`}><small>{["A","S","D","F","G","H","J"][index]}</small><strong>{["DO","RE","MI","FA","SOL","LA","SI"][index]}</strong></button>)}</div>
        </div>

        <div className="recorder-card">
          <div className="recorder-card__heading"><div><p className="kicker">LOOP RECORDER</p><h3>Rekam melodi gesture.</h3></div><span>{recorded.length} event</span></div>
          <div className="timeline-preview">{recorded.length ? recorded.slice(-16).map((event, index) => <i key={event.id} style={{ height: `${22 + ((event.midi || index * 7) % 42)}px` }} title={event.label} />) : <p>Belum ada nada yang direkam.</p>}</div>
          <div className="recorder-actions">
            <button type="button" className={recording ? "is-recording" : ""} onClick={() => setRecording((value) => !value)}><RecordIcon />{recording ? "Selesai" : "Rekam"}</button>
            <button type="button" onClick={playing ? stopPlayback : playRecording} disabled={!recorded.length}>{playing ? <PauseIcon /> : <PlayIcon />}{playing ? "Hentikan" : "Putar"}</button>
            <button type="button" className={loop ? "is-active" : ""} onClick={() => setLoop((value) => !value)}>LOOP</button>
            <button type="button" onClick={() => { stopPlayback(); setRecorded([]); }} disabled={!recorded.length} aria-label="Hapus rekaman"><TrashIcon /></button>
          </div>
        </div>

        <div className={`challenge-card ${challengeSuccess ? "is-success" : ""}`}>
          <div><p className="kicker">TANTANGAN REIA</p><h3>{challengeSuccess ? "Nahh, melodinya jadi!" : "Mainkan urutan ini"}</h3></div>
          <div className="challenge-sequence">{CHALLENGE.map((item, index) => <span key={item} className={index < challengeIndex || challengeSuccess ? "is-done" : index === challengeIndex && challengeActive ? "is-current" : ""}>{item}</span>)}</div>
          <button className="button button--ink" type="button" onClick={() => { setChallengeActive(true); setChallengeIndex(0); setChallengeSuccess(false); }}>{challengeActive ? "Mulai ulang" : "Mulai tantangan"}</button>
          {mode === "conductor" && <p className="bpm-readout">Tempo terbaca: <strong>{bpm} BPM</strong></p>}
        </div>
      </section>

      <section className="gesture-tutorial">
        <div><p className="kicker">CARA MEMAINKAN</p><h2>Lima gesture, langsung berbunyi.</h2></div>
        <div className="gesture-map">{[1,2,3,4,5].map((count, index) => <div key={count}><span>{count}</span><p><strong>{["DO","RE","MI","FA","SOL"][index]}</strong><small>{count === 5 ? "Telapak terbuka" : `${count} jari`}</small></p></div>)}</div>
      </section>
    </main>
  );
}
