import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import type { Difficulty, Instrument } from "../rhythm/types";
import { db } from "./config";

export type LeaderboardEntry = {
  id?: string;
  uid: string;
  displayName: string;
  photoURL: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  difficulty: Difficulty;
  instrument: Instrument;
  songTitle: string;
  songArtist: string;
  createdAt?: Timestamp | Date;
};

export type PlayerRankingEntry = {
  uid: string;
  displayName: string;
  photoURL: string;
  totalPlays: number;
  totalCareerScore: number;
  highestSingleScore: number;
  lastPlayedSong?: string;
};

export type SongCatalogEntry = {
  songKey: string;
  title: string;
  artist: string;
  totalPlays: number;
  lastPlayedAt?: Timestamp | Date;
};

export function getSongKey(artist: string, title: string): string {
  const sanitize = (str: string) =>
    str.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${sanitize(artist)}_${sanitize(title)}`;
}

/**
 * Submits a finished song score to Firestore leaderboard and updates player aggregates
 */
export async function submitScore(
  songKey: string,
  user: User,
  scoreData: {
    score: number;
    accuracy: number;
    maxCombo: number;
    difficulty: Difficulty;
    instrument: Instrument;
    songTitle: string;
    songArtist: string;
  }
) {
  try {
    const scoresRef = collection(db, "leaderboards", songKey, "scores");
    await addDoc(scoresRef, {
      uid: user.uid,
      displayName: user.displayName || "Rhythm Rocker",
      photoURL: user.photoURL || "",
      score: scoreData.score,
      accuracy: scoreData.accuracy,
      maxCombo: scoreData.maxCombo,
      difficulty: scoreData.difficulty,
      instrument: scoreData.instrument,
      songTitle: scoreData.songTitle,
      songArtist: scoreData.songArtist,
      createdAt: serverTimestamp(),
    });

    // Update user profile total plays & cumulative career score
    const userDocRef = doc(db, "users", user.uid);
    await setDoc(
      userDocRef,
      {
        displayName: user.displayName || "Rhythm Rocker",
        photoURL: user.photoURL || "",
        totalPlays: increment(1),
        totalCareerScore: increment(scoreData.score),
        lastPlayedSong: `${scoreData.songArtist} - ${scoreData.songTitle}`,
        lastPlayedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Register/update song in the global songs catalog
    const catalogDocRef = doc(db, "songs_catalog", songKey);
    await setDoc(
      catalogDocRef,
      {
        songKey,
        title: scoreData.songTitle,
        artist: scoreData.songArtist,
        totalPlays: increment(1),
        lastPlayedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Failed to submit score to leaderboard:", error);
  }
}

/**
 * Fetches top 50 scores for a specific song and difficulty
 */
export async function fetchLeaderboard(
  songKey: string,
  difficulty?: Difficulty
): Promise<LeaderboardEntry[]> {
  try {
    const scoresRef = collection(db, "leaderboards", songKey, "scores");
    let q = query(scoresRef, orderBy("score", "desc"), limit(50));

    if (difficulty) {
      q = query(scoresRef, where("difficulty", "==", difficulty), orderBy("score", "desc"), limit(50));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<LeaderboardEntry, "id">),
    }));
  } catch (error) {
    console.error("Failed to fetch song leaderboard:", error);
    return [];
  }
}

/**
 * Fetches top players by Total Career Score worldwide
 */
export async function fetchTopCareerPlayers(): Promise<PlayerRankingEntry[]> {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy("totalCareerScore", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => d.data() as PlayerRankingEntry)
      .filter((p) => (p.totalCareerScore || 0) > 0);
  } catch (error) {
    console.error("Failed to fetch top career players:", error);
    return [];
  }
}

/**
 * Fetches top players by Total Songs Played (Most Active Rockers)
 */
export async function fetchMostActivePlayers(): Promise<PlayerRankingEntry[]> {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy("totalPlays", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => d.data() as PlayerRankingEntry)
      .filter((p) => (p.totalPlays || 0) > 0);
  } catch (error) {
    console.error("Failed to fetch most active players:", error);
    return [];
  }
}

/**
 * Fetches tracked songs from the catalog for search / browsing
 */
export async function fetchTrackedSongs(): Promise<SongCatalogEntry[]> {
  try {
    const catalogRef = collection(db, "songs_catalog");
    const q = query(catalogRef, orderBy("totalPlays", "desc"), limit(60));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as SongCatalogEntry);
  } catch (error) {
    console.error("Failed to fetch tracked songs catalog:", error);
    return [];
  }
}

