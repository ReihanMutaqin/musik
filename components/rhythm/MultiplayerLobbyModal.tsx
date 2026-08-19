"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/firebase/auth";
import {
  createMultiplayerRoom,
  joinMultiplayerRoom,
  leaveRoom,
  startRoomMatch,
  subscribeRoom,
  updatePlayerSlot,
  updateRoomDifficulty,
  type MultiplayerMode,
  type MultiplayerRoom,
  type RoomPlayer,
} from "@/lib/firebase/multiplayer";
import {
  subscribeToFriends,
  sendRoomInvite,
  type FriendRecord,
} from "@/lib/firebase/friends";
import type { Difficulty, ImportedSong, Instrument } from "@/lib/rhythm/types";

type MultiplayerLobbyModalProps = {
  selectedSong?: ImportedSong;
  onEnsureSongLoaded?: (title: string, artist: string, md5?: string, roomCode?: string) => Promise<void>;
  onStartMatch: (room: MultiplayerRoom) => void;
  onClose: () => void;
};

type InAppToast = {
  title: string;
  message: string;
  type: "info" | "warning" | "error";
};

export function MultiplayerLobbyModal({ selectedSong, onEnsureSongLoaded, onStartMatch, onClose }: MultiplayerLobbyModalProps) {
  const { user } = useAuth();
  const [view, setView] = useState<"menu" | "create" | "join" | "room">("menu");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [mode, setMode] = useState<MultiplayerMode>("duel");
  const [hostDifficulty, setHostDifficulty] = useState<Difficulty>("expert");
  const [currentRoom, setCurrentRoom] = useState<MultiplayerRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<InAppToast | null>(null);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitedUids, setInvitedUids] = useState<Set<string>>(new Set());
  const lastEnsuredSongRef = useRef<string>("");

  // Subscribe to user's friends list
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToFriends(user.uid, setFriends);
    return () => unsub();
  }, [user?.uid]);

  const showToast = (t: InAppToast) => {
    setToast(t);
    setTimeout(() => setToast(null), 4500);
  };

  // Subscribe to real-time updates when in a room
  useEffect(() => {
    if (!currentRoom?.id) return;

    const unsubscribe = subscribeRoom(currentRoom.id, (updatedRoom) => {
      if (!updatedRoom) {
        showToast({
          title: "LOBBY DIBUBARKAN",
          message: "Host telah menutup room pertandingan.",
          type: "warning",
        });
        setCurrentRoom(null);
        setView("menu");
        return;
      }

      setCurrentRoom(updatedRoom);

      const songKey = `${updatedRoom.id}:${updatedRoom.songName}:${updatedRoom.songArtist}:${updatedRoom.songMd5 || ""}`;
      if (updatedRoom.songName && onEnsureSongLoaded && lastEnsuredSongRef.current !== songKey) {
        lastEnsuredSongRef.current = songKey;
        void onEnsureSongLoaded(updatedRoom.songName, updatedRoom.songArtist, updatedRoom.songMd5, updatedRoom.id);
      }

      // If room status is loading, countdown, or playing, transition all players to GameStage for synchronized start!
      if (
        updatedRoom.status === "loading" ||
        updatedRoom.status === "countdown" ||
        updatedRoom.status === "playing"
      ) {
        onStartMatch(updatedRoom);
      }
    });

    return () => unsubscribe();
  }, [currentRoom?.id, onEnsureSongLoaded, onStartMatch]);

  if (!user) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSong) {
      setError("Pilih lagu terlebih dahulu di menu utama sebelum membuat room.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const isDemoSong = selectedSong.id === "training-demo" || selectedSong.metadata.title.toLowerCase().includes("different");
      const songMd5 = isDemoSong ? "DEMO_BAND_MAID_DIFFERENT" : (selectedSong.metadata as any).md5 || "";
      const code = await createMultiplayerRoom(
        user,
        {
          title: selectedSong.metadata.title,
          artist: selectedSong.metadata.artist,
          md5: songMd5,
        },
        mode,
        hostDifficulty,
        mode === "duel" ? 2 : 5
      );
      setCurrentRoom({
        id: code,
        hostId: user.uid,
        songName: selectedSong.metadata.title,
        songArtist: selectedSong.metadata.artist,
        mode,
        difficulty: hostDifficulty,
        status: "lobby",
        maxPlayers: mode === "duel" ? 2 : 5,
        players: {
          [user.uid]: {
            uid: user.uid,
            displayName: user.displayName || "Host Rocker",
            photoURL: user.photoURL || "",
            instrument: "guitar",
            difficulty: hostDifficulty,
            ready: true,
            loaded: false,
            liveScore: 0,
            liveCombo: 0,
            finished: false,
          },
        },
        createdAt: Date.now(),
      });
      setView("room");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal membuat room.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setError("");
    try {
      const joined = await joinMultiplayerRoom(code, user);
      setCurrentRoom(joined);
      setView("room");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal bergabung ke room.");
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    if (currentRoom) {
      await leaveRoom(currentRoom.id, user.uid, currentRoom.hostId === user.uid);
      setCurrentRoom(null);
    }
    setView("menu");
  };

  const handleToggleReady = async () => {
    if (!currentRoom) return;
    const me = currentRoom.players[user.uid];
    if (!me) return;
    if (me.downloadStatus !== "ready") {
      showToast({
        title: "MEMUAT LAGU...",
        message: "Tunggu partitur & audio lagu selesai dimuat (100%) sebelum READY.",
        type: "warning",
      });
      return;
    }
    await updatePlayerSlot(currentRoom.id, user.uid, { ready: !me.ready });
  };

  const handleInstrumentChange = async (instrument: Instrument) => {
    if (!currentRoom) return;
    await updatePlayerSlot(currentRoom.id, user.uid, { instrument });
  };

  const handleHostDifficultyChange = async (difficulty: Difficulty) => {
    setHostDifficulty(difficulty);
    if (currentRoom && currentRoom.hostId === user.uid) {
      await updateRoomDifficulty(currentRoom.id, difficulty);
    }
  };

  const handleStartMatch = async () => {
    if (!currentRoom || currentRoom.hostId !== user.uid) return;
    // Host initiates synchronized match loading: sets status to 'loading'
    await startRoomMatch(currentRoom.id);
  };

  const copyCode = () => {
    if (currentRoom) {
      void navigator.clipboard.writeText(currentRoom.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isHost = currentRoom?.hostId === user.uid;
  const playersList: RoomPlayer[] = currentRoom ? Object.values(currentRoom.players) : [];
  const downloadingPlayer = playersList.find((p) => p.downloadStatus === "downloading");
  const isAnyDownloading = Boolean(downloadingPlayer);
  const allSongsReady = playersList.length > 0 && playersList.every((p) => p.downloadStatus === "ready");
  const allReady = allSongsReady && playersList.every((p) => p.ready);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="multiplayer-modal professional-theme" onClick={(e) => e.stopPropagation()}>
        {/* IN-APP SLEEK NOTIFICATION TOAST */}
        {toast && (
          <div className={`in-app-toast ${toast.type}`}>
            <div className="toast-icon">{toast.type === "warning" ? "⚠️" : "ℹ️"}</div>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              <small>{toast.message}</small>
            </div>
            <button type="button" className="toast-close" onClick={() => setToast(null)}>✕</button>
          </div>
        )}

        <header className="mp-header">
          <div className="mp-header-copy">
            <div className="lb-header-top-row">
              <span className="mp-pro-badge">MULTIPLAYER ARENA</span>
              <span className="lb-live-indicator">P2P REALTIME</span>
            </div>
            <h2>{view === "room" ? `LOBBY: ${currentRoom?.id}` : "Arena Pertandingan"}</h2>
            <p>{view === "room" ? `${currentRoom?.songArtist} — ${currentRoom?.songName}` : "Tantang teman dalam 1v1 Duel, Band Co-op (Gitar + Bass), atau FFA Battle"}</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={view === "room" ? handleLeave : onClose} aria-label="Close modal">
            ✕
          </button>
        </header>

        {error && <div className="mp-error-banner">{error}</div>}

        {/* VIEW 1: MENU (CREATE OR JOIN) */}
        {view === "menu" && (
          <div className="mp-menu-grid">
            <div className="mp-menu-card" onClick={() => setView("create")}>
              <div className="card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z" />
                </svg>
              </div>
              <h3>HOST ROOM BARU</h3>
              <p>Buat room 1v1, Band Co-op (1 Lead Gitar + 1 Bass), atau FFA Battle dengan lagu pilihanmu.</p>
              <button type="button" className="mp-action-btn primary">BUAT ROOM ↗</button>
            </div>
            <div className="mp-menu-card" onClick={() => setView("join")}>
              <div className="card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <h3>GABUNG VIA KODE</h3>
              <p>Masukkan kode room (contoh: RIFF-8A9X) dari temanmu untuk langsung masuk ke lobby.</p>
              <button type="button" className="mp-action-btn secondary">GABUNG ROOM ↗</button>
            </div>
          </div>
        )}

        {/* VIEW 2: CREATE ROOM CONFIG */}
        {view === "create" && (
          <form className="mp-form-wrap" onSubmit={handleCreate}>
            <div className="mp-form-group">
              <label>LAGU YANG AKAN DIMAINKAN</label>
              <div className="mp-song-preview-box">
                <strong>{selectedSong?.metadata.title || "Belum ada lagu dipilih"}</strong>
                <small>{selectedSong?.metadata.artist || "Pilih lagu di menu utama terlebih dahulu"}</small>
              </div>
            </div>

            <div className="mp-form-group">
              <label>MODE PERMAINAN</label>
              <div className="mp-mode-picker">
                <button
                  type="button"
                  className={`mode-btn ${mode === "duel" ? "active" : ""}`}
                  onClick={() => setMode("duel")}
                >
                  <b>1v1 DUEL</b>
                  <small>Head-to-head score duel (2 pemain)</small>
                </button>
                <button
                  type="button"
                  className={`mode-btn ${mode === "band" ? "active" : ""}`}
                  onClick={() => setMode("band")}
                >
                  <b>BAND CO-OP</b>
                  <small>1 Lead Gitar + 1 Bass kolaborasi</small>
                </button>
                <button
                  type="button"
                  className={`mode-btn ${mode === "ffa" ? "active" : ""}`}
                  onClick={() => setMode("ffa")}
                >
                  <b>FFA BATTLE</b>
                  <small>Kompetisi hingga 5 pemain sekaligus</small>
                </button>
              </div>
            </div>

            <div className="mp-form-group">
              <label>TINGKAT KESULITAN ROOM (DITETAPKAN HOST)</label>
              <div className="mp-mode-picker difficulty-picker">
                {(["expert", "hard", "medium", "easy"] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`mode-btn ${hostDifficulty === d ? "active" : ""}`}
                    onClick={() => setHostDifficulty(d)}
                  >
                    <b>{d.toUpperCase()}</b>
                  </button>
                ))}
              </div>
              <small className="mp-hint-text">
                Semua pemain yang bergabung akan otomatis bermain di tingkat kesulitan ini.
              </small>
            </div>

            <div className="mp-form-actions">
              <button type="button" className="mp-action-btn secondary" onClick={() => setView("menu")}>
                KEMBALI
              </button>
              <button type="submit" className="mp-action-btn primary" disabled={loading || !selectedSong}>
                {loading ? "MEMBUAT ROOM…" : "BUAT ROOM SEKARANG ↗"}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 3: JOIN VIA CODE */}
        {view === "join" && (
          <form className="mp-form-wrap" onSubmit={handleJoin}>
            <div className="mp-form-group">
              <label>MASUKKAN KODE ROOM</label>
              <input
                type="text"
                className="mp-code-input"
                placeholder="CONTOH: RIFF-8A9X"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div className="mp-form-actions">
              <button type="button" className="mp-action-btn secondary" onClick={() => setView("menu")}>
                KEMBALI
              </button>
              <button type="submit" className="mp-action-btn primary" disabled={loading || !roomCodeInput.trim()}>
                {loading ? "MENGHUBUNGKAN…" : "GABUNG ROOM ↗"}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 4: INSIDE ROOM LOBBY */}
        {view === "room" && currentRoom && (
          <div className="mp-room-lobby">
            {/* Room Code & Invite Bar */}
            <div className="room-info-bar">
              <div className="code-pill" onClick={copyCode} title="Klik untuk salin kode room">
                <span>KODE:</span>
                <strong>{currentRoom.id}</strong>
                <small>{copied ? "✓ TERSALIN!" : "SALIN"}</small>
              </div>

              <div className="room-info-right-actions">
                <button
                  type="button"
                  className="mp-invite-friends-btn"
                  onClick={() => setShowInviteModal(true)}
                  title="Undang teman dari daftar temanmu langsung ke arena ini"
                >
                  <span>⚡ UNDANG TEMAN</span>
                </button>

                <div className="mode-badge-pill">
                  MODE: {currentRoom.mode.toUpperCase()} ({playersList.length}/{currentRoom.maxPlayers} PEMAIN)
                </div>
              </div>
            </div>

            {/* Host Difficulty Control Bar */}
            <div className="mp-difficulty-control-bar">
              <div className="diff-control-label">
                <span>KESULITAN ROOM:</span>
                <strong>{(currentRoom.difficulty || "expert").toUpperCase()}</strong>
                {isHost ? <small>(Klik untuk mengubah)</small> : <small>(Ditetapkan oleh Host)</small>}
              </div>

              {isHost ? (
                <div className="diff-btn-group">
                  {(["easy", "medium", "hard", "expert"] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`diff-toggle-btn ${(currentRoom.difficulty || "expert") === d ? "active" : ""}`}
                      onClick={() => void handleHostDifficultyChange(d)}
                    >
                      {d.toUpperCase()}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="diff-guest-badge">
                  {(currentRoom.difficulty || "expert").toUpperCase()} (LOCKED BY HOST)
                </span>
              )}
            </div>

            {/* Real-time Song Downloading Warning/Status Banner */}
            {isAnyDownloading && (
              <div className="mp-downloading-banner">
                <div className="spinner-orbit" style={{ width: 14, height: 14 }} />
                <span>
                  {downloadingPlayer?.uid === user.uid
                    ? `Kamu sedang mengunduh file lagu... ${downloadingPlayer.downloadProgress ? `(${downloadingPlayer.downloadProgress}%)` : ""}`
                    : `${downloadingPlayer?.displayName} sedang mengunduh lagu... ${downloadingPlayer?.downloadProgress ? `(${downloadingPlayer?.downloadProgress}%)` : ""}`}
                </span>
              </div>
            )}

            {/* Connected Players Grid */}
            <div className="room-players-grid">
              {playersList.map((player) => {
                const isMe = player.uid === user.uid;
                return (
                  <div key={player.uid} className={`player-slot-card ${player.ready ? "is-ready" : ""} ${isMe ? "is-me" : ""}`}>
                    <div className="player-top">
                      {player.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={player.photoURL} alt={player.displayName} className="player-avatar" />
                      ) : (
                        <div className="player-avatar-fallback">{player.displayName.charAt(0).toUpperCase()}</div>
                      )}
                      <div className="player-name-wrap">
                        <strong>{player.displayName} {isMe && "(Kamu)"}</strong>
                        {player.uid === currentRoom.hostId && <span className="host-tag">HOST</span>}
                      </div>

                      {/* Download Status Badge on Player Card */}
                      {player.downloadStatus === "downloading" ? (
                        <span className="ready-badge downloading">
                          ⬇️ NGUNDUH {player.downloadProgress ? `${player.downloadProgress}%` : ""}
                        </span>
                      ) : (
                        <span className={`ready-badge ${player.ready ? "ready" : "waiting"}`}>
                          {player.ready ? "READY ✓" : "MENUNGGU…"}
                        </span>
                      )}
                    </div>

                    <div className="player-settings-row">
                      {isMe ? (
                        <div className="player-instrument-picker">
                          <label>PILIH INSTRUMEN:</label>
                          <select
                            className="mp-select"
                            value={player.instrument}
                            onChange={(e) => void handleInstrumentChange(e.target.value as Instrument)}
                          >
                            <option value="guitar">Lead Guitar</option>
                            <option value="bass">Bass</option>
                            <option value="drums">Drums</option>
                            <option value="keys">Keys</option>
                          </select>
                        </div>
                      ) : (
                        <div className="player-readonly-tags">
                          <span className="inst-pill">{player.instrument.toUpperCase()}</span>
                          <span className="diff-pill">{(currentRoom.difficulty || player.difficulty).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Control Buttons */}
            <div className="room-footer-controls">
              <button type="button" className="mp-action-btn secondary" onClick={handleLeave}>
                KELUAR LOBBY
              </button>

              <button
                type="button"
                className={`mp-action-btn ${currentRoom.players[user.uid]?.ready ? "ready-active" : "primary"}`}
                disabled={currentRoom.players[user.uid]?.downloadStatus === "downloading" || currentRoom.players[user.uid]?.downloadStatus === "failed"}
                onClick={handleToggleReady}
              >
                {currentRoom.players[user.uid]?.downloadStatus === "downloading"
                  ? `MENGUNDUH LAGU (${currentRoom.players[user.uid]?.downloadProgress || 0}%)`
                  : currentRoom.players[user.uid]?.downloadStatus === "failed"
                  ? "GAGAL UNDUH ✕"
                  : currentRoom.players[user.uid]?.ready
                  ? "BATALKAN READY"
                  : "SIAP / READY ✓"}
              </button>

              {isHost && (
                <button
                  type="button"
                  className="mp-action-btn launch"
                  disabled={!allReady || playersList.length < 1 || isAnyDownloading || !allSongsReady}
                  onClick={handleStartMatch}
                  title={
                    !allSongsReady
                      ? "Menunggu semua pemain selesai memuat lagu yang sama..."
                      : !allReady
                      ? "Menunggu semua pemain klik READY"
                      : "Mulai pertandingan!"
                  }
                >
                  {!allSongsReady
                    ? "MENUNGGU SINKRONISASI LAGU…"
                    : !allReady
                    ? "MENUNGGU SEMUA READY…"
                    : "MULAI PERTANDINGAN ▶"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* IN-LOBBY INVITE FRIENDS MODAL OVERLAY */}
        {showInviteModal && currentRoom && (
          <div className="mp-inlobby-invite-overlay" onClick={() => setShowInviteModal(false)}>
            <div className="mp-inlobby-invite-card" onClick={(e) => e.stopPropagation()}>
              <div className="invite-card-header">
                <div>
                  <strong>UNDANG TEMAN KE ARENA</strong>
                  <small>Kirim ajakan bermain langsung ke teman</small>
                </div>
                <button type="button" className="invite-close-btn" onClick={() => setShowInviteModal(false)}>✕</button>
              </div>

              <div className="invite-friends-list">
                {friends.length === 0 ? (
                  <div className="invite-empty-state">
                    <p>Belum ada teman di daftar temanmu.</p>
                    <small>Buka menu Friends di navigasi atas untuk mencari pemain & menambah teman.</small>
                  </div>
                ) : (
                  friends.map((f) => {
                    const isAlreadyInRoom = Boolean(currentRoom.players[f.uid]);
                    const isInvited = invitedUids.has(f.uid);

                    return (
                      <div key={f.uid} className="invite-friend-row">
                        <div className="friend-info-left">
                          {f.photoURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.photoURL} alt={f.displayName} className="friend-mini-avatar" />
                          ) : (
                            <div className="friend-mini-avatar-fallback">{f.displayName.charAt(0).toUpperCase()}</div>
                          )}
                          <div className="friend-names">
                            <b>{f.displayName}</b>
                            <small>@{f.username}</small>
                          </div>
                        </div>

                        {isAlreadyInRoom ? (
                          <span className="in-room-badge">DI ROOM ✓</span>
                        ) : (
                          <button
                            type="button"
                            className={`invite-action-btn ${isInvited ? "sent" : ""}`}
                            disabled={isInvited}
                            onClick={async () => {
                              try {
                                await sendRoomInvite(user, f.uid, currentRoom.id, currentRoom.songName, currentRoom.songArtist);
                                setInvitedUids((prev) => new Set([...prev, f.uid]));
                                showToast({
                                  title: "UNDANGAN TERKIRIM",
                                  message: `Undangan bermain telah dikirim ke ${f.displayName}`,
                                  type: "info",
                                });
                              } catch (err) {
                                console.error("Send invite error:", err);
                              }
                            }}
                          >
                            {isInvited ? "TERKIRIM ✓" : "INVITE ✉️"}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="invite-card-footer">
                <button
                  type="button"
                  className="copy-link-btn"
                  onClick={() => {
                    const url = `${window.location.origin}?room=${currentRoom.id}`;
                    void navigator.clipboard.writeText(url);
                    showToast({
                      title: "LINK TERSALIN",
                      message: "Tautan direct room telah disalin ke clipboard!",
                      type: "info",
                    });
                  }}
                >
                  🔗 SALIN LINK DIRECT ({currentRoom.id})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
