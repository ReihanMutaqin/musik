import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import type { Difficulty, Instrument } from "../rhythm/types";
import { db } from "./config";

export type MultiplayerMode = "duel" | "band" | "ffa";

export type RoomPlayer = {
  uid: string;
  displayName: string;
  photoURL: string;
  instrument: Instrument;
  difficulty: Difficulty;
  ready: boolean;
  loaded?: boolean;
  downloadStatus?: "idle" | "downloading" | "ready" | "failed";
  downloadProgress?: number;
  liveScore: number;
  liveCombo: number;
  finished: boolean;
  finalAccuracy?: number;
};

export type MultiplayerRoom = {
  id: string; // e.g. "RIFF-8A9X"
  hostId: string;
  songName: string;
  songArtist: string;
  songMd5?: string;
  mode: MultiplayerMode;
  difficulty: Difficulty; // Global room difficulty set by Host
  status: "lobby" | "loading" | "countdown" | "playing" | "paused" | "resuming" | "finished";
  maxPlayers: number;
  countdownUntil?: number;
  startTime?: number; // Exact UNIX millisecond timestamp when audio starts
  pausedAt?: number; // Audio position in seconds when paused
  pausedBy?: string; // Display name of player who triggered pause
  resumeCountdownUntil?: number; // UNIX timestamp when resuming begins
  players: Record<string, RoomPlayer>;
  createdAt: number;
};

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 4; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `RIFF-${result}`;
}

/**
 * Creates a new multiplayer room in Firestore
 */
export async function createMultiplayerRoom(
  hostUser: User,
  song: { title: string; artist: string; md5?: string },
  mode: MultiplayerMode = "duel",
  initialDifficulty: Difficulty = "expert",
  maxPlayers = 5
): Promise<string> {
  const roomCode = generateRoomCode();
  const roomDocRef = doc(db, "rooms", roomCode);

  const initialPlayer: RoomPlayer = {
    uid: hostUser.uid,
    displayName: hostUser.displayName || "Host Rocker",
    photoURL: hostUser.photoURL || "",
    instrument: "guitar",
    difficulty: initialDifficulty,
    ready: true,
    loaded: false,
    downloadStatus: "ready",
    downloadProgress: 100,
    liveScore: 0,
    liveCombo: 0,
    finished: false,
  };

  const roomData: MultiplayerRoom = {
    id: roomCode,
    hostId: hostUser.uid,
    songName: song.title,
    songArtist: song.artist,
    songMd5: song.md5 || "",
    mode,
    difficulty: initialDifficulty,
    status: "lobby",
    maxPlayers: mode === "duel" ? 2 : maxPlayers,
    players: {
      [hostUser.uid]: initialPlayer,
    },
    createdAt: Date.now(),
  };

  await setDoc(roomDocRef, {
    ...roomData,
    serverCreatedAt: serverTimestamp(),
  });

  return roomCode;
}

/**
 * Joins an existing room by Room Code
 */
export async function joinMultiplayerRoom(
  roomCode: string,
  user: User
): Promise<MultiplayerRoom> {
  const cleanCode = roomCode.trim().toUpperCase();
  const roomDocRef = doc(db, "rooms", cleanCode);
  const roomSnap = await getDoc(roomDocRef);

  if (!roomSnap.exists()) {
    throw new Error(`Room "${cleanCode}" tidak ditemukan.`);
  }

  const room = roomSnap.data() as MultiplayerRoom;

  if (room.status !== "lobby") {
    throw new Error("Game di room ini sudah dimulai.");
  }

  const playerCount = Object.keys(room.players || {}).length;
  if (playerCount >= room.maxPlayers && !room.players[user.uid]) {
    throw new Error(`Room ini sudah penuh (Maksimal ${room.maxPlayers} pemain).`);
  }

  // Suggest complimentary instrument in Band Co-op mode (e.g. if Guitar taken, pick Bass)
  let chosenInstrument: Instrument = "guitar";
  if (room.mode === "band") {
    const existingInstruments = Object.values(room.players).map((p) => p.instrument);
    if (existingInstruments.includes("guitar") && !existingInstruments.includes("bass")) {
      chosenInstrument = "bass";
    } else if (existingInstruments.includes("bass") && !existingInstruments.includes("drums")) {
      chosenInstrument = "drums";
    }
  }

  const playerObj: RoomPlayer = {
    uid: user.uid,
    displayName: user.displayName || `Player ${playerCount + 1}`,
    photoURL: user.photoURL || "",
    instrument: chosenInstrument,
    difficulty: room.difficulty || "expert", // Inherits host's room difficulty!
    ready: false,
    loaded: false,
    downloadStatus: "idle",
    downloadProgress: 0,
    liveScore: 0,
    liveCombo: 0,
    finished: false,
  };

  await updateDoc(roomDocRef, {
    [`players.${user.uid}`]: playerObj,
  });

  return {
    ...room,
    players: {
      ...room.players,
      [user.uid]: playerObj,
    },
  };
}

/**
 * Host updates room difficulty (all players inherit this difficulty)
 */
export async function updateRoomDifficulty(
  roomCode: string,
  difficulty: Difficulty
) {
  const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
  const snap = await getDoc(roomDocRef);
  if (!snap.exists()) return;

  const room = snap.data() as MultiplayerRoom;
  const updates: Record<string, unknown> = {
    difficulty,
  };

  // Sync every player's difficulty to match Host's chosen difficulty
  Object.keys(room.players || {}).forEach((uid) => {
    updates[`players.${uid}.difficulty`] = difficulty;
  });

  await updateDoc(roomDocRef, updates);
}

/**
 * Updates a player's instrument or ready state
 */
export async function updatePlayerSlot(
  roomCode: string,
  uid: string,
  updates: Partial<RoomPlayer>
) {
  const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
  const updatePayload: Record<string, unknown> = {};

  Object.entries(updates).forEach(([key, val]) => {
    updatePayload[`players.${uid}.${key}`] = val;
  });

  await updateDoc(roomDocRef, updatePayload);
}

const lastBroadcastTimeMap = new Map<string, number>();
const pendingBroadcastMap = new Map<
  string,
  { liveScore: number; liveCombo: number; finished: boolean; finalAccuracy?: number; timer?: NodeJS.Timeout }
>();

/**
 * Real-time throttled broadcast of score and combo during gameplay (Throttled to 1.5s to preserve Firestore free tier quota)
 */
export async function broadcastLiveStats(
  roomCode: string,
  uid: string,
  liveScore: number,
  liveCombo: number,
  finished = false,
  finalAccuracy?: number
) {
  const key = `${roomCode}_${uid}`;
  const now = Date.now();
  const lastTime = lastBroadcastTimeMap.get(key) || 0;
  const THROTTLE_MS = 1500;

  const sendUpdate = async () => {
    try {
      lastBroadcastTimeMap.set(key, Date.now());
      const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
      const payload: Record<string, unknown> = {
        [`players.${uid}.liveScore`]: liveScore,
        [`players.${uid}.liveCombo`]: liveCombo,
        [`players.${uid}.finished`]: finished,
      };
      if (finalAccuracy !== undefined) {
        payload[`players.${uid}.finalAccuracy`] = finalAccuracy;
      }
      await updateDoc(roomDocRef, payload);
    } catch (err: any) {
      if (err?.code === "resource-exhausted") {
        console.warn("Firestore quota exceeded: throttled live sync temporarily disabled.");
      } else {
        console.error("Broadcast stats error:", err);
      }
    }
  };

  if (finished || now - lastTime >= THROTTLE_MS) {
    const existing = pendingBroadcastMap.get(key);
    if (existing?.timer) clearTimeout(existing.timer);
    pendingBroadcastMap.delete(key);
    await sendUpdate();
  } else {
    const existing = pendingBroadcastMap.get(key);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      pendingBroadcastMap.delete(key);
      void sendUpdate();
    }, THROTTLE_MS - (now - lastTime));

    pendingBroadcastMap.set(key, { liveScore, liveCombo, finished, finalAccuracy, timer });
  }
}

/**
 * Update player download progress in the room (e.g. downloading song package)
 */
export async function setPlayerDownloadStatus(
  roomCode: string,
  uid: string,
  status: "idle" | "downloading" | "ready" | "failed",
  progress?: number
) {
  try {
    const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
    const payload: Record<string, unknown> = {
      [`players.${uid}.downloadStatus`]: status,
    };
    if (progress !== undefined) {
      payload[`players.${uid}.downloadProgress`] = progress;
    }
    if (status === "ready") {
      payload[`players.${uid}.downloadProgress`] = 100;
    }
    await updateDoc(roomDocRef, payload);
  } catch (err) {
    console.error("setPlayerDownloadStatus error:", err);
  }
}

/**
 * Host initiates match: triggers synchronized 4.5s countdown for all players simultaneously
 */
export async function startRoomMatch(roomCode: string) {
  const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
  const snap = await getDoc(roomDocRef);
  if (!snap.exists()) return;

  const room = snap.data() as MultiplayerRoom;
  const launchTimestamp = Date.now() + 4500;
  const updates: Record<string, unknown> = {
    status: "countdown",
    countdownUntil: launchTimestamp,
    startTime: launchTimestamp,
  };

  // Reset all players in-game stats
  Object.keys(room.players || {}).forEach((uid) => {
    updates[`players.${uid}.loaded`] = true;
    updates[`players.${uid}.liveScore`] = 0;
    updates[`players.${uid}.liveCombo`] = 0;
    updates[`players.${uid}.finished`] = false;
  });

  await updateDoc(roomDocRef, updates);
}

/**
 * Player signals that their chart and audio are loaded
 */
export async function setPlayerLoaded(roomCode: string, uid: string, isLoaded = true) {
  const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
  const snap = await getDoc(roomDocRef);
  if (!snap.exists()) return;

  const room = snap.data() as MultiplayerRoom;
  const updates: Record<string, unknown> = {
    [`players.${uid}.loaded`]: isLoaded,
  };

  // Only trigger countdown if not already in countdown/playing state
  if (!room.startTime && (room.status === "loading" || room.status === "lobby")) {
    const players = { ...room.players };
    if (players[uid]) players[uid].loaded = isLoaded;
    const allLoaded = Object.values(players).length > 0 && Object.values(players).every((p) => p.loaded);
    if (allLoaded) {
      const launchTimestamp = Date.now() + 4500;
      updates.status = "countdown";
      updates.startTime = launchTimestamp;
      updates.countdownUntil = launchTimestamp;
    }
  }

  await updateDoc(roomDocRef, updates);
}

/**
 * Host or auto-timer forces the synchronized countdown to start immediately (bypasses buffer wait)
 */
export async function forceStartCountdown(roomCode: string) {
  try {
    const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
    const launchTimestamp = Date.now() + 4000;
    await updateDoc(roomDocRef, {
      status: "countdown",
      startTime: launchTimestamp,
      countdownUntil: launchTimestamp,
    });
  } catch (err) {
    console.error("forceStartCountdown error:", err);
  }
}

/**
 * Pauses a multiplayer match synchronously for all players in the room
 */
export async function pauseRoomMatch(roomCode: string, pausedBy: string, pausedAtSeconds: number) {
  try {
    const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
    await updateDoc(roomDocRef, {
      status: "paused",
      pausedAt: pausedAtSeconds,
      pausedBy,
      resumeCountdownUntil: null,
    });
  } catch (err) {
    console.error("pauseRoomMatch error:", err);
  }
}

/**
 * Initiates synchronized countdown to resume a paused multiplayer match
 */
export async function resumeRoomMatch(roomCode: string, pausedAtSeconds: number) {
  try {
    const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
    const resumeTimestamp = Date.now() + 3500; // 3.5s countdown
    await updateDoc(roomDocRef, {
      status: "resuming",
      pausedAt: pausedAtSeconds,
      resumeCountdownUntil: resumeTimestamp,
      startTime: resumeTimestamp - pausedAtSeconds * 1000,
    });
  } catch (err) {
    console.error("resumeRoomMatch error:", err);
  }
}

/**
 * Leaves a room
 */
export async function leaveRoom(roomCode: string, uid: string, isHost = false) {
  try {
    const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
    if (isHost) {
      await deleteDoc(roomDocRef);
    } else {
      const snap = await getDoc(roomDocRef);
      if (snap.exists()) {
        const room = snap.data() as MultiplayerRoom;
        const newPlayers = { ...room.players };
        delete newPlayers[uid];
        await updateDoc(roomDocRef, { players: newPlayers });
      }
    }
  } catch (err) {
    console.error("Leave room error:", err);
  }
}

/**
 * Subscribes to real-time room updates via Firestore snapshots
 */
export function subscribeRoom(
  roomCode: string,
  onUpdate: (room: MultiplayerRoom | null) => void
): Unsubscribe {
  const roomDocRef = doc(db, "rooms", roomCode.toUpperCase());
  return onSnapshot(roomDocRef, (snap) => {
    if (!snap.exists()) {
      onUpdate(null);
      return;
    }
    onUpdate(snap.data() as MultiplayerRoom);
  });
}
