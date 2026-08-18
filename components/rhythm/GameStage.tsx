"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImportedSong, PlayableChart, RhythmNote } from "@/lib/rhythm/types";
import { getActiveLyric, parseLrc, type TimedLyricLine } from "@/lib/rhythm/lyrics";
import { getGlobalOrOnlineLyrics, saveGlobalLyrics, stringifyLyricsToLrc } from "@/lib/firebase/lyrics";
import { useAuth, DEFAULT_KEYBINDS } from "@/lib/firebase/auth";
import { getSongKey, submitScore } from "@/lib/firebase/leaderboard";
import {
  broadcastLiveStats,
  forceStartCountdown,
  setPlayerLoaded,
  subscribeRoom,
  type MultiplayerRoom,
} from "@/lib/firebase/multiplayer";
import { soundFX } from "@/lib/rhythm/soundFx";
import { YouTubeVideoBackground } from "./YouTubeVideoBackground";
import { VideoSettingsModal } from "./VideoSettingsModal";
import { autoFetchMusicVideo } from "@/lib/video/youtube";

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
  baseMultiplier: number;
  effectiveMultiplier: number;
  multiplierProgress: number;
  isStarPower: boolean;
};

type ActiveHold = {
  note: RhythmNote;
  startHoldTime: number;
  endTime: number;
  lastTickTime: number;
  isHolding: boolean;
  releasedTime?: number;
  whammyAmount: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type Shockwave = {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
};

type FloatingText = {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
  subtext?: string;
};

type StarPhrase = {
  id: number;
  noteIds: number[];
  hits: number;
  failed: boolean;
  completed: boolean;
};

type FlameParticle = {
  x: number;
  y: number;
  lane: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
  height: number;
};

type LaneBeam = {
  lane: number;
  color: string;
  life: number;
  maxLife: number;
  centerX: number;
  topWidth: number;
  bottomWidth: number;
};

const colors = ["#68f65d", "#ff4c67", "#ffd84d", "#4ba9ff", "#ff7a3d"];
const laneLabels = ["D", "F", "J", "K", "L"];

const initialStats: Stats = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  hits: 0,
  misses: 0,
  energy: 0,
  feedback: "LOCK IN",
  baseMultiplier: 1,
  effectiveMultiplier: 1,
  multiplierProgress: 0,
  isStarPower: false,
};

function getMultiplierData(combo: number, pulseActive: boolean) {
  let baseMultiplier = 1;
  let progress = 0;
  if (combo >= 30) {
    baseMultiplier = 4;
    progress = 1;
  } else if (combo >= 20) {
    baseMultiplier = 3;
    progress = (combo - 20) / 10;
  } else if (combo >= 10) {
    baseMultiplier = 2;
    progress = (combo - 10) / 10;
  } else {
    baseMultiplier = 1;
    progress = (combo % 10) / 10;
  }
  const effectiveMultiplier = pulseActive ? baseMultiplier * 2 : baseMultiplier;
  return { baseMultiplier, effectiveMultiplier, progress };
}

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

function drawStarGem(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  status: number,
  timestamp: number
) {
  const points = 5;
  const outerRadius = size * 1.25;
  const innerRadius = size * 0.52;

  context.save();
  context.beginPath();
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / points;

  context.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < points; i += 1) {
    const ox = cx + Math.cos(rot) * outerRadius;
    const oy = cy + Math.sin(rot) * outerRadius;
    context.lineTo(ox, oy);
    rot += step;

    const ix = cx + Math.cos(rot) * innerRadius;
    const iy = cy + Math.sin(rot) * innerRadius;
    context.lineTo(ix, iy);
    rot += step;
  }
  context.closePath();

  // Glow
  context.shadowColor = status === 2 ? "#ff4c67" : "#00f0ff";
  context.shadowBlur = status === 2 ? 10 : 25;

  if (status === 2) {
    context.fillStyle = "#3d222a";
  } else {
    // Silver / Cyan / Electric Star gradient
    const grad = context.createRadialGradient(cx, cy, 2, cx, cy, outerRadius);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, "#cff8ff");
    grad.addColorStop(0.75, "#00d0ff");
    grad.addColorStop(1, "#0066aa");
    context.fillStyle = grad;
  }
  context.fill();

  // Faceted Star lines (Guitar Hero arcade star look)
  if (status !== 2) {
    context.strokeStyle = "rgba(255,255,255,0.9)";
    context.lineWidth = 1.4;
    context.stroke();

    // Center star pulse flare
    const pulse = 1 + Math.sin(timestamp * 0.012) * 0.15;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(cx, cy, size * 0.28 * pulse, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function adjustColorTone(hex: string, amount: number): string {
  let color = hex.replace("#", "");
  if (color.length === 3) color = color.split("").map((c) => c + c).join("");
  const num = parseInt(color, 16);
  let r = (num >> 16) + Math.round(255 * amount);
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * amount);
  let b = (num & 0x0000ff) + Math.round(255 * amount);
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function drawOpenNoteBar(
  context: CanvasRenderingContext2D,
  hCenterX: number,
  y: number,
  hTopWidth: number,
  hBottomWidth: number,
  horizonY: number,
  hitY: number,
  overdrive: boolean
) {
  const t = Math.max(0, (y - horizonY) / Math.max(1, hitY - horizonY));
  const curWidth = hTopWidth + (hBottomWidth - hTopWidth) * t;
  const openWidth = (hBottomWidth / 5) * 4.2 * (curWidth / hBottomWidth);
  const barHeight = Math.max(5, 8.5 * (curWidth / hBottomWidth));
  const r = barHeight * 0.45;

  context.save();
  // 1. Soft Shadow
  context.fillStyle = "rgba(0, 0, 0, 0.65)";
  roundedRect(context, hCenterX - openWidth * 0.5, y - barHeight * 0.5 + 3, openWidth, barHeight, r);
  context.fill();

  // 2. Heavy Titanium Rail Casing
  const railGrad = context.createLinearGradient(0, y - barHeight * 0.5, 0, y + barHeight * 0.5);
  railGrad.addColorStop(0, "#e4e4f0");
  railGrad.addColorStop(0.28, "#8b8b9e");
  railGrad.addColorStop(0.72, "#2b2b38");
  railGrad.addColorStop(1, "#12121c");
  context.fillStyle = railGrad;
  context.strokeStyle = "rgba(255, 255, 255, 0.4)";
  context.lineWidth = 1;
  roundedRect(context, hCenterX - openWidth * 0.5, y - barHeight * 0.5, openWidth, barHeight, r);
  context.fill();
  context.stroke();

  // 3. Glowing Neon Core Beam
  const coreGrad = context.createLinearGradient(0, y - barHeight * 0.3, 0, y + barHeight * 0.3);
  coreGrad.addColorStop(0, "#ffffff");
  coreGrad.addColorStop(0.35, overdrive ? "#00f0ff" : "#c084fc");
  coreGrad.addColorStop(1, overdrive ? "#0077aa" : "#581c87");
  context.fillStyle = coreGrad;
  roundedRect(context, hCenterX - openWidth * 0.44, y - barHeight * 0.28, openWidth * 0.88, barHeight * 0.56, r * 0.6);
  context.fill();

  // 4. Specular Highlight Strip
  context.fillStyle = "rgba(255, 255, 255, 0.75)";
  roundedRect(context, hCenterX - openWidth * 0.35, y - barHeight * 0.4, openWidth * 0.7, barHeight * 0.2, 1);
  context.fill();

  context.restore();
}

const NOTE_SPRITE_PATHS = {
  notes: [
    "/assets/notes/Hijau.png",
    "/assets/notes/Merah.png",
    "/assets/notes/Kuning.png",
    "/assets/notes/Biru.png",
    "/assets/notes/Oren.png",
  ],
  stars: [
    "/assets/notes/BintangHijau.png",
    "/assets/notes/BintangMerah.png",
    "/assets/notes/BintangKuning.png",
    "/assets/notes/BintangBiru.png",
    "/assets/notes/BintangOren.png",
  ],
  receptors: [
    "/assets/notes/LubangHijau.png",
    "/assets/notes/LubangMerah.png",
    "/assets/notes/LubangKuning.png",
    "/assets/notes/LubangBiru.png",
    "/assets/notes/LubangOren.png",
  ],
};

const spriteImageCache: Record<string, HTMLImageElement> = {};

function getSpriteImage(src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  if (!spriteImageCache[src]) {
    const img = new Image();
    img.src = src;
    spriteImageCache[src] = img;
  }
  const cached = spriteImageCache[src];
  return cached && cached.complete && cached.naturalWidth > 0 ? cached : null;
}

function drawCustomNoteGem(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  lane: number,
  noteSize: number,
  status: number,
  timestamp: number,
  overdrive: boolean,
  isSideBySide: boolean
) {
  const spriteSrc = overdrive
    ? NOTE_SPRITE_PATHS.stars[lane]
    : NOTE_SPRITE_PATHS.notes[lane];
  const img = spriteSrc ? getSpriteImage(spriteSrc) : null;

  const w = noteSize * (isSideBySide ? 2.15 : 2.5);
  const h = noteSize * (isSideBySide ? 1.45 : 1.75);

  context.save();

  // 1. Soft Highway Contact Shadow
  context.fillStyle = "rgba(0, 0, 0, 0.65)";
  context.beginPath();
  context.ellipse(x, y + h * 0.42, w * 0.46, h * 0.22, 0, 0, Math.PI * 2);
  context.fill();

  if (img) {
    if (status === 2) {
      context.filter = "brightness(0.35) grayscale(0.85)";
    }
    context.drawImage(img, x - w * 0.5, y - h * 0.5, w, h);
    context.filter = "none";
  } else {
    // Vector Fallback
    if (status === 2) {
      context.fillStyle = "#1e161a";
      context.strokeStyle = "#382025";
      context.lineWidth = 1.5;
      roundedRect(context, x - w * 0.5, y - h * 0.5, w, h, h * 0.36);
      context.fill();
      context.stroke();
    } else {
      const baseCol = colors[lane] || "#68f65d";
      const bodyGrad = context.createRadialGradient(x, y - h * 0.2, 2, x, y, w * 0.5);
      bodyGrad.addColorStop(0, "#ffffff");
      bodyGrad.addColorStop(0.3, baseCol);
      bodyGrad.addColorStop(1, "#12121c");
      context.fillStyle = bodyGrad;
      roundedRect(context, x - w * 0.5, y - h * 0.5, w, h, h * 0.36);
      context.fill();
    }
  }

  context.restore();
}

function drawReceptorSprite(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  lane: number,
  fretRadius: number,
  held: boolean,
  activeHold: boolean,
  hitFlash: boolean,
  label: string,
  baseColor: string,
  isSideBySide: boolean
) {
  const spriteSrc = NOTE_SPRITE_PATHS.receptors[lane];
  const img = spriteSrc ? getSpriteImage(spriteSrc) : null;
  const size = fretRadius * (isSideBySide ? 2.5 : 2.85);
  const offsetY = held ? 3 : 0;

  context.save();

  // 1. Soft Drop Shadow beneath receptor
  context.fillStyle = "rgba(0, 0, 0, 0.75)";
  context.beginPath();
  context.ellipse(x, y + size * 0.28, size * 0.48, size * 0.2, 0, 0, Math.PI * 2);
  context.fill();

  if (img) {
    // 2. Draw Lubang Receptor Ring Sprite
    context.drawImage(img, x - size * 0.5, y - size * 0.5 + offsetY, size, size);

    // 3. Inner lighting when active / struck
    if (activeHold || hitFlash) {
      context.fillStyle = baseColor;
      context.beginPath();
      context.ellipse(x, y + offsetY, size * 0.26, size * 0.17, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.ellipse(x, y + offsetY, size * 0.14, size * 0.09, 0, 0, Math.PI * 2);
      context.fill();
    } else if (held) {
      const pressedGrad = context.createRadialGradient(x, y + offsetY, 2, x, y + offsetY, size * 0.3);
      pressedGrad.addColorStop(0, "#ffffff");
      pressedGrad.addColorStop(0.5, baseColor);
      pressedGrad.addColorStop(1, "transparent");
      context.fillStyle = pressedGrad;
      context.beginPath();
      context.ellipse(x, y + offsetY, size * 0.26, size * 0.17, 0, 0, Math.PI * 2);
      context.fill();
    }

    // 4. Custom Keybind / Fret Label
    context.font = `900 ${Math.max(9, fretRadius * 0.52)}px var(--mono, monospace)`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = held || activeHold ? "#0a0a10" : "#ffffff";
    context.fillText(label, x, y + offsetY);
  } else {
    // Vector fallback
    context.beginPath();
    context.arc(x, y + offsetY, fretRadius, 0, Math.PI * 2);
    context.fillStyle = held ? baseColor : "#22222d";
    context.fill();
    context.strokeStyle = baseColor;
    context.lineWidth = 2;
    context.stroke();
    context.font = `900 ${Math.max(8, fretRadius * 0.52)}px var(--mono, monospace)`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.fillText(label, x, y + offsetY);
  }

  context.restore();
}

export function GameStage({ song, chart, speed, offsetMs, inputMode, multiplayerRoom, onExit }: GameStageProps) {
  const { user, profile } = useAuth();

  const activeKeybinds = useMemo(() => {
    return profile?.keybinds || DEFAULT_KEYBINDS;
  }, [profile?.keybinds]);

  const keyLaneMap = useMemo(() => {
    return {
      [activeKeybinds.lane0]: 0,
      [activeKeybinds.lane1]: 1,
      [activeKeybinds.lane2]: 2,
      [activeKeybinds.lane3]: 3,
      [activeKeybinds.lane4]: 4,
      Digit1: 0,
      Digit2: 1,
      Digit3: 2,
      Digit4: 3,
      Digit5: 4,
    };
  }, [activeKeybinds]);

  const formatKeyLabel = useCallback((code: string): string => {
    if (!code) return "";
    if (code.startsWith("Key")) return code.replace("Key", "");
    if (code.startsWith("Digit")) return code.replace("Digit", "");
    if (code === "Semicolon") return ";";
    if (code === "Comma") return ",";
    if (code === "Period") return ".";
    if (code === "Slash") return "/";
    return code.slice(0, 3);
  }, []);

  const customKeyLabels = useMemo(() => [
    formatKeyLabel(activeKeybinds.lane0),
    formatKeyLabel(activeKeybinds.lane1),
    formatKeyLabel(activeKeybinds.lane2),
    formatKeyLabel(activeKeybinds.lane3),
    formatKeyLabel(activeKeybinds.lane4),
  ], [activeKeybinds, formatKeyLabel]);

  const [room, setRoom] = useState<MultiplayerRoom | undefined>(multiplayerRoom);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement[]>([]);
  const statusesRef = useRef(new Uint8Array(chart.notes.length));
  const pressedRef = useRef(new Set<number>());
  const gamepadHeldLanesRef = useRef(new Set<number>());
  const prevGamepadButtonsRef = useRef<boolean[]>([]);
  const prevStrumStateRef = useRef<boolean>(false);
  const prevPulseStateRef = useRef<boolean>(false);
  const prevPauseStateRef = useRef<boolean>(false);
  const activeHoldsRef = useRef<Map<number, ActiveHold>>(new Map());

  // Visual Effects Refs (Juicy beat hit feel!)
  const sparksRef = useRef<Spark[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const flamesRef = useRef<FlameParticle[]>([]);
  const laneBeamsRef = useRef<LaneBeam[]>([]);
  const shakeRef = useRef<{ x: number; y: number; amount: number }>({ x: 0, y: 0, amount: 0 });

  const lastTimeRef = useRef(performance.now());
  const statsRef = useRef<Stats>({ ...initialStats });
  const phaseRef = useRef<"ready" | "playing" | "paused" | "finished">("ready");
  const lastHudUpdateRef = useRef(0);
  const activePulseUntilRef = useRef(0);
  const whammyActiveUntilRef = useRef(0);
  const flashRef = useRef<{ lane: number; until: number; hit: boolean }[]>([]);
  const [phase, setPhase] = useState<"ready" | "playing" | "paused" | "finished">("ready");
  const [multiplayerCountdown, setMultiplayerCountdown] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats>({ ...initialStats });
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [section, setSection] = useState("Opening");
  const [gamepadName, setGamepadName] = useState<string>("");
  const [lyrics, setLyrics] = useState<TimedLyricLine[]>(song.lyrics ?? []);
  const [showLyrics, setShowLyrics] = useState<boolean>(true);
  const [lyricOffsetMs, setLyricOffsetMs] = useState<number>(0);
  const [showLyricSyncModal, setShowLyricSyncModal] = useState<boolean>(false);
  const [lyricDisplayMode, setLyricDisplayMode] = useState<"karaoke" | "teleprompter" | "off">("karaoke");
  const [currentLyricText, setCurrentLyricText] = useState<string>("");
  const [nextLyricText, setNextLyricText] = useState<string>("");
  const [lyricProgress, setLyricProgress] = useState<number>(0);
  const [activeLyricIndex, setActiveLyricIndex] = useState<number>(-1);
  const [upcomingLyrics, setUpcomingLyrics] = useState<TimedLyricLine[]>([]);
  const [customLrcInput, setCustomLrcInput] = useState<string>("");
  const [searchingLyrics, setSearchingLyrics] = useState<boolean>(false);
  const [savingGlobalLyrics, setSavingGlobalLyrics] = useState<boolean>(false);
  const [lyricSource, setLyricSource] = useState<string>("none");
  const [lyricSearchQuery, setLyricSearchQuery] = useState<string>(
    `${song.metadata.artist === "Unknown artist" ? "" : song.metadata.artist} ${song.metadata.title}`.trim()
  );
  const [lyricSyncActiveTab, setLyricSyncActiveTab] = useState<"calibrate" | "search" | "paste">("calibrate");
  const objectUrls = useMemo(() => song.audio.map((asset) => URL.createObjectURL(asset.blob)), [song]);

  // Smart YouTube Music Video Background State
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string>("");
  const [videoOffsetMs, setVideoOffsetMs] = useState<number>(0);
  const [videoDimPercent, setVideoDimPercent] = useState<number>(45);
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [showVideoModal, setShowVideoModal] = useState<boolean>(false);
  const [loadingVideo, setLoadingVideo] = useState<boolean>(false);

  // Auto-fetch verified music video for current song
  useEffect(() => {
    let active = true;
    const fetchVideo = async () => {
      setLoadingVideo(true);
      try {
        const vid = await autoFetchMusicVideo(song.metadata.artist, song.metadata.title);
        if (active && vid?.videoId) {
          setVideoId(vid.videoId);
          setVideoTitle(vid.title);
        }
      } catch (err) {
        console.warn("Auto video fetch failed:", err);
      } finally {
        if (active) setLoadingVideo(false);
      }
    };
    void fetchVideo();
    return () => {
      active = false;
    };
  }, [song.metadata.artist, song.metadata.title]);

  // Subscribe to multiplayer room updates
  useEffect(() => {
    if (!multiplayerRoom?.id) return;
    const unsub = subscribeRoom(multiplayerRoom.id, (updated) => {
      if (updated) setRoom(updated);
    });
    return () => unsub();
  }, [multiplayerRoom?.id]);

  // Identify remote opponent in multiplayer room
  const remotePlayer = useMemo(() => {
    if (!room?.players) return undefined;
    return Object.values(room.players).find((p) => p.uid !== user?.uid);
  }, [room?.players, user?.uid]);

  const isHost = Boolean(user && room && room.hostId === user.uid);

  // Host auto-countdown safety fallback (3.5s max buffer wait so match starts quickly)
  useEffect(() => {
    if (!isHost || !room?.id) return;
    if (room.status === "loading" && !room.startTime) {
      const autoStartTimer = setTimeout(() => {
        void forceStartCountdown(room.id);
      }, 3500);
      return () => clearTimeout(autoStartTimer);
    }
  }, [isHost, room?.id, room?.status, room?.startTime]);

  // Group consecutive overdrive notes into Star Power phrases
  const { starPhrases, notePhraseMap } = useMemo(() => {
    const phrases: StarPhrase[] = [];
    const map = new Map<number, StarPhrase>();
    let currentPhraseNotes: number[] = [];
    let lastOverdriveTime = -999;
    let phraseId = 0;

    for (const note of chart.notes) {
      if (note.overdrive) {
        if (currentPhraseNotes.length === 0 || note.time - lastOverdriveTime <= 2.2) {
          currentPhraseNotes.push(note.id);
        } else {
          if (currentPhraseNotes.length >= 2) {
            const phrase: StarPhrase = {
              id: phraseId++,
              noteIds: [...currentPhraseNotes],
              hits: 0,
              failed: false,
              completed: false,
            };
            phrases.push(phrase);
            phrase.noteIds.forEach((id) => map.set(id, phrase));
          }
          currentPhraseNotes = [note.id];
        }
        lastOverdriveTime = note.time;
      } else {
        if (currentPhraseNotes.length >= 2) {
          const phrase: StarPhrase = {
            id: phraseId++,
            noteIds: [...currentPhraseNotes],
            hits: 0,
            failed: false,
            completed: false,
          };
          phrases.push(phrase);
          phrase.noteIds.forEach((id) => map.set(id, phrase));
        }
        currentPhraseNotes = [];
      }
    }

    if (currentPhraseNotes.length >= 2) {
      const phrase: StarPhrase = {
        id: phraseId++,
        noteIds: [...currentPhraseNotes],
        hits: 0,
        failed: false,
        completed: false,
      };
      phrases.push(phrase);
      phrase.noteIds.forEach((id) => map.set(id, phrase));
    }

    return { starPhrases: phrases, notePhraseMap: map };
  }, [chart.notes]);

  const duration = useMemo(() => {
    return (song.metadata.durationMs ? song.metadata.durationMs / 1000 : 0) || (chart.notes[chart.notes.length - 1]?.time + 2) || 0;
  }, [chart.notes, song.metadata.durationMs]);

  // Load Global Synced Lyrics (Firestore / Local / LRCLIB fallback)
  useEffect(() => {
    let isCancelled = false;

    const loadLyrics = async () => {
      try {
        const dur = duration || song.metadata.durationMs / 1000 || 0;
        const res = await getGlobalOrOnlineLyrics(
          song.metadata.artist,
          song.metadata.title,
          song.metadata.album,
          dur
        );
        if (isCancelled) return;

        if (res.lyrics.length > 0) {
          setLyrics(res.lyrics);
          if (res.offsetMs !== 0) setLyricOffsetMs(res.offsetMs);
          setLyricSource(res.source);

          floatingTextsRef.current.push({
            text: res.source === "firestore"
              ? "🎤 LIRIK GLOBAL FIRESTORE AKTIF!"
              : "🎤 LIRIK TERSINKRONISASI AKTIF!",
            x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
            y: typeof window !== "undefined" ? window.innerHeight * 0.35 : 200,
            vy: -40,
            life: 1,
            maxLife: 2.2,
            color: "#d8ff3f",
            scale: 1.1,
          });
        }
      } catch (err) {
        console.error("GameStage lyric loading error:", err);
      }
    };

    void loadLyrics();
    return () => {
      isCancelled = true;
    };
  }, [duration, song.metadata.album, song.metadata.artist, song.metadata.durationMs, song.metadata.title]);

  const handleSearchLyrics = async () => {
    if (!lyricSearchQuery.trim()) return;
    setSearchingLyrics(true);
    try {
      const dur = Math.round(duration || song.metadata.durationMs / 1000 || 0);
      const res = await fetch(`/api/lyrics?track=${encodeURIComponent(lyricSearchQuery)}&artist=&duration=${dur}`);
      if (!res.ok) throw new Error("Lirik tidak ditemukan di database LRCLIB.");
      const data = (await res.json()) as { syncedLyrics?: string; trackName?: string };
      if (data && data.syncedLyrics) {
        const parsed = parseLrc(data.syncedLyrics);
        if (parsed.length > 0) {
          setLyrics(parsed);
          setLyricDisplayMode("karaoke");
          setLyricSource("lrclib");
          alert(`✅ Lirik tersinkronisasi ditemukan (${parsed.length} baris) untuk "${data.trackName || lyricSearchQuery}"! Klik "SIMPAN GLOBAL" di bawah jika ingin membagikannya ke semua player.`);
          setShowLyricSyncModal(false);
          return;
        }
      }
      throw new Error("Lirik bertanda waktu (.lrc) tidak tersedia untuk judul ini.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal memuat lirik.");
    } finally {
      setSearchingLyrics(false);
    }
  };

  const handleApplyCustomLrc = () => {
    if (!customLrcInput.trim()) return;
    const parsed = parseLrc(customLrcInput);
    if (parsed.length > 0) {
      setLyrics(parsed);
      setLyricDisplayMode("karaoke");
      setLyricSource("custom");
      alert(`✅ Berhasil menerapkan ${parsed.length} baris lirik kustom! Klik "SIMPAN GLOBAL" untuk membagikannya ke semua orang.`);
      setShowLyricSyncModal(false);
    } else {
      alert("Format LRC tidak valid. Pastikan ada timestamp seperti [01:23.45] Teks lirik.");
    }
  };

  const handleSaveGlobalLyricsInGame = async () => {
    if (!lyrics.length) {
      alert("Belum ada baris lirik untuk disimpan.");
      return;
    }
    setSavingGlobalLyrics(true);
    try {
      const lrcContent = stringifyLyricsToLrc(lyrics, lyricOffsetMs);
      const res = await saveGlobalLyrics(
        song.metadata.artist,
        song.metadata.title,
        lrcContent,
        lyricOffsetMs,
        user
      );
      if (res.success) {
        setLyricSource("firestore");
        alert(`🎉 BERHASIL DISIMPAN KE GLOBAL FIRESTORE!\n\nSemua pemain di dunia yang memainkan lagu "${song.metadata.title}" kini otomatis menggunakan lirik dan offset yang baru saja kamu simpan.`);
        setShowLyricSyncModal(false);
      } else {
        alert(`Gagal menyimpan global: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || err}`);
    } finally {
      setSavingGlobalLyrics(false);
    }
  };

  // Create Audio objects & signal loaded in multiplayer
  useEffect(() => {
    const elements = objectUrls.map((url) => {
      const element = new Audio(url);
      element.preload = "auto";
      return element;
    });
    audioRef.current = elements;

    // In multiplayer: signal loaded status when audio is fully loaded/buffered
    if (multiplayerRoom?.id && user) {
      let reported = false;
      const report = () => {
        if (!reported) {
          reported = true;
          void setPlayerLoaded(multiplayerRoom.id, user.uid, true);
        }
      };

      if (elements.length === 0) {
        report();
      } else {
        let ready = 0;
        elements.forEach((el) => {
          if (el.readyState >= 2) {
            ready += 1;
          } else {
            const onCanPlay = () => {
              ready += 1;
              if (ready >= elements.length) report();
            };
            el.addEventListener("canplaythrough", onCanPlay, { once: true });
            el.addEventListener("loadeddata", onCanPlay, { once: true });
          }
        });
        if (ready >= elements.length) {
          report();
        }
        const fallbackTimer = setTimeout(report, 2000);
        return () => {
          clearTimeout(fallbackTimer);
          elements.forEach((element) => {
            element.pause();
            element.src = "";
          });
          objectUrls.forEach((url) => URL.revokeObjectURL(url));
        };
      }
    }

    return () => {
      elements.forEach((element) => {
        element.pause();
        element.src = "";
      });
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [objectUrls, multiplayerRoom?.id, user]);

  const songTime = useCallback(() => {
    const primary = audioRef.current[0];
    if (!primary) return 0;
    return Math.max(0, primary.currentTime + offsetMs / 1000);
  }, [offsetMs]);

  const publishStats = useCallback((next: Stats) => {
    statsRef.current = next;
    setStats(next);
  }, []);

  const hitNote = useCallback((note: RhythmNote) => {
    const now = songTime();
    statusesRef.current[note.id] = 1;
    const current = statsRef.current;
    const nextCombo = current.combo + 1;
    const pulseActive = now < activePulseUntilRef.current;
    const { baseMultiplier, effectiveMultiplier, progress: multProgress } = getMultiplierData(nextCombo, pulseActive);
    const prevMultData = getMultiplierData(current.combo, pulseActive);
    const isChord = note.lanes.length > 1;

    // Precision Rhythm Timing Judgements (PERFECT / GREAT / GOOD / OK)
    const deltaMs = Math.abs(note.time - now) * 1000;
    let judgement = "PERFECT!!";
    let judgementColor = "#ffd84d";
    let judgementBasePoints = 100;
    let judgementScale = 1.35;
    let timingSubtext: string | undefined = undefined;

    if (deltaMs <= 40) {
      judgement = "PERFECT!!";
      judgementColor = "#ffd84d";
      judgementBasePoints = 120;
      judgementScale = 1.45;
    } else if (deltaMs <= 80) {
      judgement = "GREAT!";
      judgementColor = "#68f65d";
      judgementBasePoints = 90;
      judgementScale = 1.25;
      timingSubtext = note.time > now ? "EARLY" : "LATE";
    } else if (deltaMs <= 125) {
      judgement = "GOOD";
      judgementColor = "#4ba9ff";
      judgementBasePoints = 60;
      judgementScale = 1.1;
      timingSubtext = note.time > now ? "EARLY" : "LATE";
    } else {
      judgement = "OK";
      judgementColor = "#ff9a3c";
      judgementBasePoints = 40;
      judgementScale = 0.95;
      timingSubtext = note.time > now ? "EARLY" : "LATE";
    }

    // If note has sustain duration, register active hold
    if (note.duration > 0.08) {
      activeHoldsRef.current.set(note.id, {
        note,
        startHoldTime: now,
        endTime: note.time + note.duration,
        lastTickTime: now,
        isHolding: true,
        whammyAmount: 0,
      });
    }

    // Star Power Phrase Tracking
    let nextEnergy = current.energy;
    let feedback = judgement;

    if (note.overdrive) {
      const phrase = notePhraseMap.get(note.id);
      if (phrase && !phrase.failed && !phrase.completed) {
        phrase.hits += 1;
        if (phrase.hits === phrase.noteIds.length) {
          phrase.completed = true;
          nextEnergy = Math.min(100, current.energy + 25);
          feedback = "⭐ STAR POWER +25%!";

          floatingTextsRef.current.push({
            text: "⭐ STAR POWER +25%!",
            x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
            y: typeof window !== "undefined" ? window.innerHeight * 0.65 : 450,
            vy: -85,
            life: 1,
            maxLife: 1.2,
            color: "#00f0ff",
            scale: 1.6,
          });
          feedback = "⭐ PHRASE COMPLETE!";
          soundFX.playStarPhraseSuccess();
          for (let i = 0; i < 35; i += 1) {
            sparksRef.current.push({
              x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
              y: typeof window !== "undefined" ? window.innerHeight * 0.45 : 300,
              vx: (Math.random() - 0.5) * 280,
              vy: -Math.random() * 280 - 80,
              life: 1,
              maxLife: 0.65 + Math.random() * 0.35,
              color: i % 2 === 0 ? "#00f0ff" : "#ffd84d",
              size: 4 + Math.random() * 5,
            });
          }
        } else {
          feedback = "⭐ STAR NOTE!";
        }
      }
    }

    if (effectiveMultiplier > prevMultData.effectiveMultiplier) {
      feedback = `${effectiveMultiplier}× MULTIPLIER!`;
      floatingTextsRef.current.push({
        text: `${effectiveMultiplier}×!`,
        x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
        y: typeof window !== "undefined" ? window.innerHeight * 0.72 : 500,
        vy: -75,
        life: 1,
        maxLife: 0.85,
        color: pulseActive ? "#d783ff" : effectiveMultiplier === 4 ? "#ff9a3c" : effectiveMultiplier === 3 ? "#4ba9ff" : "#68f65d",
        scale: 1.4,
      });
    } else if (nextCombo % 25 === 0 && nextCombo > 0) {
      feedback = `${nextCombo} STREAK!`;
      floatingTextsRef.current.push({
        text: `${nextCombo} STREAK!`,
        x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
        y: typeof window !== "undefined" ? window.innerHeight * 0.72 : 500,
        vy: -70,
        life: 1,
        maxLife: 0.85,
        color: "#ffd84d",
        scale: 1.3,
      });
    } else if (isChord) {
      feedback = "CHORD " + judgement;
    }

    const notePoints = judgementBasePoints * Math.max(1, note.lanes.length) * effectiveMultiplier;

    const next: Stats = {
      score: current.score + notePoints,
      combo: nextCombo,
      maxCombo: Math.max(current.maxCombo, nextCombo),
      hits: current.hits + 1,
      misses: current.misses,
      energy: nextEnergy,
      feedback,
      baseMultiplier,
      effectiveMultiplier,
      multiplierProgress: multProgress,
      isStarPower: pulseActive,
    };

    const canvas = canvasRef.current;
    const cWidth = canvas?.clientWidth ?? 800;
    const cHeight = canvas?.clientHeight ?? 600;
    const isMulti = Boolean(room && Object.keys(room.players || {}).length > 1);
    const p1CenterX = isMulti ? cWidth * 0.28 : cWidth / 2;
    const p1TopWidth = isMulti ? Math.min(cWidth * 0.22, 220) : Math.min(cWidth * 0.40, 360);
    const p1BottomWidth = isMulti ? Math.min(cWidth * 0.40, 380) : Math.min(cWidth * 0.72, 620);
    const hitY = cHeight * 0.82;

    note.lanes.filter((lane) => lane >= 0).forEach((lane) => {
      const rx = p1CenterX + (lane - 2) * (p1BottomWidth / 5);
      const laneColor = note.overdrive ? "#00f0ff" : colors[lane];

      // 1. Localized Receptor Shockwave Ring
      shockwavesRef.current.push({
        x: rx,
        y: hitY,
        radius: 8,
        maxRadius: 28,
        color: laneColor,
        life: 1,
        maxLife: 0.22,
      });

      // 2. Authentic Guitar Hero Receptor Flame Tongue
      flamesRef.current.push({
        x: rx,
        y: hitY + 2,
        lane,
        color: laneColor,
        life: 1,
        maxLife: 0.28,
        size: 26,
        height: 62,
      });

      // 3. Clean Localized Sparks on the struck receptor (Per Beat / Per Hit Lane only)
      const sparkCount = note.overdrive ? 14 : 10;
      for (let i = 0; i < sparkCount; i += 1) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
        const sparkSpeed = 60 + Math.random() * 120;
        sparksRef.current.push({
          x: rx + (Math.random() - 0.5) * 8,
          y: hitY + (Math.random() - 0.5) * 4,
          vx: Math.cos(angle) * sparkSpeed,
          vy: Math.sin(angle) * sparkSpeed,
          life: 1,
          maxLife: 0.22 + Math.random() * 0.16,
          color: note.overdrive ? (i % 2 === 0 ? "#00f0ff" : "#ffffff") : (i % 3 === 0 ? "#ffffff" : laneColor),
          size: 2 + Math.random() * 2.5,
        });
      }
    });

    // 5. Spawn Floating Judgement Text & Score Points
    const primeLane = note.lanes.find((l) => l >= 0) ?? 2;
    const popupX = p1CenterX + (primeLane - 2) * (p1BottomWidth / 5);
    const popupY = hitY - 50;

    floatingTextsRef.current.push({
      text: note.overdrive ? "⭐ " + judgement : judgement,
      x: popupX,
      y: popupY,
      vy: -60,
      life: 1,
      maxLife: 0.7,
      color: note.overdrive ? "#00f0ff" : judgementColor,
      scale: judgementScale,
      subtext: `+${notePoints} PTS`,
    });

    flashRef.current.push(...note.lanes.map((lane) => ({ lane, until: performance.now() + 180, hit: true })));
    publishStats(next);
    if (multiplayerRoom?.id && user) {
      void broadcastLiveStats(multiplayerRoom.id, user.uid, next.score, next.combo, false);
    }
  }, [multiplayerRoom?.id, notePhraseMap, publishStats, room, songTime, user]);

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
    if (phaseRef.current !== "playing" || statsRef.current.isStarPower) return;
    const currentEnergy = statsRef.current.energy;
    if (currentEnergy < 50) {
      floatingTextsRef.current.push({
        text: `ENERGY ${Math.round(currentEnergy)}% (BUTUH ≥50%)`,
        x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
        y: typeof window !== "undefined" ? window.innerHeight * 0.7 : 480,
        vy: -55,
        life: 1,
        maxLife: 0.85,
        color: "#ff7788",
        scale: 1.15,
      });
      return;
    }
    const activeDuration = (currentEnergy / 100) * 12;
    activePulseUntilRef.current = songTime() + activeDuration;
    soundFX.playStarPowerActivate();

    const { baseMultiplier, effectiveMultiplier, progress: multProgress } = getMultiplierData(statsRef.current.combo, true);

    floatingTextsRef.current.push({
      text: `${effectiveMultiplier}× STAR POWER!`,
      x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
      y: typeof window !== "undefined" ? window.innerHeight * 0.7 : 480,
      vy: -95,
      life: 1,
      maxLife: 1.2,
      color: "#00f0ff",
      scale: 1.7,
    });

    publishStats({
      ...statsRef.current,
      feedback: "STAR POWER!",
      baseMultiplier,
      effectiveMultiplier,
      multiplierProgress: multProgress,
      isStarPower: true,
    });
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

  const launch = useCallback((startOffsetSeconds = 0) => {
    const audio = audioRef.current;
    if (!audio.length) return;
    statusesRef.current.fill(0);
    activeHoldsRef.current.clear();
    sparksRef.current = [];
    shockwavesRef.current = [];
    floatingTextsRef.current = [];
    flamesRef.current = [];
    laneBeamsRef.current = [];
    shakeRef.current = { x: 0, y: 0, amount: 0 };

    starPhrases.forEach((phrase) => {
      phrase.hits = 0;
      phrase.failed = false;
      phrase.completed = false;
    });

    publishStats({ ...initialStats });
    setProgress(0);
    setElapsed(startOffsetSeconds);
    activePulseUntilRef.current = 0;
    audio.forEach((element) => {
      element.currentTime = startOffsetSeconds;
      element.playbackRate = speed;
    });
    void Promise.all(audio.map((element) => element.play())).then(() => {
      phaseRef.current = "playing";
      setPhase("playing");
    }).catch(() => {
      publishStats({ ...statsRef.current, feedback: "TAP TO RETRY" });
    });
  }, [publishStats, speed, starPhrases]);

  // Real-time Synchronized Multiplayer Countdown & Downbeat Launch
  useEffect(() => {
    if (!room?.id) return;

    if (room.status === "countdown" && room.startTime) {
      const syncInterval = setInterval(() => {
        const now = Date.now();
        const diffMs = room.startTime! - now;
        if (diffMs > 0) {
          const sec = Math.ceil(diffMs / 1000);
          setMultiplayerCountdown(sec);
        } else {
          // Exactly at or past startTime: Start track simultaneously!
          setMultiplayerCountdown(null);
          clearInterval(syncInterval);
          if (phaseRef.current !== "playing" && phaseRef.current !== "finished") {
            const startOffset = Math.max(0, (now - room.startTime!) / 1000);
            launch(startOffset);
          }
        }
      }, 30);
      return () => clearInterval(syncInterval);
    } else if (room.status === "playing" && room.startTime) {
      setMultiplayerCountdown(null);
      if (phaseRef.current !== "playing" && phaseRef.current !== "finished") {
        const startOffset = Math.max(0, (Date.now() - room.startTime) / 1000);
        launch(startOffset);
      }
    }
  }, [room?.id, room?.status, room?.startTime, launch]);

  // Keyboard event listeners with activeKeybinds
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const lane = keyLaneMap[event.code];
      if (lane !== undefined) {
        event.preventDefault();
        pressedRef.current.add(lane);
        if (inputMode === "tap") attemptTap(lane);
        return;
      }
      if (event.code === activeKeybinds.strum || (inputMode === "strum" && ["Space", "Enter", "ArrowUp", "ArrowDown"].includes(event.code))) {
        event.preventDefault();
        attemptStrum();
        return;
      }
      if (
        event.code === activeKeybinds.pulse ||
        ["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Tab", "Backquote", "KeyO"].includes(event.code) ||
        (inputMode === "tap" && (event.code === "Space" || event.code === "Enter"))
      ) {
        event.preventDefault();
        activatePulse();
        return;
      } else if (event.code === "KeyW" || event.code === "KeyE") {
        whammyActiveUntilRef.current = songTime() + 0.3;
      } else if (event.code === activeKeybinds.pause || event.code === "Escape" || event.code === "KeyP") {
        pause();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const lane = keyLaneMap[event.code];
      if (lane !== undefined) {
        if (!gamepadHeldLanesRef.current.has(lane)) {
          pressedRef.current.delete(lane);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [activatePulse, activeKeybinds, attemptStrum, attemptTap, inputMode, keyLaneMap, pause, songTime]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && phaseRef.current === "playing") pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  // Gamepad detection & polling handler
  const pollGamepad = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    const activeGp = Array.from(gamepads).find((gp) => gp && gp.connected);

    if (!activeGp) {
      if (gamepadName) setGamepadName("");
      return;
    }

    if (!gamepadName) {
      const cleanName = activeGp.id.replace(/\([^)]*\)/g, "").trim() || "Gamepad";
      setGamepadName(cleanName);
    }

    const b = activeGp.buttons;
    const a = activeGp.axes;
    const isGuitar = activeGp.id.toLowerCase().includes("guitar") || activeGp.id.toLowerCase().includes("gh");

    const lanePressed = [
      Boolean(b[6]?.pressed || (b[6]?.value && b[6].value > 0.3) || (isGuitar && b[0]?.pressed)),
      Boolean(b[4]?.pressed || (isGuitar && b[1]?.pressed)),
      Boolean(b[5]?.pressed || (isGuitar && b[2]?.pressed)),
      isGuitar
        ? Boolean(b[3]?.pressed)
        : Boolean(b[7]?.pressed || (b[7]?.value && b[7].value > 0.3) || b[3]?.pressed),
      isGuitar
        ? Boolean(b[4]?.pressed || b[5]?.pressed)
        : Boolean(b[0]?.pressed || b[1]?.pressed),
    ];

    for (let lane = 0; lane < 5; lane += 1) {
      const isPressed = lanePressed[lane];
      const wasPressed = gamepadHeldLanesRef.current.has(lane);

      if (isPressed && !wasPressed) {
        gamepadHeldLanesRef.current.add(lane);
        pressedRef.current.add(lane);
        if (inputMode === "tap") attemptTap(lane);
      } else if (!isPressed && wasPressed) {
        gamepadHeldLanesRef.current.delete(lane);
        pressedRef.current.delete(lane);
      } else if (isPressed) {
        pressedRef.current.add(lane);
      }
    }

    const isStrumming = Boolean(
      b[12]?.pressed ||
      b[13]?.pressed ||
      (a[1] !== undefined && (a[1] < -0.45 || a[1] > 0.45)) ||
      (!isGuitar && inputMode === "strum" && (b[2]?.pressed || b[3]?.pressed))
    );

    if (isStrumming && !prevStrumStateRef.current) {
      if (inputMode === "strum") attemptStrum();
      else attemptTap(-1);
    }
    prevStrumStateRef.current = isStrumming;

    const isPulse = Boolean(b[8]?.pressed || b[10]?.pressed || b[11]?.pressed || (isGuitar && b[9]?.pressed));
    if (isPulse && !prevPulseStateRef.current) {
      activatePulse();
    }
    prevPulseStateRef.current = isPulse;

    const whammyAxis = Math.max(Math.abs(a[2] || 0), Math.abs(a[3] || 0), Math.abs(a[5] || 0));
    if (whammyAxis > 0.25) {
      whammyActiveUntilRef.current = songTime() + 0.25;
    }

    const isPause = Boolean(b[9]?.pressed || b[16]?.pressed);
    if (isPause && !prevPauseStateRef.current) {
      pause();
    }
    prevPauseStateRef.current = isPause;
    prevGamepadButtonsRef.current = b.map((btn) => Boolean(btn?.pressed));
  }, [activatePulse, attemptStrum, attemptTap, gamepadName, inputMode, pause, songTime]);

  // Main rendering loop (Dual Highway + Juicy Effects)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;

    const draw = (timestamp: number) => {
      try {
        const dt = Math.min(0.05, (timestamp - lastTimeRef.current) / 1000);
        lastTimeRef.current = timestamp;

        pollGamepad();

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
      const isWhammying = now < whammyActiveUntilRef.current;
      const { effectiveMultiplier } = getMultiplierData(statsRef.current.combo, pulseActive);

      // Star Power energy drain
      if (pulseActive && phaseRef.current === "playing") {
        const drainRate = 8.33;
        const nextEnergy = Math.max(0, statsRef.current.energy - drainRate * dt);
        statsRef.current.energy = nextEnergy;
        if (nextEnergy <= 0) {
          activePulseUntilRef.current = 0;
          statsRef.current.isStarPower = false;
        }
      }

      // 1. STAGE BACKGROUND & ARENA LIGHTING
      context.save();
      context.clearRect(0, 0, width, height);
      if (!videoId || !videoEnabled) {
        const background = context.createLinearGradient(0, 0, 0, height);
        background.addColorStop(0, pulseActive ? "#1e0840" : "#07070b");
        background.addColorStop(0.55, pulseActive ? "#0b1544" : "#0a0a0f");
        background.addColorStop(1, "#020204");
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      }
      context.restore();

      // Highway Dimensions Configuration
      const isSideBySide = Boolean(room && Object.keys(room.players || {}).length > 1);
      const horizonY = Math.max(90, height * 0.16);
      const hitY = height * 0.82;
      const travel = 2.4 / speed;

      // Local Player (P1) Highway Center
      const p1CenterX = isSideBySide ? width * 0.28 : width / 2;
      const p1TopWidth = isSideBySide ? Math.min(width * 0.22, 220) : Math.min(width * 0.40, 360);
      const p1BottomWidth = isSideBySide ? Math.min(width * 0.40, 380) : Math.min(width * 0.72, 620);

      // Remote Opponent (P2) Highway Center
      const p2CenterX = width * 0.72;
      const p2TopWidth = p1TopWidth;
      const p2BottomWidth = p1BottomWidth;

      const widthAt = (y: number, topW: number, botW: number) =>
        topW + (botW - topW) * ((y - horizonY) / (hitY - horizonY));
      const yAt = (time: number) => {
        const progressValue = 1 - (time - now) / travel;
        return horizonY + (hitY - horizonY) * Math.pow(Math.max(0, Math.min(1.15, progressValue)), 1.35);
      };

      // Sustain note continuous ticks
      if (phaseRef.current === "playing") {
        for (const [noteId, hold] of activeHoldsRef.current.entries()) {
          const note = hold.note;
          const lanesHeld = note.lanes.every((lane) => lane === -1 || pressedRef.current.has(lane));

          if (lanesHeld) {
            hold.isHolding = true;
            if (isWhammying) hold.whammyAmount = Math.min(1, hold.whammyAmount + 0.1);
            else hold.whammyAmount = Math.max(0, hold.whammyAmount - 0.05);

            if (note.overdrive && hold.whammyAmount > 0.15 && !pulseActive) {
              const whammyEnergyGain = (isWhammying ? 3.5 : 1.5) * dt;
              statsRef.current.energy = Math.min(100, statsRef.current.energy + whammyEnergyGain);
            }

            if (now - hold.lastTickTime >= 0.055 && now <= hold.endTime + 0.04) {
              hold.lastTickTime = now;
              const tickPoints = Math.round(18 * Math.max(1, note.lanes.length) * effectiveMultiplier);
              statsRef.current = {
                ...statsRef.current,
                score: statsRef.current.score + tickPoints,
                feedback: hold.whammyAmount > 0.2 ? "WHAMMY!" : note.overdrive ? "⭐ STAR HOLD" : "HELD",
              };

              note.lanes.filter((lane) => lane >= 0).forEach((lane) => {
                const rx = p1CenterX + (lane - 2) * (p1BottomWidth / 5);
                for (let i = 0; i < 3; i += 1) {
                  sparksRef.current.push({
                    x: rx + (Math.random() - 0.5) * 18,
                    y: hitY + (Math.random() - 0.5) * 6,
                    vx: (Math.random() - 0.5) * 80,
                    vy: -Math.random() * 110 - 20,
                    life: 1,
                    maxLife: 0.24 + Math.random() * 0.18,
                    color: note.overdrive ? "#00f0ff" : colors[lane],
                    size: 2.8 + Math.random() * 3,
                  });
                }
              });
            }
          } else {
            if (hold.isHolding) {
              hold.isHolding = false;
              hold.releasedTime = now;
            }
          }

          if (now >= hold.endTime) {
            if (hold.isHolding) {
              const completionBonus = 50 * effectiveMultiplier;
              statsRef.current = {
                ...statsRef.current,
                score: statsRef.current.score + completionBonus,
                feedback: "SUSTAIN MAX!",
              };

              note.lanes.filter((lane) => lane >= 0).forEach((lane) => {
                const rx = p1CenterX + (lane - 2) * (p1BottomWidth / 5);
                for (let i = 0; i < 14; i += 1) {
                  sparksRef.current.push({
                    x: rx,
                    y: hitY,
                    vx: (Math.random() - 0.5) * 160,
                    vy: (Math.random() - 0.5) * 160,
                    life: 1,
                    maxLife: 0.35 + Math.random() * 0.2,
                    color: note.overdrive ? "#00f0ff" : "#ffffff",
                    size: 3 + Math.random() * 3.5,
                  });
                }
              });
            }
            activeHoldsRef.current.delete(noteId);
          }
        }
      }

      // FUNCTION TO DRAW A SINGLE HIGHWAY (PLAYER 1 OR OPPONENT PLAYER 2)
      const renderHighwaySurface = (
        hCenterX: number,
        hTopWidth: number,
        hBottomWidth: number,
        isPlayer1: boolean,
        playerOverdrive: boolean,
        pName: string
      ) => {
        const laneXLocal = (lane: number, y: number) =>
          hCenterX + (lane - 2) * (widthAt(y, hTopWidth, hBottomWidth) / 5);

        context.save();

        // 1. Highway 3D Board
        context.beginPath();
        context.moveTo(hCenterX - hTopWidth / 2, horizonY);
        context.lineTo(hCenterX + hTopWidth / 2, horizonY);
        context.lineTo(hCenterX + hBottomWidth / 2, hitY + 60);
        context.lineTo(hCenterX - hBottomWidth / 2, hitY + 60);
        context.closePath();

        const boardGrad = context.createLinearGradient(0, horizonY, 0, hitY);
        boardGrad.addColorStop(0, "rgba(16,16,24,.6)");
        boardGrad.addColorStop(1, playerOverdrive ? "rgba(22,16,46,.98)" : "rgba(20,20,30,.98)");
        context.fillStyle = boardGrad;
        context.fill();
        context.clip();

        // Beat Grid Lines
        for (let beat = Math.floor(now * 2); beat < Math.floor((now + travel) * 2) + 2; beat += 1) {
          const y = yAt(beat / 2);
          if (y < horizonY || y > hitY + 20) continue;
          context.strokeStyle = beat % 4 === 0 ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.07)";
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(hCenterX - widthAt(y, hTopWidth, hBottomWidth) / 2, y);
          context.lineTo(hCenterX + widthAt(y, hTopWidth, hBottomWidth) / 2, y);
          context.stroke();
        }

        // Highway Lane Dividers
        for (let lane = 0; lane < 5; lane += 1) {
          const xTop = hCenterX + (lane - 2.5) * (hTopWidth / 5);
          const xBottom = hCenterX + (lane - 2.5) * (hBottomWidth / 5);
          context.strokeStyle = playerOverdrive ? "rgba(0,240,255,.25)" : "rgba(255,255,255,.09)";
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(xTop, horizonY);
          context.lineTo(xBottom, hitY + 60);
          context.stroke();
        }

        // Highway Guitar Strings (5 metallic wire strings down each lane)
        for (let lane = 0; lane < 5; lane += 1) {
          const stringTopX = hCenterX + (lane - 2) * (hTopWidth / 5);
          const stringBotX = hCenterX + (lane - 2) * (hBottomWidth / 5);
          context.beginPath();
          context.moveTo(stringTopX, horizonY);
          context.lineTo(stringBotX, hitY + 25);
          context.strokeStyle = "rgba(215, 215, 235, 0.42)";
          context.lineWidth = lane <= 1 ? 2.0 : 1.3;
          context.stroke();
        }

        // Draw Notes & Sustain Ribbons
        for (const note of chart.notes) {
          const status = isPlayer1
            ? statusesRef.current[note.id]
            : note.time < now - 0.08
              ? 1
              : 0;
          const hold = isPlayer1 ? activeHoldsRef.current.get(note.id) : undefined;

          if (status === 1 && !hold) continue;
          if (note.time + note.duration < now - 0.3) continue;
          if (note.time > now + travel) break;

          // 1. Sustain Ribbon
          if (note.duration > 0.08) {
            let yBottom: number;
            let yTop: number;
            const isActivelyHeld = Boolean(hold && hold.isHolding);

            if (hold) {
              if (isActivelyHeld) {
                yBottom = hitY;
                yTop = yAt(note.time + note.duration);
              } else {
                yBottom = yAt(Math.min(note.time + note.duration, hold.releasedTime ?? now));
                yTop = yAt(note.time + note.duration);
              }
            } else if (status === 0) {
              yBottom = yAt(note.time);
              yTop = yAt(note.time + note.duration);
            } else {
              yBottom = yAt(note.time);
              yTop = yAt(note.time + note.duration);
            }

            if (yBottom >= horizonY - 10 && yTop <= hitY + 60 && yBottom > yTop) {
              const clampedTop = Math.max(horizonY, yTop);
              const clampedBottom = Math.min(hitY + 40, yBottom);

              note.lanes.filter((lane) => lane >= 0).forEach((lane) => {
                const baseColor = note.overdrive ? "#00f0ff" : colors[lane];
                const steps = 12;
                const yStep = (clampedBottom - clampedTop) / steps;

                context.save();
                context.beginPath();
                for (let i = 0; i <= steps; i += 1) {
                  const curY = clampedTop + i * yStep;
                  const rWidth = Math.max(4, 5 + ((curY - horizonY) / (hitY - horizonY)) * (isSideBySide ? 8 : 12));
                  const wobble = isActivelyHeld && hold
                    ? Math.sin(curY * 0.09 + timestamp * 0.02) * (hold.whammyAmount > 0.2 ? 5.5 : 2)
                    : 0;
                  const cx = laneXLocal(lane, curY) + wobble;
                  if (i === 0) context.moveTo(cx - rWidth * 0.5, curY);
                  else context.lineTo(cx - rWidth * 0.5, curY);
                }

                for (let i = steps; i >= 0; i -= 1) {
                  const curY = clampedTop + i * yStep;
                  const rWidth = Math.max(4, 5 + ((curY - horizonY) / (hitY - horizonY)) * (isSideBySide ? 8 : 12));
                  const wobble = isActivelyHeld && hold
                    ? Math.sin(curY * 0.09 + timestamp * 0.02) * (hold.whammyAmount > 0.2 ? 5.5 : 2)
                    : 0;
                  const cx = laneXLocal(lane, curY) + wobble;
                  context.lineTo(cx + rWidth * 0.5, curY);
                }
                context.closePath();

                if (status === 2 || (status === 1 && !isActivelyHeld)) {
                  context.fillStyle = "rgba(65, 45, 55, 0.4)";
                } else if (isActivelyHeld) {
                  const ribbonGrad = context.createLinearGradient(0, clampedTop, 0, clampedBottom);
                  ribbonGrad.addColorStop(0, `${baseColor}99`);
                  ribbonGrad.addColorStop(0.8, `${baseColor}dd`);
                  ribbonGrad.addColorStop(1, "#ffffff");
                  context.fillStyle = ribbonGrad;
                } else {
                  context.fillStyle = `${baseColor}aa`;
                }
                context.fill();
                context.restore();
              });
            }
          }

          // 2. Note Head (Solid 3D Guitar Hero Gem)
          if (status === 0 || (status === 2 && yAt(note.time) <= hitY + 30)) {
            const y = yAt(note.time);
            if (y >= horizonY - 8 && y <= hitY + 45) {
              const noteSize = Math.max(6, (isSideBySide ? 8 : 10) + ((y - horizonY) / (hitY - horizonY)) * (isSideBySide ? 12 : 16));

              if (note.lanes.includes(-1)) {
                drawOpenNoteBar(context, hCenterX, y, hTopWidth, hBottomWidth, horizonY, hitY, note.overdrive);
              }

              note.lanes.filter((lane) => lane >= 0).forEach((lane) => {
                const x = laneXLocal(lane, y);
                drawCustomNoteGem(context, x, y, lane, noteSize, status, timestamp, note.overdrive, isSideBySide);
              });
            }
          }
        }

        context.restore(); // end board clip

        // Side Rails
        const leftTop = hCenterX - hTopWidth / 2;
        const leftBottom = hCenterX - hBottomWidth / 2;
        const rightTop = hCenterX + hTopWidth / 2;
        const rightBottom = hCenterX + hBottomWidth / 2;

        context.strokeStyle = playerOverdrive ? "rgba(0, 240, 255, 0.7)" : "rgba(160, 160, 180, 0.4)";
        context.lineWidth = isSideBySide ? 2.5 : 3;
        context.beginPath();
        context.moveTo(leftTop, horizonY);
        context.lineTo(leftBottom, hitY + 50);
        context.moveTo(rightTop, horizonY);
        context.lineTo(rightBottom, hitY + 50);
        context.stroke();

        // Target Receptors
        const fretRadius = Math.min((hBottomWidth / 5) * 0.36, isSideBySide ? 20 : 26);
        const labelList = gamepadName ? ["LT", "LB", "RB", "RT", "A"] : customKeyLabels;

        for (let lane = 0; lane < 5; lane += 1) {
          const x = laneXLocal(lane, hitY);
          const flash = isPlayer1 ? flashRef.current.find((item) => item.lane === lane) : undefined;
          const held = isPlayer1 ? pressedRef.current.has(lane) : false;
          const baseColor = colors[lane];

          // Check if remote opponent is striking this lane right now
          const opponentHitNow = !isPlayer1 && chart.notes.some(
            (n) => n.lanes.includes(lane) && Math.abs(n.time - now) < 0.08
          );

          let activeHoldOnLane = false;
          if (isPlayer1) {
            for (const hold of activeHoldsRef.current.values()) {
              if (hold.isHolding && hold.note.lanes.includes(lane)) {
                activeHoldOnLane = true;
                break;
              }
            }
          }

          drawReceptorSprite(
            context,
            x,
            hitY,
            lane,
            fretRadius,
            held || opponentHitNow,
            activeHoldOnLane,
            Boolean(flash?.hit),
            labelList[lane] || "",
            baseColor,
            isSideBySide
          );
        }

        // Hit guide line
        context.strokeStyle = playerOverdrive ? "rgba(0, 240, 255, 0.5)" : "rgba(255, 255, 255, 0.35)";
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(hCenterX - hBottomWidth / 2, hitY + 16);
        context.lineTo(hCenterX + hBottomWidth / 2, hitY + 16);
        context.stroke();

        // Player Highway Nametag Pill
        context.save();
        context.font = `900 11px var(--mono, monospace)`;
        context.textAlign = "center";
        const tagY = horizonY - 14;
        const tagText = pName.toUpperCase();
        const tagWidth = context.measureText(tagText).width + 24;

        context.fillStyle = isPlayer1 ? "rgba(216, 255, 63, 0.15)" : "rgba(0, 240, 255, 0.15)";
        context.strokeStyle = isPlayer1 ? "#d8ff3f" : "#00f0ff";
        context.lineWidth = 1;
        roundedRect(context, hCenterX - tagWidth / 2, tagY - 14, tagWidth, 20, 6);
        context.fill();
        context.stroke();

        context.fillStyle = "#ffffff";
        context.fillText(tagText, hCenterX, tagY);
        context.restore();
      };

      // Render Player 1 Highway
      const p1Name = profile?.username ? `@${profile.username}` : user?.displayName || "You";
      renderHighwaySurface(p1CenterX, p1TopWidth, p1BottomWidth, true, pulseActive, `${p1Name} (P1)`);

      // Render Player 2 Highway (If in Side-by-Side Multiplayer)
      if (isSideBySide && remotePlayer) {
        const p2Overdrive = false;
        const p2Name = remotePlayer.displayName || "Opponent";
        renderHighwaySurface(p2CenterX, p2TopWidth, p2BottomWidth, false, p2Overdrive, `${p2Name} (P2)`);

        // RENDER CENTER BATTLE TUG-OF-WAR BAR & SCORE DIFFERENCE
        const battleCenterX = width / 2;
        const p1Score = statsRef.current.score;
        const p2Score = remotePlayer.liveScore || 0;
        const diff = p1Score - p2Score;

        context.save();
        // Central Battle Badge
        context.font = "900 13px var(--mono, monospace)";
        context.textAlign = "center";
        context.fillStyle = "rgba(18, 18, 28, 0.85)";
        context.strokeStyle = "rgba(255, 255, 255, 0.15)";
        context.lineWidth = 1;
        roundedRect(context, battleCenterX - 75, horizonY + 20, 150, 64, 10);
        context.fill();
        context.stroke();

        context.fillStyle = "#8c899c";
        context.font = "900 9px var(--mono, monospace)";
        context.fillText("⚔️ FACE-OFF DUEL", battleCenterX, horizonY + 36);

        // Score Delta (Ahead/Behind)
        context.font = "900 13px var(--mono, monospace)";
        if (diff > 0) {
          context.fillStyle = "#d8ff3f";
          context.fillText(`+${diff.toLocaleString("id-ID")}`, battleCenterX, horizonY + 54);
          context.font = "800 8px var(--mono, monospace)";
          context.fillStyle = "#88aa20";
          context.fillText("AHEAD", battleCenterX, horizonY + 68);
        } else if (diff < 0) {
          context.fillStyle = "#ff3b69";
          context.fillText(`${diff.toLocaleString("id-ID")}`, battleCenterX, horizonY + 54);
          context.font = "800 8px var(--mono, monospace)";
          context.fillStyle = "#aa2040";
          context.fillText("BEHIND", battleCenterX, horizonY + 68);
        } else {
          context.fillStyle = "#ffffff";
          context.fillText("TIED", battleCenterX, horizonY + 56);
        }
        context.restore();
      }

      // 1. RENDER GUITAR HERO RECEPTOR FLAMES (Rising out of Lubang target rings)
      flamesRef.current = flamesRef.current.filter((flame) => {
        flame.life -= dt / flame.maxLife;
        if (flame.life <= 0) return false;
        context.save();
        const progress = 1 - flame.life;
        const h = flame.height * (1 + 0.25 * Math.sin(progress * Math.PI));
        const w = flame.size * flame.life;

        for (let t = -1; t <= 1; t++) {
          const fx = flame.x + t * (w * 0.38);
          const fy = flame.y;
          const tongueH = h * (t === 0 ? 1 : 0.72) * (0.85 + 0.3 * Math.random());

          const flameGrad = context.createLinearGradient(fx, fy, fx, fy - tongueH);
          flameGrad.addColorStop(0, "#ffffff");
          flameGrad.addColorStop(0.2, "#ffe066");
          flameGrad.addColorStop(0.5, "#ff6600");
          flameGrad.addColorStop(0.85, `${flame.color}99`);
          flameGrad.addColorStop(1, "transparent");

          context.fillStyle = flameGrad;
          context.globalAlpha = Math.min(1, flame.life * 1.5);
          context.beginPath();
          context.moveTo(fx - w * 0.32, fy);
          context.quadraticCurveTo(fx - w * 0.1, fy - tongueH * 0.6, fx, fy - tongueH);
          context.quadraticCurveTo(fx + w * 0.1, fy - tongueH * 0.6, fx + w * 0.32, fy);
          context.closePath();
          context.fill();
        }
        context.restore();
        return true;
      });

      // 2. RENDER EXPANDING HIT SHOCKWAVES
      shockwavesRef.current = shockwavesRef.current.filter((sw) => {
        sw.life -= dt / sw.maxLife;
        if (sw.life <= 0) return false;
        const progress = 1 - sw.life;
        const currentR = sw.radius + (sw.maxRadius - sw.radius) * progress;
        context.save();
        context.globalAlpha = Math.max(0, sw.life * 0.9);
        context.strokeStyle = sw.color;
        context.lineWidth = 3.5 * sw.life;
        context.beginPath();
        context.arc(sw.x, sw.y, currentR, 0, Math.PI * 2);
        context.stroke();
        context.restore();
        return true;
      });

      // 4. RENDER PHYSICS SPARKS & FIERY EMBERS
      sparksRef.current = sparksRef.current.filter((spark) => {
        spark.life -= dt / spark.maxLife;
        if (spark.life <= 0) return false;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 190 * dt; // Gravity
        context.save();
        context.globalAlpha = Math.max(0, Math.min(1, spark.life));
        context.fillStyle = spark.color;
        context.beginPath();
        context.arc(spark.x, spark.y, spark.size * spark.life, 0, Math.PI * 2);
        context.fill();
        if (spark.size > 3.5 && spark.life > 0.4) {
          context.fillStyle = "#ffffff";
          context.beginPath();
          context.arc(spark.x, spark.y, spark.size * spark.life * 0.45, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
        return true;
      });

      // 5. RENDER FLOATING RHYTHM JUDGEMENTS WITH SPRING SCALING
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => {
        ft.life -= dt / ft.maxLife;
        if (ft.life <= 0) return false;
        ft.y += ft.vy * dt;
        context.save();

        const springScale = ft.scale * (1 + 0.35 * Math.sin((1 - ft.life) * Math.PI));
        const fontSize = Math.round(22 * springScale);
        context.font = `950 ${fontSize}px var(--mono, monospace)`;
        context.textAlign = "center";
        context.textBaseline = "middle";

        context.shadowColor = ft.color;
        context.shadowBlur = 16;
        context.strokeStyle = "#000000";
        context.lineWidth = 4;
        context.strokeText(ft.text, ft.x, ft.y);
        context.fillStyle = ft.color;
        context.fillText(ft.text, ft.x, ft.y);

        if (ft.subtext) {
          context.font = `900 ${Math.max(10, fontSize * 0.45)}px var(--mono, monospace)`;
          context.fillStyle = "#d8ff3f";
          context.fillText(ft.subtext, ft.x, ft.y + fontSize * 0.65);
        }
        context.restore();
        return true;
      });

      // Miss judgements and tracking
      if (phaseRef.current === "playing") {
        for (const note of chart.notes) {
          if (statusesRef.current[note.id] !== 0) continue;
          if (note.time >= now - 0.155) break;
          statusesRef.current[note.id] = 2;

          if (note.overdrive) {
            const phrase = notePhraseMap.get(note.id);
            if (phrase && !phrase.failed && !phrase.completed) {
              phrase.failed = true;
              floatingTextsRef.current.push({
                text: "PHRASE MISSED",
                x: p1CenterX,
                y: hitY - 45,
                vy: -55,
                life: 1,
                maxLife: 0.65,
                color: "#ff7788",
                scale: 1.15,
              });
            }
          }

          const current = statsRef.current;
          const next: Stats = {
            ...current,
            combo: 0,
            misses: current.misses + 1,
            feedback: "MISS",
            baseMultiplier: 1,
            effectiveMultiplier: pulseActive ? 2 : 1,
            multiplierProgress: 0,
            isStarPower: pulseActive,
          };
          statsRef.current = next;
          flashRef.current.push(...note.lanes.map((lane) => ({ lane, until: timestamp + 180, hit: false })));
          if (multiplayerRoom?.id && user) {
            void broadcastLiveStats(multiplayerRoom.id, user.uid, next.score, next.combo, false);
          }

          const missLane = note.lanes.find((l) => l >= 0) ?? 2;
          const missX = p1CenterX + (missLane - 2) * (p1BottomWidth / 5);

          floatingTextsRef.current.push({
            text: "MISS",
            x: missX,
            y: hitY - 28,
            vy: -55,
            life: 1,
            maxLife: 0.55,
            color: "#ff4c67",
            scale: 1.1,
          });
        }
      }

      if (timestamp - lastHudUpdateRef.current > 75) {
        lastHudUpdateRef.current = timestamp;
        const primary = audioRef.current[0];
        const rawTime = primary?.currentTime ?? 0;
        setElapsed(rawTime);
        setProgress(duration ? Math.min(100, (rawTime / duration) * 100) : 0);
        const currentSection = [...chart.sections].reverse().find((marker) => marker.time <= now);
        if (currentSection) setSection(currentSection.name);

        const currentMult = getMultiplierData(statsRef.current.combo, pulseActive);
        setStats({
          ...statsRef.current,
          baseMultiplier: currentMult.baseMultiplier,
          effectiveMultiplier: currentMult.effectiveMultiplier,
          multiplierProgress: currentMult.progress,
          isStarPower: pulseActive,
        });

        if (lyrics.length > 0) {
          const lyricData = getActiveLyric(lyrics, now, lyricOffsetMs / 1000);
          setCurrentLyricText(lyricData.current?.text ?? "");
          setNextLyricText(lyricData.next?.text ?? "");
          setLyricProgress(lyricData.lineProgress);
          setActiveLyricIndex(lyricData.activeIndex);
          setUpcomingLyrics(lyricData.upcomingLines);
        }

        // Broadcast multiplayer live score
        if (multiplayerRoom?.id && user) {
          void broadcastLiveStats(multiplayerRoom.id, user.uid, statsRef.current.score, statsRef.current.combo);
        }

        audioRef.current.slice(1).forEach((audio) => {
          if (primary && Math.abs(audio.currentTime - primary.currentTime) > 0.09) audio.currentTime = primary.currentTime;
        });
      }

      const primary = audioRef.current[0];
      if ((primary?.ended || (duration > 0 && now > duration + 0.5)) && phaseRef.current === "playing") {
        audioRef.current.forEach((audio) => audio.pause());
        phaseRef.current = "finished";
        setPhase("finished");
        const finalStats = { ...statsRef.current };
        setStats(finalStats);

        const judged = finalStats.hits + finalStats.misses;
        const finalAcc = judged ? (finalStats.hits / judged) * 100 : 100;

        if (user) {
          const songKey = getSongKey(song.metadata.artist, song.metadata.title);
          void submitScore(songKey, user, {
            score: finalStats.score,
            accuracy: finalAcc,
            maxCombo: finalStats.maxCombo,
            difficulty: chart.difficulty,
            instrument: chart.instrument,
            songTitle: song.metadata.title,
            songArtist: song.metadata.artist,
          });

          if (multiplayerRoom?.id) {
            void broadcastLiveStats(multiplayerRoom.id, user.uid, finalStats.score, finalStats.combo, true, finalAcc);
          }
        }
      }
    } catch (err) {
      console.error("GameStage render error:", err);
    } finally {
      frame = requestAnimationFrame(draw);
    }
  };

  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
}, [chart.difficulty, chart.instrument, chart.notes, chart.sections, customKeyLabels, duration, gamepadName, lyrics, multiplayerRoom?.id, notePhraseMap, pollGamepad, profile?.username, remotePlayer, room, song.metadata.artist, song.metadata.title, songTime, speed, user]);

  const touchLane = (lane: number, pressed: boolean) => {
    if (pressed) {
      pressedRef.current.add(lane);
      attemptTap(lane);
    } else {
      if (!gamepadHeldLanesRef.current.has(lane)) {
        pressedRef.current.delete(lane);
      }
    }
  };

  const accuracy = useMemo(() => {
    const judged = stats.hits + stats.misses;
    return judged ? (stats.hits / judged) * 100 : 100;
  }, [stats.hits, stats.misses]);

  return (
    <main className="game-stage">
      {/* SMART YOUTUBE MUSIC VIDEO BACKGROUND */}
      <YouTubeVideoBackground
        videoId={videoId}
        offsetMs={videoOffsetMs}
        phase={phase}
        songTime={songTime()}
        speed={speed}
        dimPercent={videoDimPercent}
        enabled={videoEnabled}
      />

      <canvas ref={canvasRef} className="game-canvas" aria-label="Five lane rhythm game highway" />

      <header className="game-topbar">
        <button className="game-quiet-button" type="button" onClick={pause} aria-label="Pause game">
          {phase === "paused" ? "RESUME" : "PAUSE"}
        </button>
        <div className="game-track-copy">
          <span>{song.metadata.artist}</span>
          <strong>{song.metadata.title}</strong>
        </div>
        <div className="game-topbar-right">
          {/* MUSIC VIDEO TOGGLE & SETTINGS BUTTON */}
          <button
            className={`game-quiet-button video-toggle ${videoId && videoEnabled ? "video-active" : ""}`}
            type="button"
            onClick={() => setShowVideoModal(true)}
            title="Pengaturan Music Video YouTube Background"
          >
            <span className="mv-icon">🎬</span>
            <span className="video-btn-text">
              {loadingVideo
                ? "MEMUAT MV…"
                : videoId
                ? (videoEnabled ? "MV AKTIF" : "MV OFF")
                : "CARI MV ＋"}
            </span>
            <span className="sync-cog">⚙️</span>
          </button>

          <button
            className={`game-quiet-button lyrics-toggle ${lyrics.length > 0 && lyricDisplayMode !== "off" ? "lyrics-active" : ""}`}
            type="button"
            onClick={() => setShowLyricSyncModal(true)}
            title="Buka Pengaturan & Sinkronisasi Lirik Karaoke"
          >
            <span className="mic-icon">🎤</span>
            <span className="lyrics-btn-text">
              {lyrics.length > 0
                ? (lyricOffsetMs !== 0 ? `LIRIK (${lyricOffsetMs > 0 ? "+" : ""}${lyricOffsetMs}ms)` : "LIRIK AKTIF")
                : "SINGKRON LIRIK ＋"}
            </span>
            <span className="sync-cog">⚙️ SYNC</span>
          </button>
          {gamepadName && (
            <div className="gamepad-badge" title="Gamepad connected">
              <span className="gamepad-icon">🎮</span>
              <span className="gamepad-text">{gamepadName}</span>
            </div>
          )}
          <div className="game-time">
            <span>{formatTime(elapsed)}</span>
            <i />
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </header>

      <div className="game-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>

      {/* MULTIPLAYER LIVE RACING LEADERBOARD HUD (RACING POSITION BATTLE) */}
      {room && Object.keys(room.players || {}).length > 1 && (
        <div className="mp-racing-hud" aria-label="Live Multiplayer Duel Racing Leaderboard">
          {(() => {
            const myScore = stats.score;
            const oppScore = remotePlayer?.liveScore || 0;
            const myCombo = stats.combo;
            const oppCombo = remotePlayer?.liveCombo || 0;
            const diff = myScore - oppScore;
            const isAhead = diff >= 0;
            const total = myScore + oppScore;
            const p1Ratio = total > 0 ? Math.min(85, Math.max(15, Math.round((myScore / total) * 100))) : 50;
            const myName = profile?.username ? `@${profile.username}` : user?.displayName || "You";
            const oppName = remotePlayer?.displayName || "Opponent";

            return (
              <div className="racing-hud-container">
                {/* Racer 1 (You) */}
                <div className={`racing-racer-card p1 ${isAhead ? "is-p1-leading" : "is-chasing"}`}>
                  <div className="racer-rank-badge">
                    <span className="rank-label">{isAhead ? "1ST" : "2ND"}</span>
                    <span className="rank-flag">{isAhead ? "🏁" : "🏎️"}</span>
                  </div>
                  <div className="racer-details">
                    <span className="racer-name-tag">{myName} <b>(YOU)</b></span>
                    <strong className="racer-score-num">{myScore.toLocaleString("id-ID")}</strong>
                  </div>
                  <div className="racer-streak-tag">
                    <span className="streak-fire">🔥</span>
                    <b>{myCombo}x</b>
                  </div>
                </div>

                {/* Central Racing Gap & Live Tug-of-War Bar */}
                <div className="racing-versus-center">
                  <div className={`racing-delta-badge ${isAhead ? "ahead" : "behind"}`}>
                    <span className="delta-sub">{diff === 0 ? "TIED" : isAhead ? "AHEAD" : "BEHIND"}</span>
                    <strong className="delta-val">
                      {diff === 0 ? "0 PTS" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("id-ID")} PTS`}
                    </strong>
                  </div>

                  {/* Dual Speedometer Progress Bar */}
                  <div className="racing-tug-track" title="Tug of War Dominance Bar">
                    <div className="racing-tug-fill p1" style={{ width: `${p1Ratio}%` }} />
                    <div className="racing-tug-fill p2" style={{ width: `${100 - p1Ratio}%` }} />
                    <div className="racing-tug-car" style={{ left: `calc(${p1Ratio}% - 10px)` }}>
                      ⚡
                    </div>
                  </div>
                </div>

                {/* Racer 2 (Opponent) */}
                <div className={`racing-racer-card p2 ${!isAhead ? "is-p2-leading" : "is-chasing"}`}>
                  <div className="racer-streak-tag p2">
                    <span className="streak-fire">🔥</span>
                    <b>{oppCombo}x</b>
                  </div>
                  <div className="racer-details align-right">
                    <span className="racer-name-tag">{oppName}</span>
                    <strong className="racer-score-num">{oppScore.toLocaleString("id-ID")}</strong>
                  </div>
                  <div className="racer-rank-badge p2">
                    <span className="rank-label">{!isAhead ? "1ST" : "2ND"}</span>
                    <span className="rank-flag">{!isAhead ? "🏁" : "🏎️"}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* KARAOKE FLOATING CENTER-STAGE HUD */}
      {phase === "playing" && lyricDisplayMode === "karaoke" && (currentLyricText || nextLyricText) && (
        <div className="karaoke-lyrics-bar" aria-label="Synchronized Song Lyrics">
          {currentLyricText && (
            <div className="karaoke-current-wrap" onClick={() => setShowLyricSyncModal(true)} title="Klik untuk kalibrasi offset lirik">
              <span className="karaoke-current-line">{currentLyricText}</span>
              <div className="karaoke-progress-bar">
                <span style={{ width: `${Math.round(lyricProgress * 100)}%` }} />
              </div>
            </div>
          )}
          {nextLyricText && <span className="karaoke-next-line">{nextLyricText}</span>}
        </div>
      )}

      {/* TELEPROMPTER SIDEBAR MODE */}
      {lyricDisplayMode === "teleprompter" && lyrics.length > 0 && (
        <aside className="lyric-teleprompter-panel" aria-label="Karaoke Teleprompter">
          <div className="teleprompter-header">
            <span>📜 TELEPROMPTER LIRIK</span>
            <button type="button" onClick={() => setLyricDisplayMode("karaoke")} title="Beralih ke HUD floating">HUD ↗</button>
          </div>
          <div className="teleprompter-lines">
            {lyrics.map((line, idx) => {
              const isActive = idx === activeLyricIndex;
              const isPast = idx < activeLyricIndex;
              return (
                <div
                  key={idx}
                  className={`teleprompter-line ${isActive ? "is-active" : isPast ? "is-past" : "is-future"}`}
                >
                  <span className="line-ts">{formatTime(line.time)}</span>
                  <p className="line-txt">{line.text}</p>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* LEFT SIDE HUD: SCORE & ACCURACY */}
      <section className="game-hud-left" aria-label="Game score and accuracy">
        <div className="score-stack">
          <span>SCORE</span>
          <strong>{stats.score.toString().padStart(7, "0")}</strong>
        </div>
        <div className="accuracy-stack">
          <span>SYNC</span>
          <strong>{accuracy.toFixed(1)}%</strong>
        </div>
        <div className="section-badge">
          <span>SECTION</span>
          <b>{section || "MAIN"}</b>
        </div>
      </section>

      {/* RIGHT SIDE HUD: MULTIPLIER ORB + COMBO STREAK + STAR POWER METER */}
      <section className="game-hud-right" aria-label="Combo multiplier and overdrive meter">
        <div className="combo-stack">
          <div className={`multiplier-gauge mult-${stats.effectiveMultiplier}x ${stats.isStarPower ? "overdrive-active" : ""}`}>
            <svg className="multiplier-svg" viewBox="0 0 88 88" aria-hidden="true">
              <circle className="mult-bg" cx="44" cy="44" r="38" />
              <circle
                className="mult-progress"
                cx="44"
                cy="44"
                r="38"
                strokeDasharray="238.76"
                strokeDashoffset={238.76 * (1 - (stats.baseMultiplier === 4 ? 1 : stats.multiplierProgress))}
              />
            </svg>
            <div className="multiplier-center">
              <div className="multiplier-num-row">
                <strong className="mult-num">{stats.effectiveMultiplier}</strong>
                <span className="mult-x">×</span>
              </div>
              <small className="mult-badge-label">
                {stats.isStarPower ? "OVERDRIVE" : stats.baseMultiplier === 4 ? "MAX" : "COMBO"}
              </small>
            </div>
          </div>

          <div className="streak-badge">
            <strong className="streak-num">{stats.combo}</strong>
            <span className="streak-label">STREAK</span>
          </div>
          <em className="feedback-pill">{stats.feedback}</em>
        </div>

        {/* GUITAR HERO STAR POWER / OVERDRIVE METER */}
        <button
          className={`pulse-meter ${stats.energy >= 50 ? "star-ready" : ""} ${stats.isStarPower ? "star-active" : ""}`}
          type="button"
          onClick={activatePulse}
          disabled={stats.energy < 50 || phase !== "playing" || stats.isStarPower}
          aria-label={`Star Power energy ${Math.round(stats.energy)} percent`}
        >
          <span className="pulse-meter-fill" style={{ height: `${stats.energy}%` }} />
          <div className="pulse-threshold-line" title="50% Activation Threshold" />
          <div className="pulse-meter-text">
            <b>{stats.isStarPower ? "ACTIVE" : stats.energy >= 50 ? "READY!" : "STAR"}</b>
            <small>{stats.isStarPower ? "8× OVERDRIVE" : stats.energy >= 50 ? "POWER" : `${Math.round(stats.energy)}%`}</small>
          </div>
        </button>
      </section>

      <div className="touch-frets" aria-label="Touch fret controls">
        {colors.map((color, lane) => (
          <button
            key={color}
            type="button"
            style={{ "--lane-color": color } as React.CSSProperties}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); touchLane(lane, true); }}
            onPointerUp={() => touchLane(lane, false)}
            onPointerCancel={() => touchLane(lane, false)}
          >
            {laneLabels[lane]}
          </button>
        ))}
        {inputMode === "strum" && <button type="button" className="touch-strum" onPointerDown={attemptStrum}>STRUM</button>}
      </div>

      {/* SYNCHRONIZED MULTIPLAYER COUNTDOWN OVERLAY */}
      {room && multiplayerCountdown !== null && multiplayerCountdown > 0 && (
        <div className="game-overlay mp-sync-countdown-overlay">
          <div className="overlay-kicker">SYNCHRONIZED ARENA · {room.id}</div>
          <div className="mp-sync-countdown-num">{multiplayerCountdown}</div>
          <div className="mp-sync-countdown-sub">MEMULAI PERTANDINGAN BERSAMA…</div>
          <div className="mp-sync-players-status">
            {Object.values(room.players).map((p) => (
              <span key={p.uid} className={`mp-sync-player-pill ${p.loaded ? "is-ready" : ""}`}>
                {p.displayName}: {p.loaded ? "SIAP ✓" : "BUFFERING…"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SYNCHRONIZED MULTIPLAYER LOADING OVERLAY */}
      {room && (room.status === "loading" || (phase === "ready" && !room.startTime)) && multiplayerCountdown === null && (
        <div className="game-overlay mp-sync-loading-overlay">
          <div className="overlay-kicker">ARENA MULTIPLAYER · {room.id}</div>
          <div className="spinner-orbit" style={{ width: 44, height: 44 }} />
          <h2>MENYINKRONKAN AUDIO & PARTITUR…</h2>
          <p>Menunggu semua pemain selesai memuat chart sebelum countdown 5 detik dimulai.</p>
          <div className="mp-sync-players-status">
            {Object.values(room.players).map((p) => (
              <span key={p.uid} className={`mp-sync-player-pill ${p.loaded ? "is-ready" : ""}`}>
                {p.displayName}: {p.loaded ? "SIAP ✓" : "MEMUAT AUDIO…"}
              </span>
            ))}
          </div>
          {isHost && (
            <button
              type="button"
              className="mp-sync-skip-btn"
              onClick={() => void forceStartCountdown(room.id)}
            >
              MULAI SEKARANG (LEWATI TUNGGU) ⚡
            </button>
          )}
        </div>
      )}

      {/* SINGLE PLAYER READY OVERLAY */}
      {!room && phase === "ready" && (
        <div className="game-overlay">
          <div className="overlay-kicker">STAGE ARMED</div>
          <h1>{chart.label}<br /><span>{chart.difficulty}</span></h1>
          <p>{inputMode === "tap" ? "Tekan tombol fret yang sudah kamu atur (atau Gamepad LT/LB/RB/RT/A) saat not menyentuh garis." : "Tahan fret, lalu strum dengan Space / D-Pad / Guitar Strum."}</p>
          <div className="overlay-controls-guide">
            <div className="guide-row">
              <span>KEYBOARD AKTIF:</span> <b>[{customKeyLabels[0]}] [{customKeyLabels[1]}] [{customKeyLabels[2]}] [{customKeyLabels[3]}] [{customKeyLabels[4]}]</b> · <b>Space</b> / <b>Shift</b> Pulse
            </div>
            <div className="guide-row">
              <span>GAMEPAD:</span> <b>LT</b>(🟢) <b>LB</b>(🔴) <b>RB</b>(🟡) <b>RT</b>(🔵) <b>A</b>(🟠) · <b>Select</b> Pulse · <b>Start</b> Pause
            </div>
            <div className="guide-row">
              <span>GUITAR HERO:</span> 🟢 🔴 🟡 🔵 🟠 + <b>Strum Up/Down</b> · <b>Whammy</b> · <b>Star Power</b>
            </div>
          </div>
          <button className="launch-button" type="button" onClick={() => launch(0)}>LAUNCH TRACK <span>↗</span></button>
          <button className="text-button" type="button" onClick={onExit}>Kembali ke soundcheck</button>
        </div>
      )}

      {phase === "paused" && (
        <div className="game-overlay pause-overlay">
          <div className="overlay-kicker">SIGNAL HELD</div>
          <h1>PAUSED<span>.</span></h1>
          <div className="overlay-actions">
            <button className="launch-button" type="button" onClick={pause}>RESUME <span>▶</span></button>
            <button className="text-button" type="button" onClick={() => launch(0)}>Restart track</button>
            <button className="text-button" type="button" onClick={onExit}>Exit to soundcheck</button>
          </div>
        </div>
      )}

      {/* MULTIPLAYER LIVE OPPONENTS DECK */}
      {room && (
        <aside className="mp-live-deck" aria-label="Multiplayer live opponents">
          <div className="mp-deck-header">
            <span>ARENA: {room.id}</span>
            <b>{room.mode.toUpperCase()}</b>
          </div>
          <div className="mp-opponents-list">
            {Object.values(room.players).map((p) => (
              <div key={p.uid} className={`mp-live-player ${p.uid === user?.uid ? "is-me" : ""}`}>
                <div className="live-avatar-wrap">
                  {p.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photoURL} alt={p.displayName} className="live-avatar" />
                  ) : (
                    <span className="live-avatar-fallback">{p.displayName.charAt(0)}</span>
                  )}
                </div>
                <div className="live-player-info">
                  <div className="live-name-row">
                    <strong>{p.displayName} {p.uid === user?.uid && "(You)"}</strong>
                    <span className="live-inst-tag">{p.instrument.toUpperCase()}</span>
                  </div>
                  <div className="live-score-row">
                    <b>{p.liveScore.toLocaleString("id-ID")}</b>
                    <small>{p.liveCombo}× streak</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {phase === "finished" && (
        <div className="game-overlay result-overlay">
          {room ? (
            <div className="mp-podium-wrap">
              <div className="overlay-kicker">MULTIPLAYER MATCH COMPLETE</div>
              <h2>MATCH RESULTS · {room.id}</h2>
              <div className="podium-list">
                {Object.values(room.players)
                  .sort((a, b) => b.liveScore - a.liveScore)
                  .map((p, idx) => (
                    <div key={p.uid} className={`podium-card rank-${idx + 1} ${p.uid === user?.uid ? "is-me" : ""}`}>
                      <div className="podium-rank">{`#${idx + 1}`}</div>
                      <div className="podium-player">
                        <strong>{p.displayName} {p.uid === user?.uid && "(You)"}</strong>
                        <span className="inst-pill">{p.instrument.toUpperCase()}</span>
                      </div>
                      <div className="podium-score">
                        <strong>{p.liveScore.toLocaleString("id-ID")} PTS</strong>
                        {p.finalAccuracy !== undefined && <small>{p.finalAccuracy.toFixed(1)}% SYNC</small>}
                      </div>
                    </div>
                  ))}
              </div>
              <div className="overlay-actions result-actions">
                <button className="launch-button" type="button" onClick={onExit}>EXIT TO LOBBY <span>↗</span></button>
              </div>
            </div>
          ) : (
            <>
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
                  <button className="launch-button" type="button" onClick={() => launch()}>PLAY AGAIN <span>↻</span></button>
                  <button className="text-button" type="button" onClick={onExit}>Choose another chart</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {/* LYRIC SYNC & CALIBRATION MODAL */}
      {showLyricSyncModal && (
        <div className="game-overlay lyric-sync-overlay" role="dialog" aria-modal="true">
          <div className="lyric-sync-card">
            <div className="lyric-sync-top">
              <div className="lyric-sync-title">
                <div>
                  <h3>Sinkronisasi Lirik Karaoke</h3>
                  <small>{song.metadata.title} · {song.metadata.artist}</small>
                </div>
              </div>
              <button type="button" className="lyric-modal-close" onClick={() => setShowLyricSyncModal(false)}>✕</button>
            </div>

            <div className="lyric-sync-tabs">
              <button
                type="button"
                className={`lyric-tab-btn ${lyricSyncActiveTab === "calibrate" ? "active" : ""}`}
                onClick={() => setLyricSyncActiveTab("calibrate")}
              >
                Kalibrasi Offset ({lyricOffsetMs > 0 ? "+" : ""}{lyricOffsetMs}ms)
              </button>
              <button
                type="button"
                className={`lyric-tab-btn ${lyricSyncActiveTab === "search" ? "active" : ""}`}
                onClick={() => setLyricSyncActiveTab("search")}
              >
                Cari Online (LRCLIB)
              </button>
              <button
                type="button"
                className={`lyric-tab-btn ${lyricSyncActiveTab === "paste" ? "active" : ""}`}
                onClick={() => setLyricSyncActiveTab("paste")}
              >
                Paste .LRC Manual
              </button>
            </div>

            <div className="lyric-sync-body">
              {lyricSyncActiveTab === "calibrate" && (
                <div className="sync-calibrate-view">
                  <div className="sync-mode-selector">
                    <span>MODE TAMPILAN:</span>
                    <div className="segmented">
                      <button
                        type="button"
                        className={lyricDisplayMode === "karaoke" ? "active" : ""}
                        onClick={() => setLyricDisplayMode("karaoke")}
                      >
                        Floating HUD
                      </button>
                      <button
                        type="button"
                        className={lyricDisplayMode === "teleprompter" ? "active" : ""}
                        onClick={() => setLyricDisplayMode("teleprompter")}
                      >
                        Teleprompter
                      </button>
                      <button
                        type="button"
                        className={lyricDisplayMode === "off" ? "active" : ""}
                        onClick={() => setLyricDisplayMode("off")}
                      >
                        Off
                      </button>
                    </div>
                  </div>

                  <div className="sync-offset-box">
                    <span className="offset-headline">OFFSET SINKRONISASI WAKTU</span>
                    <div className="offset-display">
                      <strong>{lyricOffsetMs > 0 ? `+${lyricOffsetMs}` : lyricOffsetMs} ms</strong>
                      <small>({(lyricOffsetMs / 1000).toFixed(2)} detik)</small>
                    </div>
                    <p className="offset-hint">
                      {lyricOffsetMs < 0
                        ? "Lirik dimajukan (muncul lebih awal daripada audio)."
                        : lyricOffsetMs > 0
                        ? "Lirik ditunda (muncul lebih lambat daripada audio)."
                        : "Offset netral 0ms (standar timestamp LRC)."}
                    </p>

                    <div className="offset-btn-grid">
                      <button type="button" onClick={() => setLyricOffsetMs((prev) => prev - 1000)}>-1.0s</button>
                      <button type="button" onClick={() => setLyricOffsetMs((prev) => prev - 500)}>-500ms</button>
                      <button type="button" onClick={() => setLyricOffsetMs((prev) => prev - 100)}>-100ms</button>
                      <button type="button" onClick={() => setLyricOffsetMs((prev) => prev - 50)}>-50ms</button>
                      <button type="button" className="reset-offset-btn" onClick={() => setLyricOffsetMs(0)}>RESET 0ms</button>
                      <button type="button" onClick={() => setLyricOffsetMs((prev) => prev + 50)}>+50ms</button>
                      <button type="button" onClick={() => setLyricOffsetMs((prev) => prev + 100)}>+100ms</button>
                      <button type="button" onClick={() => setLyricOffsetMs((prev) => prev + 500)}>+500ms</button>
                      <button type="button" onClick={() => setLyricOffsetMs((prev) => prev + 1000)}>+1.0s</button>
                    </div>

                    <div className="offset-slider-wrap">
                      <input
                        type="range"
                        min="-5000"
                        max="5000"
                        step="25"
                        value={lyricOffsetMs}
                        onChange={(e) => setLyricOffsetMs(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Real-time preview */}
                  <div className="sync-live-preview">
                    <span>PREVIEW LIRIK SAAT INI ({formatTime(elapsed)}):</span>
                    <div className="preview-bubble">
                      <strong className="preview-curr">{currentLyricText || "— (Menunggu vokal) —"}</strong>
                      {nextLyricText && <small className="preview-nxt">Selanjutnya: {nextLyricText}</small>}
                    </div>
                  </div>
                </div>
              )}

              {lyricSyncActiveTab === "search" && (
                <div className="sync-search-view">
                  <p>Cari lirik tersinkronisasi (.lrc) dari database global LRCLIB jika lirik otomatis belum pas:</p>
                  <div className="sync-search-row">
                    <input
                      type="text"
                      className="sync-text-input"
                      placeholder="Masukkan judul lagu / artis..."
                      value={lyricSearchQuery}
                      onChange={(e) => setLyricSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleSearchLyrics()}
                    />
                    <button
                      type="button"
                      className="sync-action-btn"
                      onClick={() => void handleSearchLyrics()}
                      disabled={searchingLyrics}
                    >
                      {searchingLyrics ? "Mencari..." : "Cari Lirik ↗"}
                    </button>
                  </div>
                  <small className="sync-note">
                    Database LRCLIB menyediakan lirik sinkron milidetik untuk jutaan lagu internasional & populer.
                  </small>
                </div>
              )}

              {lyricSyncActiveTab === "paste" && (
                <div className="sync-paste-view">
                  <p>Tempel teks lirik berformat LRC timestamp langsung di bawah:</p>
                  <textarea
                    className="sync-lrc-textarea"
                    placeholder={`[00:12.45] First line of song lyrics\n[00:16.80] Second line of song lyrics\n[00:21.10] Third line of song lyrics`}
                    rows={7}
                    value={customLrcInput}
                    onChange={(e) => setCustomLrcInput(e.target.value)}
                  />
                  <div className="sync-paste-footer">
                    <button
                      type="button"
                      className="sync-action-btn"
                      onClick={handleApplyCustomLrc}
                      disabled={!customLrcInput.trim()}
                    >
                      Terapkan Lirik Kustom ↗
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="lyric-sync-footer">
              <span className="lyric-count-tag">
                {lyrics.length > 0 ? `${lyrics.length} baris (${lyricSource.toUpperCase()})` : "Belum ada lirik dimuat"}
              </span>
              <div className="lyric-sync-footer-actions">
                <button
                  type="button"
                  className="global-save-btn"
                  onClick={handleSaveGlobalLyricsInGame}
                  disabled={savingGlobalLyrics || !lyrics.length}
                  title="Simpan lirik dan timing ini ke database Firestore global agar semua pemain lain otomatis memilikinya!"
                >
                  {savingGlobalLyrics ? "Menyimpan Global..." : "Simpan Global"}
                </button>
                <button
                  type="button"
                  className="launch-button sync-done-btn"
                  onClick={() => setShowLyricSyncModal(false)}
                >
                  Selesai <span>✓</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MUSIC VIDEO SETTINGS & CALIBRATION MODAL */}
      {showVideoModal && (
        <VideoSettingsModal
          songTitle={song.metadata.title}
          songArtist={song.metadata.artist}
          currentVideoId={videoId}
          currentVideoTitle={videoTitle}
          videoOffsetMs={videoOffsetMs}
          videoDimPercent={videoDimPercent}
          videoEnabled={videoEnabled}
          onUpdateVideo={(id, offset, dim, enabled, title) => {
            setVideoId(id);
            if (title) setVideoTitle(title);
            setVideoOffsetMs(offset);
            setVideoDimPercent(dim);
            setVideoEnabled(enabled);
          }}
          onClose={() => setShowVideoModal(false)}
        />
      )}
    </main>
  );
}
