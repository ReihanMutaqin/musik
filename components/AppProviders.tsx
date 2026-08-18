"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

export type AppSettings = {
  theme: ThemeMode;
  voiceRate: number;
  voicePitch: number;
  autoSpeak: boolean;
  masterVolume: number;
  cameraMirror: boolean;
  showSkeleton: boolean;
  scale: string;
  musicMode: string;
  animationLevel: "full" | "reduced";
  uiSounds: boolean;
};

export const defaultSettings: AppSettings = {
  theme: "system",
  voiceRate: 1,
  voicePitch: 1.08,
  autoSpeak: false,
  masterVolume: 0.58,
  cameraMirror: true,
  showSkeleton: true,
  scale: "major-pentatonic",
  musicMode: "harmony",
  animationLevel: "full",
  uiSounds: true,
};

type SettingsContextValue = {
  settings: AppSettings;
  updateSettings: (next: Partial<AppSettings>) => void;
  resetSettings: () => void;
  hydrated: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyTheme(theme: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [hydrated, setHydrated] = useState(false);
  const uiAudioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem("reihan.settings");
        const parsed = raw ? (JSON.parse(raw) as { version?: number; data?: Partial<AppSettings> }) : null;
        const saved = parsed?.version === 1 && parsed.data ? { ...defaultSettings, ...parsed.data } : defaultSettings;
        setSettings(saved);
        applyTheme(saved.theme);
      } catch {
        setSettings(defaultSettings);
        applyTheme(defaultSettings.theme);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(settings.theme);
    document.documentElement.dataset.motion = settings.animationLevel;
    localStorage.setItem("reihan.settings", JSON.stringify({ version: 1, data: settings }));
  }, [hydrated, settings]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => settings.theme === "system" && applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [settings.theme]);

  useEffect(() => {
    if (!settings.uiSounds) return;
    const playTap = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".button, .icon-button, .nav a, .toggle, .theme-options button, .mode-tabs button, .segmented-control button, .expression-controls button")) return;
      const context = uiAudioRef.current || new AudioContext({ latencyHint: "interactive" });
      uiAudioRef.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(620, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(460, context.currentTime + .035);
      gain.gain.setValueAtTime(.012, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .04);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + .045);
    };
    document.addEventListener("pointerdown", playTap);
    return () => document.removeEventListener("pointerdown", playTap);
  }, [settings.uiSounds]);

  useEffect(() => () => {
    uiAudioRef.current?.close().catch(() => undefined);
  }, []);

  const updateSettings = useCallback((next: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    localStorage.removeItem("reihan.chat");
    localStorage.removeItem("reihan.music");
    localStorage.removeItem("reihan.onboarding");
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings, hydrated }),
    [settings, updateSettings, resetSettings, hydrated],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAppSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useAppSettings must be used inside AppProviders");
  return value;
}
