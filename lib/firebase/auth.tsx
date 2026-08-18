"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  deleteDoc,
  type Timestamp,
} from "firebase/firestore";
import { auth, db, googleProvider } from "./config";
import type { Difficulty, Instrument } from "../rhythm/types";

export type CustomKeybinds = {
  lane0: string; // Lane 1 (Green)
  lane1: string; // Lane 2 (Red)
  lane2: string; // Lane 3 (Yellow)
  lane3: string; // Lane 4 (Blue)
  lane4: string; // Lane 5 (Orange)
  strum: string; // Strum key
  pulse: string; // Star Power / Overdrive
  pause: string; // Pause key
};

export const DEFAULT_KEYBINDS: CustomKeybinds = {
  lane0: "KeyD",
  lane1: "KeyF",
  lane2: "KeyJ",
  lane3: "KeyK",
  lane4: "KeyL",
  strum: "Space",
  pulse: "ShiftLeft",
  pause: "Escape",
};

export type UserProfile = {
  uid: string;
  username?: string;
  displayName: string;
  email: string;
  photoURL: string;
  bio?: string;
  title?: string;
  favoriteInstrument?: Instrument;
  favoriteDifficulty?: Difficulty;
  keybinds?: CustomKeybinds;
  totalPlays: number;
  totalCareerScore?: number;
  highScore: number;
  lastPlayedSong?: string;
  lastPlayedAt?: Timestamp | Date;
  createdAt?: Timestamp | Date;
};

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
  updateUserProfile: async () => ({ success: false, error: "Not initialized" }),
  checkUsernameAvailable: async () => true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (!userDoc.exists()) {
            const cleanHandle = (firebaseUser.displayName || "rocker")
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "")
              .slice(0, 15) || `rocker_${firebaseUser.uid.slice(0, 5)}`;

            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              username: cleanHandle,
              displayName: firebaseUser.displayName || "Rhythm Rocker",
              email: firebaseUser.email || "",
              photoURL: firebaseUser.photoURL || "",
              bio: "Living for the solos and perfect 100% sync streaks 🎸⚡",
              title: "Lead Guitar Virtuoso",
              favoriteInstrument: "guitar",
              favoriteDifficulty: "expert",
              keybinds: DEFAULT_KEYBINDS,
              totalPlays: 0,
              totalCareerScore: 0,
              highScore: 0,
            };

            await setDoc(userDocRef, {
              ...newProfile,
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp(),
            });

            // Reserve default username
            try {
              await setDoc(doc(db, "usernames", cleanHandle), {
                uid: firebaseUser.uid,
                createdAt: serverTimestamp(),
              });
            } catch {
              // Non-blocking if already taken
            }

            setProfile(newProfile);
          } else {
            const data = userDoc.data() as UserProfile;
            setProfile({
              ...data,
              keybinds: data.keybinds || DEFAULT_KEYBINDS,
            });
            await setDoc(userDocRef, { lastLogin: serverTimestamp() }, { merge: true });
          }
        } catch (err) {
          console.error("User profile sync error:", err);
          setProfile({
            uid: firebaseUser.uid,
            username: `rocker_${firebaseUser.uid.slice(0, 5)}`,
            displayName: firebaseUser.displayName || "Rhythm Rocker",
            email: firebaseUser.email || "",
            photoURL: firebaseUser.photoURL || "",
            keybinds: DEFAULT_KEYBINDS,
            totalPlays: 0,
            totalCareerScore: 0,
            highScore: 0,
          });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google sign-in error:", error);
      throw error;
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign-out error:", error);
    }
  };

  const checkUsernameAvailable = async (rawUsername: string): Promise<boolean> => {
    const handle = rawUsername.toLowerCase().trim().replace(/[^a-z0-9_]/g, "");
    if (!handle || handle.length < 3) return false;
    if (profile?.username === handle) return true;

    try {
      // 1. Check usernames index doc
      const usernameDoc = await getDoc(doc(db, "usernames", handle));
      if (usernameDoc.exists()) {
        const data = usernameDoc.data();
        if (data.uid && data.uid !== user?.uid) {
          return false;
        }
      }

      // 2. Query users collection as fallback
      const q = query(collection(db, "users"), where("username", "==", handle));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const existsForOther = snap.docs.some((d) => d.id !== user?.uid);
        if (existsForOther) return false;
      }

      return true;
    } catch (err) {
      console.error("Username check error:", err);
      return true;
    }
  };

  const updateUserProfile = async (updates: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "Kamu harus login terlebih dahulu." };

    try {
      let targetUsername = updates.username?.toLowerCase().trim().replace(/[^a-z0-9_]/g, "");

      if (targetUsername) {
        if (targetUsername.length < 3) {
          return { success: false, error: "Username minimal 3 karakter (huruf, angka, atau garis bawah)." };
        }
        if (targetUsername.length > 20) {
          return { success: false, error: "Username maksimal 20 karakter." };
        }

        // Check if username changed and if it is taken
        const currentUsername = profile?.username?.toLowerCase();
        if (targetUsername !== currentUsername) {
          const isAvailable = await checkUsernameAvailable(targetUsername);
          if (!isAvailable) {
            return {
              success: false,
              error: `Username '@${targetUsername}' sudah digunakan oleh pemain lain. Silakan pilih username yang berbeda.`,
            };
          }

          // Reserve new username in Firestore
          await setDoc(doc(db, "usernames", targetUsername), {
            uid: user.uid,
            updatedAt: serverTimestamp(),
          });

          // Delete old username reservation if existed
          if (currentUsername) {
            try {
              await deleteDoc(doc(db, "usernames", currentUsername));
            } catch {
              // Ignore
            }
          }
        }
      } else {
        targetUsername = profile?.username;
      }

      const cleanUpdates: Record<string, unknown> = {
        ...updates,
        username: targetUsername,
        updatedAt: serverTimestamp(),
      };

      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, cleanUpdates, { merge: true });

      setProfile((prev) => (prev ? { ...prev, ...updates, username: targetUsername } : null));
      return { success: true };
    } catch (err: unknown) {
      console.error("Failed to update profile:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Gagal memperbarui profil. Coba lagi beberapa saat.",
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signOutUser,
        updateUserProfile,
        checkUsernameAvailable,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
