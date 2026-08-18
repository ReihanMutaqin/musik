import { db } from "../firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";

export type GlobalVideoConfig = {
  videoId: string;
  videoTitle?: string;
  offsetMs: number;
  syncedBy?: string;
  updatedAt: number;
};

/**
 * Extracts a 11-character YouTube video ID from various URL formats
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Matches youtube.com/watch?v=..., youtu.be/..., youtube.com/embed/...
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

function getSongDocKey(artist: string, title: string): string {
  const clean = `${artist}_${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
  return clean || "unknown_song";
}

/**
 * Check if the song has a community saved YouTube video config in Firestore
 */
export async function getGlobalSongVideo(
  artist: string,
  title: string
): Promise<GlobalVideoConfig | null> {
  try {
    const key = getSongDocKey(artist, title);
    const docRef = doc(db, "global_videos", key);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as GlobalVideoConfig;
    }
  } catch (err) {
    console.warn("getGlobalSongVideo error:", err);
  }
  return null;
}

/**
 * Save / override global video config in Firestore
 */
export async function saveGlobalSongVideo(
  artist: string,
  title: string,
  videoId: string,
  offsetMs = 0,
  user?: { displayName?: string | null; username?: string | null } | null,
  videoTitle?: string
) {
  try {
    const key = getSongDocKey(artist, title);
    const docRef = doc(db, "global_videos", key);
    const payload: GlobalVideoConfig = {
      videoId,
      videoTitle: videoTitle || "",
      offsetMs,
      syncedBy: user?.displayName || user?.username || "Community Virtuoso",
      updatedAt: Date.now(),
    };
    await setDoc(docRef, payload, { merge: true });
    return { success: true };
  } catch (err: unknown) {
    console.error("saveGlobalSongVideo error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save video config",
    };
  }
}

/**
 * Smartly auto-fetch official music video from YouTube via our Next.js API
 */
export async function autoFetchMusicVideo(
  artist: string,
  title: string
): Promise<{ videoId: string; title: string; author: string } | null> {
  try {
    // 1. Check if Firestore already has a saved video
    const globalCached = await getGlobalSongVideo(artist, title);
    if (globalCached?.videoId) {
      return {
        videoId: globalCached.videoId,
        title: globalCached.videoTitle || `${artist} - ${title}`,
        author: "Community Verified",
      };
    }

    // 2. Fetch from smart search endpoint
    const url = `/api/video/search?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as any;
    if (data?.success && data?.bestVideo?.videoId) {
      return {
        videoId: data.bestVideo.videoId,
        title: data.bestVideo.title,
        author: data.bestVideo.author,
      };
    }
  } catch (err) {
    console.warn("autoFetchMusicVideo error:", err);
  }
  return null;
}
