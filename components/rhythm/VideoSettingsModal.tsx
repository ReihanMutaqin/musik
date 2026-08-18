"use client";

import React, { useState } from "react";
import { extractYouTubeVideoId, saveGlobalSongVideo } from "@/lib/video/youtube";
import { useAuth } from "@/lib/firebase/auth";

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
  onUpdateVideo: (videoId: string | null, offsetMs: number, dimPercent: number, enabled: boolean, title?: string) => void;
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
  onUpdateVideo,
  onClose,
}: VideoSettingsModalProps) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(videoEnabled);
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
      onUpdateVideo(id, offset, dim, enabled, "Custom YouTube Video");
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
        selectedVideoTitle
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
    onUpdateVideo(selectedVideoId, offset, dim, enabled, selectedVideoTitle);
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
            ⚙️ Pengaturan & Offset
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
              {/* Toggle switch */}
              <div className="video-toggle-row">
                <div>
                  <strong>AKTIFKAN VIDEO BACKGROUND</strong>
                  <p>Memutar video musik tersinkron di belakang highway</p>
                </div>
                <button
                  type="button"
                  className={`video-toggle-switch ${enabled ? "active" : ""}`}
                  onClick={() => setEnabled(!enabled)}
                >
                  {enabled ? "ON ✓" : "OFF"}
                </button>
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
                  {offset < 0
                    ? "Video dimajukan (muncul lebih awal daripada audio)."
                    : offset > 0
                    ? "Video ditunda (muncul lebih lambat daripada audio)."
                    : "Offset netral 0ms."}
                </p>
                <div className="offset-btn-grid">
                  <button type="button" onClick={() => setOffset((p) => p - 1000)}>-1.0s</button>
                  <button type="button" onClick={() => setOffset((p) => p - 500)}>-500ms</button>
                  <button type="button" onClick={() => setOffset((p) => p - 100)}>-100ms</button>
                  <button type="button" onClick={() => setOffset(0)}>RESET 0</button>
                  <button type="button" onClick={() => setOffset((p) => p + 100)}>+100ms</button>
                  <button type="button" onClick={() => setOffset((p) => p + 500)}>+500ms</button>
                  <button type="button" onClick={() => setOffset((p) => p + 1000)}>+1.0s</button>
                </div>
                <input
                  type="range"
                  min="-5000"
                  max="5000"
                  step="50"
                  value={offset}
                  onChange={(e) => setOffset(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* TAB 2: SEARCH YOUTUBE */}
          {activeTab === "search" && (
            <div className="video-search-view">
              <form className="video-search-form" onSubmit={handleSearch}>
                <input
                  type="text"
                  placeholder="Ketik judul lagu atau artis..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" disabled={searching}>
                  {searching ? "Mencari..." : "CARI ↗"}
                </button>
              </form>

              <div className="video-search-results">
                {searching ? (
                  <div className="video-loading">Mencari video musik di YouTube...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((item) => {
                    const isSelected = selectedVideoId === item.videoId;
                    return (
                      <div
                        key={item.videoId}
                        className={`video-search-row ${isSelected ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedVideoId(item.videoId);
                          setSelectedVideoTitle(item.title);
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnailUrl || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`}
                          alt={item.title}
                          className="video-row-thumb"
                        />
                        <div className="video-row-meta">
                          <strong className="video-row-title">{item.title}</strong>
                          <span className="video-row-author">{item.author}</span>
                          {item.durationText && <small className="video-row-dur">{item.durationText}</small>}
                        </div>
                        <button type="button" className={`video-row-select-btn ${isSelected ? "active" : ""}`}>
                          {isSelected ? "TERPILIH ✓" : "PILIH"}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="video-empty">Belum ada hasil pencarian.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PASTE CUSTOM LINK */}
          {activeTab === "paste" && (
            <div className="video-paste-view">
              <label htmlFor="custom-yt-input">Link Video YouTube:</label>
              <input
                id="custom-yt-input"
                type="url"
                placeholder="https://www.youtube.com/watch?v=... atau https://youtu.be/..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
              />
              <button type="button" className="video-apply-paste-btn" onClick={handlePasteUrl}>
                GUNAKAN VIDEO INI ↗
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="video-modal-footer">
          <button
            type="button"
            className="video-save-global-btn"
            disabled={!selectedVideoId || savingGlobal}
            onClick={handleSaveGlobal}
            title="Simpan video musik ini ke database global Firestore agar semua orang otomatis dapat video ini!"
          >
            {savingGlobal ? "Menyimpan Global..." : "💾 Simpan Global ke Firestore"}
          </button>
          <button type="button" className="video-done-btn" onClick={handleApply}>
            Terapkan & Main <span>✓</span>
          </button>
        </div>
      </div>
    </div>
  );
}
