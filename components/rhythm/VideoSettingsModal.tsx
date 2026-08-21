"use client";

import React, { useState } from "react";
import { extractYouTubeVideoId, saveGlobalSongVideo } from "@/lib/video/youtube";
import { useAuth } from "@/lib/firebase/auth";

export type VideoPlaybackMode = "full" | "loop" | "off";

type VideoSearchResultItem = {
  videoId: string;
  title: string;
  author: string;
  durationText?: string;
  thumbnailUrl?: string;
};

type VideoSettingsModalProps = {
  songTitle: string;
  songArtist: string;
  currentVideoId: string | null;
  currentVideoTitle?: string;
  videoOffsetMs: number;
  videoDimPercent: number;
  videoEnabled: boolean;
  videoMode?: VideoPlaybackMode;
  onUpdateVideo: (
    videoId: string | null,
    offsetMs: number,
    dimPercent: number,
    enabled: boolean,
    title?: string,
    mode?: VideoPlaybackMode
  ) => void;
  onClose: () => void;
};

export function VideoSettingsModal({
  songTitle,
  songArtist,
  currentVideoId,
  currentVideoTitle,
  videoOffsetMs,
  videoDimPercent,
  videoEnabled,
  videoMode = "full",
  onUpdateVideo,
  onClose,
}: VideoSettingsModalProps) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(videoEnabled);
  const [mode, setMode] = useState<VideoPlaybackMode>(videoMode);
  const [dim, setDim] = useState(videoDimPercent);
  const [offset, setOffset] = useState(videoOffsetMs);
  const [customInput, setCustomInput] = useState("");
  const [searchQuery, setSearchQuery] = useState(`${songArtist} ${songTitle}`);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<VideoSearchResultItem[]>([]);
  const [activeTab, setActiveTab] = useState<"settings" | "search" | "paste">("settings");
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(currentVideoId);
  const [selectedVideoTitle, setSelectedVideoTitle] = useState<string>(currentVideoTitle || "");

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/video/search?q=${encodeURIComponent(searchQuery)}`);
      const data = (await res.json()) as any;
      if (data?.success && Array.isArray(data.results)) {
        setSearchResults(data.results);
      }
    } catch (err) {
      console.error("Search video error:", err);
    } finally {
      setSearching(false);
    }
  };

  const handlePasteUrl = () => {
    const id = extractYouTubeVideoId(customInput);
    if (id) {
      setSelectedVideoId(id);
      setSelectedVideoTitle(customInput);
      onUpdateVideo(id, offset, dim, true, "Custom YouTube Video", mode === "off" ? "full" : mode);
      alert("✅ Video YouTube berhasil diatur!");
    } else {
      alert("❌ URL YouTube tidak valid. Contoh: https://youtu.be/dQw4w9WgXcQ");
    }
  };

  const handleSaveGlobal = async () => {
    if (!selectedVideoId) {
      alert("Belum ada video yang dipilih.");
      return;
    }
    setSavingGlobal(true);
    try {
      const res = await saveGlobalSongVideo(
        songArtist,
        songTitle,
        selectedVideoId,
        offset,
        user,
        selectedVideoTitle,
        dim,
        mode
      );
      if (res.success) {
        alert("🎉 BERHASIL DISIMPAN KE GLOBAL FIRESTORE!\n\nVideo musik ini sekarang otomatis muncul sebagai latar resmi untuk semua pemain di seluruh dunia.");
      } else {
        alert(`Gagal menyimpan global: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || err}`);
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleApply = () => {
    onUpdateVideo(selectedVideoId, offset, dim, mode !== "off", selectedVideoTitle, mode);
    onClose();
  };

  return (
    <div className="game-overlay video-modal-overlay" role="dialog" aria-modal="true">
      <div className="video-modal-card">
        <div className="video-modal-top">
          <div>
            <h3>Pengaturan Music Video Background</h3>
            <small>{songTitle} · {songArtist}</small>
          </div>
          <button type="button" className="video-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="video-modal-tabs">
          <button
            type="button"
            className={`video-tab-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            ⚙️ Mode & Kalibrasi
          </button>
          <button
            type="button"
            className={`video-tab-btn ${activeTab === "search" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("search");
              if (searchResults.length === 0) void handleSearch();
            }}
          >
            🔍 Cari Video Musik
          </button>
          <button
            type="button"
            className={`video-tab-btn ${activeTab === "paste" ? "active" : ""}`}
            onClick={() => setActiveTab("paste")}
          >
            🔗 Paste Link YouTube
          </button>
        </div>

        <div className="video-modal-body">
          {/* TAB 1: SETTINGS & OFFSET */}
          {activeTab === "settings" && (
            <div className="video-settings-view">
              {/* PLAYBACK MODE SELECTOR: FULL vs LOOP vs OFF */}
              <div className="video-control-box">
                <div className="control-label-row">
                  <span>MODE PEMUTARAN VIDEO:</span>
                  <b style={{ color: mode === "full" ? "#d8ff3f" : mode === "loop" ? "#00f0ff" : "#ff6677" }}>
                    {mode === "full" ? "🎬 FULL VIDEO (SYNC AUDIO)" : mode === "loop" ? "🔁 LOOP VIDEO" : "❌ NONAKTIF (OFF)"}
                  </b>
                </div>
                <div className="dim-presets" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    style={{
                      background: mode === "full" ? "rgba(216, 255, 63, 0.2)" : undefined,
                      borderColor: mode === "full" ? "#d8ff3f" : undefined,
                      color: mode === "full" ? "#d8ff3f" : undefined,
                      fontWeight: 800,
                    }}
                    onClick={() => {
                      setMode("full");
                      setEnabled(true);
                    }}
                  >
                    🎬 Full Video (Sync)
                  </button>
                  <button
                    type="button"
                    style={{
                      background: mode === "loop" ? "rgba(0, 240, 255, 0.2)" : undefined,
                      borderColor: mode === "loop" ? "#00f0ff" : undefined,
                      color: mode === "loop" ? "#00f0ff" : undefined,
                      fontWeight: 800,
                    }}
                    onClick={() => {
                      setMode("loop");
                      setEnabled(true);
                    }}
                  >
                    🔁 Loop Video
                  </button>
                  <button
                    type="button"
                    style={{
                      background: mode === "off" ? "rgba(255, 100, 120, 0.2)" : undefined,
                      borderColor: mode === "off" ? "#ff6677" : undefined,
                      color: mode === "off" ? "#ff6677" : undefined,
                      fontWeight: 800,
                    }}
                    onClick={() => {
                      setMode("off");
                      setEnabled(false);
                    }}
                  >
                    ❌ Video Off
                  </button>
                </div>
                <small style={{ color: "#888899", fontSize: 11, marginTop: 4 }}>
                  {mode === "full"
                    ? "✓ Full Video: Video musik diputar dari awal sampai akhir mengikuti durasi lagu secara presisi."
                    : mode === "loop"
                    ? "✓ Loop: Video diputar berulang-ulang tanpa henti selama permainan berlangsung."
                    : "✓ Off: Latar belakang panggung gelap tanpa video YouTube."}
                </small>
              </div>

              {/* Active Video Info */}
              {selectedVideoId ? (
                <div className="video-active-preview-box">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${selectedVideoId}/hqdefault.jpg`}
                    alt="Video thumbnail"
                    className="video-active-thumb"
                  />
                  <div className="video-active-info">
                    <span className="video-badge">VIDEO AKTIF</span>
                    <strong>{selectedVideoTitle || `YouTube ID: ${selectedVideoId}`}</strong>
                    <small>ID: {selectedVideoId}</small>
                  </div>
                </div>
              ) : (
                <div className="video-empty-info">
                  <p>Belum ada video yang aktif untuk lagu ini.</p>
                  <button type="button" onClick={() => setActiveTab("search")}>CARI DI YOUTUBE ↗</button>
                </div>
              )}

              {/* Dimming Slider */}
              <div className="video-control-box">
                <div className="control-label-row">
                  <span>KEGELAPAN LATAR (DIMMING):</span>
                  <b>{dim}%</b>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="5"
                  value={dim}
                  onChange={(e) => setDim(Number(e.target.value))}
                />
                <div className="dim-presets">
                  <button type="button" onClick={() => setDim(25)}>25% (Terang)</button>
                  <button type="button" onClick={() => setDim(45)}>45% (Rekomendasi)</button>
                  <button type="button" onClick={() => setDim(65)}>65% (Fokus)</button>
                  <button type="button" onClick={() => setDim(85)}>85% (Sangat Gelap)</button>
                </div>
              </div>

              {/* Offset Calibration */}
              <div className="video-control-box">
                <div className="control-label-row">
                  <span>SINKRONISASI OFFSET VIDEO:</span>
                  <b>{offset > 0 ? `+${offset}` : offset} ms</b>
                </div>
                <p className="offset-tip">
                  Jika visual video mendahului audio stem, geser offset ke (+) plus. Jika video telat, geser ke (-) minus.
                </p>
                <div className="offset-btn-grid">
                  <button type="button" onClick={() => setOffset((p) => p - 1000)}>-1.0s</button>
                  <button type="button" onClick={() => setOffset((p) => p - 500)}>-500ms</button>
                  <button type="button" onClick={() => setOffset((p) => p - 100)}>-100ms</button>
                  <button type="button" onClick={() => setOffset(0)}>RESET 0ms</button>
                  <button type="button" onClick={() => setOffset((p) => p + 100)}>+100ms</button>
                  <button type="button" onClick={() => setOffset((p) => p + 500)}>+500ms</button>
                  <button type="button" onClick={() => setOffset((p) => p + 1000)}>+1.0s</button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SEARCH */}
          {activeTab === "search" && (
            <div className="video-search-view">
              <form className="video-search-form" onSubmit={handleSearch}>
                <input
                  type="text"
                  placeholder="Cari lagu / artis di YouTube..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" disabled={searching}>
                  {searching ? "Mencari..." : "CARI ↗"}
                </button>
              </form>

              <div className="video-search-results">
                {searchResults.map((result) => {
                  const isSelected = selectedVideoId === result.videoId;
                  return (
                    <div
                      key={result.videoId}
                      className={`video-search-row ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedVideoId(result.videoId);
                        setSelectedVideoTitle(result.title);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={result.thumbnailUrl || `https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`}
                        alt={result.title}
                        className="video-row-thumb"
                      />
                      <div className="video-row-meta">
                        <span className="video-row-title">{result.title}</span>
                        <span className="video-row-author">{result.author}</span>
                        {result.durationText && <span className="video-row-dur">{result.durationText}</span>}
                      </div>
                      <button
                        type="button"
                        className={`video-row-select-btn ${isSelected ? "active" : ""}`}
                      >
                        {isSelected ? "TERPILIH ✓" : "PILIH"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: PASTE */}
          {activeTab === "paste" && (
            <div className="video-paste-view">
              <label>TEMPEL LINK / URL VIDEO YOUTUBE:</label>
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
              />
              <button
                type="button"
                className="video-apply-paste-btn"
                onClick={handlePasteUrl}
                disabled={!customInput.trim()}
              >
                Gunakan Video Ini ↗
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="video-modal-footer">
          <button
            type="button"
            className="video-save-global-btn"
            onClick={handleSaveGlobal}
            disabled={savingGlobal || !selectedVideoId}
            title="Simpan video ini ke database global Firestore agar semua orang otomatis memilikinya!"
          >
            {savingGlobal ? "Menyimpan Global..." : "Simpan Global Firestore"}
          </button>
          <button
            type="button"
            className="video-done-btn"
            onClick={handleApply}
          >
            Terapkan & Tutup <span>✓</span>
          </button>
        </div>
      </div>
    </div>
  );
}
