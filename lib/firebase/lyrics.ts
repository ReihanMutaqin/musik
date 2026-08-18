import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./config";
import { getSongKey } from "./leaderboard";
import { parseLrc, type TimedLyricLine } from "../rhythm/lyrics";

export type GlobalLyricsDoc = {
  songKey: string;
  title: string;
  artist: string;
  lrcContent: string;
  offsetMs: number;
  lineCount: number;
  syncedByUid?: string;
  syncedByName?: string;
  updatedAt?: any;
};

/**
 * Serializes TimedLyricLine array back into standard .lrc text format
 */
export function stringifyLyricsToLrc(lyrics: TimedLyricLine[], offsetMs: number = 0): string {
  const lines: string[] = [];
  if (offsetMs !== 0) {
    lines.push(`[offset:${offsetMs}]`);
  }
  for (const item of lyrics) {
    const min = Math.floor(item.time / 60);
    const sec = (item.time % 60).toFixed(2).padStart(5, "0");
    lines.push(`[${String(min).padStart(2, "0")}:${sec}] ${item.text}`);
  }
  return lines.join("\n");
}

/**
 * Fetches synced lyrics for a song:
 * 1. Checks LocalStorage cache
 * 2. Checks Firestore global shared database (`global_lyrics`)
 * 3. Falls back to LRCLIB online API
 */
export async function getGlobalOrOnlineLyrics(
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<{
  lyrics: TimedLyricLine[];
  offsetMs: number;
  source: "firestore" | "lrclib" | "local" | "none";
  rawLrc?: string;
  syncedByName?: string;
}> {
  const songKey = getSongKey(artist, title);

  // 1. Check LocalStorage Cache
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(`riff_lyrics_${songKey}`);
      if (cached) {
        const parsedDoc = JSON.parse(cached) as GlobalLyricsDoc;
        if (parsedDoc && parsedDoc.lrcContent) {
          const lines = parseLrc(parsedDoc.lrcContent);
          if (lines.length > 0) {
            return {
              lyrics: lines,
              offsetMs: parsedDoc.offsetMs || 0,
              source: "local",
              rawLrc: parsedDoc.lrcContent,
              syncedByName: parsedDoc.syncedByName,
            };
          }
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }

  // 2. Check Firestore Global Database
  try {
    const docRef = doc(db, "global_lyrics", songKey);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as GlobalLyricsDoc;
      if (data.lrcContent) {
        const lines = parseLrc(data.lrcContent);
        if (lines.length > 0) {
          // Cache locally for instant next loads
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(`riff_lyrics_${songKey}`, JSON.stringify(data));
            } catch {}
          }
          return {
            lyrics: lines,
            offsetMs: data.offsetMs || 0,
            source: "firestore",
            rawLrc: data.lrcContent,
            syncedByName: data.syncedByName,
          };
        }
      }
    }
  } catch (err) {
    console.warn("Firestore global lyrics check skipped:", err);
  }

  // 3. Fallback: Query online LRCLIB database
  try {
    const cleanArtist = artist === "Unknown artist" ? "" : artist;
    const params = new URLSearchParams({
      track: title,
      artist: cleanArtist,
    });
    if (album && album !== "Unknown release") params.set("album", album);
    if (duration && duration > 0) params.set("duration", Math.round(duration).toString());

    const res = await fetch(`/api/lyrics?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics) {
        const lines = parseLrc(data.syncedLyrics);
        if (lines.length > 0) {
          return {
            lyrics: lines,
            offsetMs: 0,
            source: "lrclib",
            rawLrc: data.syncedLyrics,
          };
        }
      }
    }
  } catch (err) {
    console.error("LRCLIB online lyrics fetch error:", err);
  }

  return {
    lyrics: [],
    offsetMs: 0,
    source: "none",
  };
}

/**
 * Saves synced lyrics globally in Firestore so that ALL players worldwide
 * automatically get the synced lyrics without having to re-adjust!
 */
export async function saveGlobalLyrics(
  artist: string,
  title: string,
  lrcContent: string,
  offsetMs: number = 0,
  user?: User | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const songKey = getSongKey(artist, title);
    const parsed = parseLrc(lrcContent);
    if (!parsed.length) {
      return { success: false, error: "Format lirik tidak memiliki timestamp [mm:ss.xx] yang valid." };
    }

    const payload: GlobalLyricsDoc = {
      songKey,
      title,
      artist,
      lrcContent,
      offsetMs,
      lineCount: parsed.length,
      syncedByUid: user?.uid || "community",
      syncedByName: user?.displayName || "RIFF Community",
      updatedAt: serverTimestamp(),
    };

    const docRef = doc(db, "global_lyrics", songKey);
    await setDoc(docRef, payload, { merge: true });

    // Cache locally
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`riff_lyrics_${songKey}`, JSON.stringify(payload));
      } catch {}
    }

    return { success: true };
  } catch (err: any) {
    console.error("Save global lyrics error:", err);
    return { success: false, error: err?.message || "Gagal menyimpan ke server Firestore." };
  }
}
