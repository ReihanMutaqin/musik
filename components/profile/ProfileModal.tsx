"use client";

import React, { useState, useEffect } from "react";
import { useAuth, DEFAULT_KEYBINDS, type CustomKeybinds } from "@/lib/firebase/auth";
import type { Difficulty, Instrument } from "@/lib/rhythm/types";

type ProfileModalProps = {
  onClose: () => void;
};

const PRESET_AVATARS = [
  { id: "electric", emoji: "⚡", label: "Electric Rocker", color: "#d8ff3f" },
  { id: "shredder", emoji: "🎸", label: "Shred Virtuoso", color: "#00f0ff" },
  { id: "crown", emoji: "👑", label: "Rhythm King", color: "#ffd700" },
  { id: "skull", emoji: "💀", label: "Metal Head", color: "#ff3b69" },
  { id: "headset", emoji: "🎧", label: "Beat Master", color: "#bf5af2" },
  { id: "fire", emoji: "🔥", label: "Speed Demon", color: "#ff9500" },
  { id: "star", emoji: "⭐", label: "Rockstar", color: "#30d158" },
  { id: "horns", emoji: "🤘", label: "Hardcore", color: "#ff453a" },
];

const KEY_PRESETS: { name: string; desc: string; binds: CustomKeybinds }[] = [
  {
    name: "Standar (D F J K L)",
    desc: "2 Tangan Seimbang",
    binds: { lane0: "KeyD", lane1: "KeyF", lane2: "KeyJ", lane3: "KeyK", lane4: "KeyL", strum: "Space", pulse: "ShiftLeft", pause: "Escape" },
  },
  {
    name: "Ergonomic (A S K L ;)",
    desc: "Jarak Tangan Lebar & Rileks",
    binds: { lane0: "KeyA", lane1: "KeyS", lane2: "KeyK", lane3: "KeyL", lane4: "Semicolon", strum: "Space", pulse: "ShiftLeft", pause: "Escape" },
  },
  {
    name: "Angka (1 2 3 4 5)",
    desc: "Top Number Row",
    binds: { lane0: "Digit1", lane1: "Digit2", lane2: "Digit3", lane3: "Digit4", lane4: "Digit5", strum: "Space", pulse: "ShiftLeft", pause: "Escape" },
  },
  {
    name: "Tangan Kiri (A S D F G)",
    desc: "1 Tangan Sisi Kiri",
    binds: { lane0: "KeyA", lane1: "KeyS", lane2: "KeyD", lane3: "KeyF", lane4: "KeyG", strum: "Space", pulse: "ShiftRight", pause: "Escape" },
  },
  {
    name: "Baris Bawah (Z X C V B)",
    desc: "Keyboard Bawah",
    binds: { lane0: "KeyZ", lane1: "KeyX", lane2: "KeyC", lane3: "KeyV", lane4: "KeyB", strum: "Space", pulse: "ShiftRight", pause: "Escape" },
  },
];

function formatKeyCode(code: string): string {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.replace("Key", "");
  if (code.startsWith("Digit")) return code.replace("Digit", "");
  if (code === "Space") return "SPACE";
  if (code.startsWith("Shift")) return "SHIFT";
  if (code.startsWith("Control")) return "CTRL";
  if (code === "Escape") return "ESC";
  if (code === "Semicolon") return ";";
  if (code === "Comma") return ",";
  if (code === "Period") return ".";
  if (code === "Slash") return "/";
  if (code === "Quote") return "'";
  return code;
}

export function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, profile, updateUserProfile, checkUsernameAvailable } = useAuth();

  const [tab, setTab] = useState<"profile" | "controls">("profile");

  const [username, setUsername] = useState(profile?.username || "");
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [title, setTitle] = useState(profile?.title || "Lead Virtuoso");
  const [favoriteInstrument, setFavoriteInstrument] = useState<Instrument>(profile?.favoriteInstrument || "guitar");
  const [favoriteDifficulty, setFavoriteDifficulty] = useState<Difficulty>(profile?.favoriteDifficulty || "expert");
  const [selectedAvatar, setSelectedAvatar] = useState<string>(profile?.photoURL || "");

  // Keybinds state
  const [keybinds, setKeybinds] = useState<CustomKeybinds>(profile?.keybinds || DEFAULT_KEYBINDS);
  const [listeningKey, setListeningKey] = useState<keyof CustomKeybinds | null>(null);

  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Live username availability check with debounce
  useEffect(() => {
    const clean = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, "");
    if (!clean) {
      setUsernameStatus("idle");
      setStatusMessage("");
      return;
    }

    if (clean.length < 3) {
      setUsernameStatus("taken");
      setStatusMessage("Username minimal 3 karakter.");
      return;
    }

    if (clean === profile?.username?.toLowerCase()) {
      setUsernameStatus("available");
      setStatusMessage("Username aktif kamu saat ini.");
      return;
    }

    setUsernameStatus("checking");
    const timeout = setTimeout(async () => {
      const isAvailable = await checkUsernameAvailable(clean);
      if (isAvailable) {
        setUsernameStatus("available");
        setStatusMessage(`✓ Username @${clean} tersedia!`);
      } else {
        setUsernameStatus("taken");
        setStatusMessage(`❌ Username @${clean} sudah digunakan oleh pemain lain.`);
      }
    }, 450);

    return () => clearTimeout(timeout);
  }, [username, profile?.username, checkUsernameAvailable]);

  // Key Recording Listener when listening to keybind remapping
  useEffect(() => {
    if (!listeningKey) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Don't bind tab or functional browser shortcuts
      if (e.code === "Tab") {
        setListeningKey(null);
        return;
      }

      setKeybinds((prev) => ({
        ...prev,
        [listeningKey]: e.code,
      }));
      setListeningKey(null);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [listeningKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess(false);

    if (usernameStatus === "taken") {
      setSaveError(statusMessage || "Username tidak valid atau sudah digunakan.");
      return;
    }

    setSaving(true);
    try {
      const res = await updateUserProfile({
        username: username.toLowerCase().trim().replace(/[^a-z0-9_]/g, ""),
        displayName: displayName.trim() || "Rhythm Rocker",
        bio: bio.trim(),
        title: title.trim(),
        favoriteInstrument,
        favoriteDifficulty,
        keybinds,
        photoURL: selectedAvatar || profile?.photoURL || "",
      });

      if (!res.success) {
        setSaveError(res.error || "Gagal menyimpan profil.");
      } else {
        setSaveSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan profil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="profile-modal professional-theme" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <header className="profile-header">
          <div className="profile-header-copy">
            <div className="lb-header-top-row">
              <span className="lb-pro-badge">ROCKER IDENTITY & CONTROLS</span>
              <span className="lb-live-indicator">P2P PROFILE</span>
            </div>
            <h2>Kustomisasi Profil & Kontrol</h2>
            <p>Atur username unik, avatar panggung, dan pemetaan tombol keyboard sesuai gayamu</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </header>

        {/* PROFILE TABS */}
        <div className="profile-sub-tabs">
          <button
            type="button"
            className={`prof-tab-btn ${tab === "profile" ? "active" : ""}`}
            onClick={() => setTab("profile")}
          >
            Identitas & Profil
          </button>
          <button
            type="button"
            className={`prof-tab-btn ${tab === "controls" ? "active" : ""}`}
            onClick={() => setTab("controls")}
          >
            Pengaturan Keybinds
          </button>
        </div>

        {/* PROFILE BODY */}
        <form className="profile-body" onSubmit={handleSubmit}>
          {saveError && (
            <div className="profile-alert error">
              <div>
                <strong>Gagal Menyimpan Perubahan</strong>
                <p>{saveError}</p>
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="profile-alert success">
              <div>
                <strong>Pengaturan Berhasil Disimpan</strong>
                <p>Identitas dan konfigurasi tombol kamu telah diperbarui.</p>
              </div>
            </div>
          )}

          {/* TAB 1: IDENTITAS PROFIL */}
          {tab === "profile" && (
            <>
              {/* SECTION 1: AVATAR & IDENTITY BADGE */}
              <div className="profile-section">
                <label className="section-label">PILIH AVATAR ROCKER</label>
                <div className="avatar-picker-row">
                  {PRESET_AVATARS.map((av) => {
                    const isSelected = selectedAvatar === av.id || (!selectedAvatar && profile?.photoURL === av.id);
                    return (
                      <button
                        key={av.id}
                        type="button"
                        className={`avatar-preset-btn ${isSelected ? "active" : ""}`}
                        onClick={() => setSelectedAvatar(av.id)}
                        title={av.label}
                        style={{ borderColor: isSelected ? av.color : undefined }}
                      >
                        <span className="preset-emoji">{av.emoji}</span>
                        <small>{av.label}</small>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: USERNAME & DISPLAY NAME */}
              <div className="profile-form-grid">
                <div className="form-group">
                  <label htmlFor="user-handle-input">
                    USERNAME UNIK (HANDLE) <span className="req">*</span>
                  </label>
                  <div className="handle-input-wrap">
                    <span className="handle-prefix">@</span>
                    <input
                      id="user-handle-input"
                      type="text"
                      className={`profile-input handle ${usernameStatus}`}
                      placeholder="username_kamu"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      maxLength={20}
                      required
                    />
                  </div>
                  {statusMessage && (
                    <div className={`handle-status-hint ${usernameStatus}`}>
                      {statusMessage}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="user-display-name">NAMA LENGKAP / PANGGUNG</label>
                  <input
                    id="user-display-name"
                    type="text"
                    className="profile-input"
                    placeholder="Nama Tampilan..."
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={30}
                  />
                </div>
              </div>

              {/* SECTION 3: TITLE & BIO */}
              <div className="profile-form-grid">
                <div className="form-group">
                  <label htmlFor="user-title">GELAR / TITLE ROCKER</label>
                  <input
                    id="user-title"
                    type="text"
                    className="profile-input"
                    placeholder="Contoh: Lead Guitar Virtuoso, FC Chaser..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={35}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="user-bio">SLOGAN / BIO SINGKAT</label>
                  <input
                    id="user-bio"
                    type="text"
                    className="profile-input"
                    placeholder="Kata-kata mutiara rocker kamu..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={80}
                  />
                </div>
              </div>

              {/* SECTION 4: DEFAULT PREFERENCES */}
              <div className="profile-section">
                <label className="section-label">PREFERENSI INSTRUMEN & DIFFICULTY</label>
                <div className="profile-pref-row">
                  <div className="pref-item">
                    <span>Instrumen Utama:</span>
                    <select
                      className="profile-select"
                      value={favoriteInstrument}
                      onChange={(e) => setFavoriteInstrument(e.target.value as Instrument)}
                    >
                      <option value="guitar">🎸 Lead Guitar</option>
                      <option value="bass">🎸 Bass</option>
                      <option value="drums">🥁 Drums</option>
                      <option value="keys">🎹 Keys</option>
                    </select>
                  </div>

                  <div className="pref-item">
                    <span>Difficulty Utama:</span>
                    <select
                      className="profile-select"
                      value={favoriteDifficulty}
                      onChange={(e) => setFavoriteDifficulty(e.target.value as Difficulty)}
                    >
                      <option value="expert">EXPERT (Tier Tertinggi)</option>
                      <option value="hard">HARD</option>
                      <option value="medium">MEDIUM</option>
                      <option value="easy">EASY</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 5: CAREER STATS CARD */}
              <div className="profile-stats-card">
                <div className="stat-box">
                  <span>TOTAL SELESAI</span>
                  <strong>{profile?.totalPlays || 0} Lagu</strong>
                </div>
                <div className="stat-box">
                  <span>TOTAL SKOR KARIR</span>
                  <strong>{(profile?.totalCareerScore || 0).toLocaleString("id-ID")} PTS</strong>
                </div>
                <div className="stat-box">
                  <span>EMAIL TERVERIFIKASI</span>
                  <strong className="email-val">{user?.email || "Google Account"}</strong>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: KUSTOMISASI TOMBOL (KEYBINDS) */}
          {tab === "controls" && (
            <div className="keybinds-container">
              {/* Quick Presets */}
              <div className="keybinds-section">
                <label className="section-label">PILIHAN PRESET CEPAT</label>
                <div className="keybind-presets-row">
                  {KEY_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className="keybind-preset-btn"
                      onClick={() => setKeybinds(preset.binds)}
                    >
                      <strong>{preset.name}</strong>
                      <small>{preset.desc}</small>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5 Fret Lanes Customizer */}
              <div className="keybinds-section">
                <label className="section-label">
                  PEMETAAN 5 FRET LANES {listeningKey && <span className="listening-badge">⚡ TEKAN TOMBOL APAPUN DI KEYBOARD...</span>}
                </label>
                <div className="frets-keybind-grid">
                  {(
                    [
                      { key: "lane0", name: "Fret 1 (Hijau)", color: "#68f65d", dot: "🟢" },
                      { key: "lane1", name: "Fret 2 (Merah)", color: "#ff4c67", dot: "🔴" },
                      { key: "lane2", name: "Fret 3 (Kuning)", color: "#ffd84d", dot: "🟡" },
                      { key: "lane3", name: "Fret 4 (Biru)", color: "#4ba9ff", dot: "🔵" },
                      { key: "lane4", name: "Fret 5 (Oranye)", color: "#ff7a3d", dot: "🟠" },
                    ] as const
                  ).map((fret) => {
                    const isListening = listeningKey === fret.key;
                    return (
                      <div
                        key={fret.key}
                        className={`fret-bind-card ${isListening ? "is-listening" : ""}`}
                        onClick={() => setListeningKey(fret.key)}
                        style={{ borderBottomColor: fret.color }}
                      >
                        <span className="fret-dot">{fret.dot}</span>
                        <div className="fret-bind-copy">
                          <strong>{fret.name}</strong>
                          <small>{isListening ? "Tekan Tombol..." : "Klik untuk Ubah"}</small>
                        </div>
                        <kbd className={`fret-kbd ${isListening ? "pulsing" : ""}`}>
                          {isListening ? "?" : formatKeyCode(keybinds[fret.key])}
                        </kbd>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Keys (Strum, Pulse, Pause) */}
              <div className="keybinds-section">
                <label className="section-label">TOMBOL AKSI TAMBAHAN</label>
                <div className="action-keys-grid">
                  {(
                    [
                      { key: "strum", name: "Strum Bar (Fret + Strum Mode)", desc: "Memukul nada bersamaan dengan fret", icon: "🎸" },
                      { key: "pulse", name: "Star Power / Pulse", desc: "Mengaktifkan multiplier 2x", icon: "⭐" },
                      { key: "pause", name: "Jeda / Menu Game", desc: "Pause permainan", icon: "⏸️" },
                    ] as const
                  ).map((action) => {
                    const isListening = listeningKey === action.key;
                    return (
                      <div
                        key={action.key}
                        className={`action-bind-card ${isListening ? "is-listening" : ""}`}
                        onClick={() => setListeningKey(action.key)}
                      >
                        <span className="action-icon">{action.icon}</span>
                        <div className="action-copy">
                          <strong>{action.name}</strong>
                          <small>{isListening ? "Tekan tombol keyboard baru..." : action.desc}</small>
                        </div>
                        <kbd className={`action-kbd ${isListening ? "pulsing" : ""}`}>
                          {isListening ? "?" : formatKeyCode(keybinds[action.key])}
                        </kbd>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* FOOTER ACTIONS */}
          <div className="profile-footer-actions">
            <button type="button" className="profile-btn secondary" onClick={onClose}>
              BATAL
            </button>
            <button
              type="submit"
              className="profile-btn primary"
              disabled={saving || usernameStatus === "taken" || usernameStatus === "checking"}
            >
              {saving ? "MENYIMPAN…" : "SIMPAN PENGATURAN ⚡"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
