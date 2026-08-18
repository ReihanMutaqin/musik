"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/firebase/auth";
import { importRhythmFile } from "@/lib/rhythm/importer";
import { createTrainingSong } from "@/lib/rhythm/demo";
import type { Difficulty, ImportedSong, Instrument } from "@/lib/rhythm/types";
import {
  subscribeToIncomingFriendRequests,
  subscribeToIncomingRoomInvites,
  respondToRoomInvite,
  type MultiplayerInvite,
} from "@/lib/firebase/friends";
import {
  joinMultiplayerRoom,
  type MultiplayerRoom,
} from "@/lib/firebase/multiplayer";
import { GameStage } from "./GameStage";
import { MultiplayerLobbyModal } from "./MultiplayerLobbyModal";
import { LeaderboardModal } from "./LeaderboardModal";
import { FriendsModal } from "@/components/social/FriendsModal";
import { ProfileModal } from "@/components/profile/ProfileModal";

const difficultyLabels: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

const instrumentLabels: Record<Instrument, string> = {
  guitar: "Lead",
  bass: "Bass",
  rhythm: "Rhythm",
  drums: "Drums",
  keys: "Keys",
  other: "Other",
};

function RiffMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`riff-mark ${compact ? "is-compact" : ""}`} aria-label="Riff Lab">
      <span>R</span><i /><i /><i />
      {!compact && <b>RIFF<br />LAB</b>}
    </div>
  );
}

function UploadGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 33V8m0 0-9 9m9-9 9 9M8 30v9h32v-9" />
    </svg>
  );
}

function formatDuration(milliseconds: number) {
  const seconds = Math.round(milliseconds / 1000);
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function defaultChart(song: ImportedSong) {
  return song.charts.find((chart) => chart.instrument === "guitar" && chart.difficulty === "expert")
    ?? song.charts.find((chart) => chart.instrument === "guitar")
    ?? song.charts[0];
}

function LandingHighway() {
  const noteData = [
    { lane: 0, top: 69, delay: "-1.7s" },
    { lane: 3, top: 54, delay: "-.8s" },
    { lane: 1, top: 43, delay: "-2.6s" },
    { lane: 4, top: 31, delay: "-1.1s" },
    { lane: 2, top: 19, delay: "-2.2s" },
    { lane: 0, top: 8, delay: "-.3s" },
  ];
  return (
    <div className="landing-visual" aria-hidden="true">
      <div className="visual-status"><span>LIVE INPUT</span><b>120 FPS</b></div>
      <div className="visual-score">004<span>×</span></div>
      <div className="demo-highway">
        <div className="highway-grid">
          {[0, 1, 2, 3, 4, 5].map((line) => <i key={line} style={{ left: `${line * 20}%` }} />)}
        </div>
        {noteData.map((note, index) => (
          <b
            key={index}
            className={`demo-note lane-${note.lane}`}
            style={{ left: `${note.lane * 20 + 10}%`, top: `${note.top}%`, animationDelay: note.delay }}
          />
        ))}
        <div className="demo-hitline">
          {[0, 1, 2, 3, 4].map((lane) => <span key={lane} className={`lane-${lane}`} />)}
        </div>
      </div>
      <div className="visual-caption"><span>5 FRET ENGINE</span><em>LOCAL / PRIVATE</em></div>
    </div>
  );
}

export function RhythmLab() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [songs, setSongs] = useState<ImportedSong[]>([]);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [selectedChartId, setSelectedChartId] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<"landing" | "setup" | "game">("landing");
  const [speed, setSpeed] = useState(1);
  const [offsetMs, setOffsetMs] = useState(0);
  const [inputMode, setInputMode] = useState<"tap" | "strum">("tap");

  // Modals state
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [multiplayerMatchRoom, setMultiplayerMatchRoom] = useState<MultiplayerRoom | null>(null);

  // Social alerts state
  const [incomingRequestsCount, setIncomingRequestsCount] = useState(0);
  const [incomingInvites, setIncomingInvites] = useState<MultiplayerInvite[]>([]);

  // Subscribe to real-time friend requests & room invites
  useEffect(() => {
    if (!user) {
      setIncomingRequestsCount(0);
      setIncomingInvites([]);
      return;
    }
    const unsubReqs = subscribeToIncomingFriendRequests(user.uid, (reqs) => {
      setIncomingRequestsCount(reqs.length);
    });
    const unsubInvites = subscribeToIncomingRoomInvites(user.uid, (invites) => {
      setIncomingInvites(invites);
    });
    return () => {
      unsubReqs();
      unsubInvites();
    };
  }, [user]);

  const selectedSong = songs.find((song) => song.id === selectedSongId) ?? songs[0];
  const selectedChart = selectedSong?.charts.find((chart) => chart.id === selectedChartId)
    ?? (selectedSong ? defaultChart(selectedSong) : undefined);
  const activeInstrument = selectedChart?.instrument;
  const instruments = useMemo(
    () => selectedSong ? [...new Set(selectedSong.charts.map((chart) => chart.instrument))] : [],
    [selectedSong],
  );

  const artBlob = selectedSong?.artwork?.blob;
  const artUrl = useMemo(() => artBlob ? URL.createObjectURL(artBlob) : "", [artBlob]);

  useEffect(() => () => {
    if (artUrl) URL.revokeObjectURL(artUrl);
  }, [artUrl]);

  const chooseSong = (song: ImportedSong) => {
    const chart = defaultChart(song);
    setSelectedSongId(song.id);
    setSelectedChartId(chart.id);
  };

  const loadTraining = () => {
    const training = createTrainingSong();
    setSongs([training]);
    chooseSong(training);
    setScreen("setup");
  };

  const processFile = async (file?: File) => {
    if (!file) return;
    setDragging(false);
    setLoading(true);
    setError("");
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const imported = await importRhythmFile(file);
      setSongs(imported);
      chooseSong(imported[0]);
      setScreen("setup");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Paket tidak dapat dibaca.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const chooseInstrument = (instrument: Instrument) => {
    if (!selectedSong) return;
    const next = selectedSong.charts.find((chart) => chart.instrument === instrument && chart.difficulty === selectedChart?.difficulty)
      ?? selectedSong.charts.find((chart) => chart.instrument === instrument);
    if (next) setSelectedChartId(next.id);
  };

  const chooseDifficulty = (difficulty: Difficulty) => {
    if (!selectedSong || !selectedChart) return;
    const next = selectedSong.charts.find((chart) => chart.instrument === selectedChart.instrument && chart.difficulty === difficulty);
    if (next) setSelectedChartId(next.id);
  };

  const handleStartMultiplayerMatch = (room: MultiplayerRoom) => {
    setMultiplayerMatchRoom(room);
    setShowMultiplayer(false);
    setScreen("game");
  };

  if (screen === "game" && selectedSong && (selectedChart || selectedSong.charts[0])) {
    return (
      <GameStage
        song={selectedSong}
        chart={selectedChart || selectedSong.charts[0]}
        speed={speed}
        offsetMs={offsetMs}
        inputMode={inputMode}
        multiplayerRoom={multiplayerMatchRoom || undefined}
        onExit={() => {
          setMultiplayerMatchRoom(null);
          setScreen("setup");
        }}
      />
    );
  }

  return (
    <main className={`riff-shell ${dragging ? "is-dragging" : ""}`}>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept=".sng,.zip,application/zip"
        onChange={(event) => void processFile(event.target.files?.[0])}
      />

      <header className="riff-header">
        <button className="brand-button" type="button" onClick={() => setScreen("landing")}>
          <RiffMark />
        </button>
        <div className="header-center"><span>REIHAN.ONLINE</span><i /> <span>RHYTHM SYSTEM 01</span></div>
        <div className="header-actions">
          <button type="button" onClick={() => setShowMultiplayer(true)}>MULTIPLAYER ⚔️</button>
          <button type="button" onClick={() => setShowLeaderboard(true)}>LEADERBOARD 🏆</button>
          <button type="button" onClick={() => setShowFriendsModal(true)}>
            FRIENDS {incomingRequestsCount > 0 && <span className="header-badge">{incomingRequestsCount}</span>}
          </button>
          <button type="button" onClick={() => setShowProfileModal(true)}>
            {user ? user.displayName?.split(" ")[0]?.toUpperCase() || "PROFIL" : "LOGIN"}
          </button>
          <button type="button" onClick={() => inputRef.current?.click()}>IMPORT <span>＋</span></button>
        </div>
      </header>

      {screen === "landing" ? (
        <>
          <section className="landing-grid">
            <div className="landing-copy">
              <p className="eyebrow"><span>01</span> BROWSER RHYTHM LAB</p>
              <h1>DROP A PACK.<br />HIT THE <em>NIGHT.</em></h1>
              <p className="landing-lede">
                Mainkan chart 5-fret langsung di browser. Bawa file <strong>.SNG</strong> atau <strong>.ZIP</strong> dari koleksimu—tanpa instalasi, tanpa upload ke server.
              </p>
              <div className="landing-actions">
                <button className="primary-action" type="button" onClick={() => inputRef.current?.click()}>
                  <UploadGlyph />
                  <span><b>{loading ? "UNPACKING…" : "IMPORT SONG PACK"}</b><small>.SNG / .ZIP · MAX 800 MB</small></span>
                  <em>↗</em>
                </button>
                <button className="secondary-action" type="button" onClick={loadTraining}>
                  Try training riff <span>▶</span>
                </button>
              </div>
              {error && <div className="import-error" role="alert"><b>IMPORT INTERRUPTED</b><span>{error}</span></div>}
            </div>
            <LandingHighway />
          </section>

          <section
            className="drop-deck"
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); void processFile(event.dataTransfer.files?.[0]); }}
          >
            <div className="drop-index">[ DROPZONE ]</div>
            <div className="drop-title"><UploadGlyph /><strong>{dragging ? "RELEASE TO LOAD" : "DRAG YOUR SONG HERE"}</strong></div>
            <p>Chart, metadata, artwork, dan audio dibaca <b>lokal di perangkatmu.</b></p>
            <div className="format-ticker" aria-label="Supported formats">
              <span>SNGPKG v1</span><i />
              <span>CHORUS ZIP</span><i />
              <span>NOTES.CHART</span><i />
              <span>NOTES.MID</span><i />
              <span>OPUS / OGG / MP3 / WAV</span>
            </div>
          </section>

          <section className="flow-section">
            <div className="section-heading">
              <span>ZERO-INSTALL WORKFLOW</span>
              <h2>FROM DOWNLOAD<br />TO <em>DOWNBEAT.</em></h2>
            </div>
            <div className="flow-steps">
              <article><span>01</span><div><b>FIND</b><p>Unduh chart pilihanmu dari Chorus Encore dalam format .sng atau .zip.</p></div></article>
              <article><span>02</span><div><b>DROP</b><p>RIFF//LAB membaca chart, audio, metadata, dan album art di browser.</p></div></article>
              <article><span>03</span><div><b>PLAY</b><p>Pilih instrumen, difficulty, latency, lalu kejar streak tertinggimu.</p></div></article>
            </div>
          </section>
        </>
      ) : selectedSong && selectedChart ? (
        <section className="setup-screen">
          <div className="setup-rail">
            <button className="rail-back" type="button" onClick={() => setScreen("landing")}><span>←</span> BACK</button>
            <div className="rail-index"><b>SOUND<br />CHECK</b><span>02 / 03</span></div>
            <div className="rail-lines"><i /><i /><i /><i /><i /></div>
            <RiffMark compact />
          </div>

          <div className="album-panel">
            <div className="album-frame">
              {/* eslint-disable-next-line @next/next/no-img-element -- artwork is a local runtime blob */}
              {artUrl ? <img src={artUrl} alt={`Album art ${selectedSong.metadata.title}`} /> : (
                <div className="album-fallback"><span>NO<br />ART</span><RiffMark compact /></div>
              )}
              <div className="album-corner">{selectedSong.sourceType.toUpperCase()}</div>
            </div>
            <div className="song-position"><span>LOADED SIGNAL</span><i /><b>{String(selectedSong.charts.length).padStart(2, "0")} CHARTS</b></div>
            {songs.length > 1 && (
              <div className="setlist-picker">
                <span>PACK SETLIST</span>
                {songs.map((song, index) => (
                  <button key={song.id} type="button" className={song.id === selectedSong.id ? "active" : ""} onClick={() => chooseSong(song)}>
                    <i>{String(index + 1).padStart(2, "0")}</i><span>{song.metadata.title}<small>{song.metadata.artist}</small></span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="setup-main">
            <div className="setup-kicker"><span>TRACK LOCKED</span><i /> READY FOR INPUT</div>
            <h1>{selectedSong.metadata.title}</h1>
            <p className="artist-line">{selectedSong.metadata.artist} <span>/</span> chart by {selectedSong.metadata.charter}</p>
            <div className="metadata-strip">
              <div><span>ALBUM</span><b>{selectedSong.metadata.album}</b></div>
              <div><span>YEAR</span><b>{selectedSong.metadata.year}</b></div>
              <div><span>LENGTH</span><b>{formatDuration(selectedSong.metadata.durationMs)}</b></div>
              <div><span>FILES</span><b>{selectedSong.fileCount}</b></div>
            </div>

            <div className="setup-control">
              <div className="control-label"><span>01</span><div><b>CHOOSE TRACK</b><small>Playable instrument lane</small></div></div>
              <div className="instrument-options">
                {instruments.map((instrument) => (
                  <button key={instrument} type="button" className={activeInstrument === instrument ? "active" : ""} onClick={() => chooseInstrument(instrument)}>
                    <span>{instrument === "guitar" ? "⌁" : instrument === "bass" ? "≋" : instrument === "keys" ? "▥" : "◇"}</span>
                    <b>{instrumentLabels[instrument]}</b>
                    <small>{selectedSong.charts.filter((chart) => chart.instrument === instrument).length} levels</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-control compact-control">
              <div className="control-label"><span>02</span><div><b>DIFFICULTY</b><small>{selectedChart.notes.length.toLocaleString("id-ID")} note groups</small></div></div>
              <div className="difficulty-options">
                {(Object.keys(difficultyLabels) as Difficulty[]).map((difficulty, index) => {
                  const available = selectedSong.charts.some((chart) => chart.instrument === selectedChart.instrument && chart.difficulty === difficulty);
                  return (
                    <button key={difficulty} type="button" disabled={!available} className={selectedChart.difficulty === difficulty ? "active" : ""} onClick={() => chooseDifficulty(difficulty)}>
                      <i>{Array.from({ length: 4 }, (_, level) => <span key={level} className={level <= index ? "filled" : ""} />)}</i>
                      <b>{difficultyLabels[difficulty]}</b>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="tuning-grid">
              <div className="tuning-card">
                <span>INPUT STYLE</span>
                <div className="segmented">
                  <button type="button" className={inputMode === "tap" ? "active" : ""} onClick={() => setInputMode("tap")}>TAP</button>
                  <button type="button" className={inputMode === "strum" ? "active" : ""} onClick={() => setInputMode("strum")}>FRET + STRUM</button>
                </div>
                <small>{inputMode === "tap" ? "D F J K L langsung memukul not" : "Tahan D F J K L · Space untuk strum"}</small>
              </div>
              <div className="tuning-card">
                <span>PRACTICE SPEED</span>
                <div className="speed-options">{[0.75, 0.9, 1].map((value) => <button key={value} type="button" className={speed === value ? "active" : ""} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
                <small>Chart dan audio tetap sinkron</small>
              </div>
              <div className="tuning-card latency-card">
                <span>LATENCY OFFSET <b>{offsetMs > 0 ? "+" : ""}{offsetMs} ms</b></span>
                <input type="range" min="-150" max="150" step="5" value={offsetMs} onChange={(event) => setOffsetMs(Number(event.target.value))} />
                <small>Geser jika not terasa terlalu cepat / lambat</small>
              </div>
            </div>

            <div className="setup-launch-row">
              <div className="key-legend"><span>FRETS</span>{["D", "F", "J", "K", "L"].map((key) => <kbd key={key}>{key}</kbd>)}<i /><span>PULSE</span><kbd>⇧</kbd></div>
              <button className="stage-button" type="button" onClick={() => setScreen("game")}>
                <span><small>03 / ENTER</small><b>GO TO STAGE</b></span><em>↗</em>
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {screen !== "game" && (
        <footer className="riff-footer">
          <span>RIFF//LAB © 2026 REIHAN.ONLINE</span>
          <span>LOCAL-FIRST · NO SONG FILES LEAVE YOUR DEVICE</span>
          <span>NOT AFFILIATED WITH CHORUS ENCORE OR CLONE HERO</span>
        </footer>
      )}

      {/* Global Modals */}
      {showLeaderboard && (
        <LeaderboardModal
          initialSongTitle={selectedSong?.metadata.title}
          initialSongArtist={selectedSong?.metadata.artist}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {showMultiplayer && (
        <MultiplayerLobbyModal
          selectedSong={selectedSong}
          onStartMatch={handleStartMultiplayerMatch}
          onClose={() => setShowMultiplayer(false)}
        />
      )}

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}

      {showFriendsModal && (
        <FriendsModal onClose={() => setShowFriendsModal(false)} />
      )}

      {/* INCOMING MULTIPLAYER ARENA INVITATION TOAST */}
      {incomingInvites.length > 0 && (
        <div className="mp-incoming-invite-toast">
          <div className="invite-toast-left">
            <div className="invite-toast-icon">⚡</div>
            <div className="invite-toast-copy">
              <strong>UNDANGAN MULTIPLAYER ARENA</strong>
              <p>
                <b>{incomingInvites[0].fromDisplayName}</b> mengundangmu bermain lagu:{" "}
                <span>{incomingInvites[0].songName}</span> — <span>{incomingInvites[0].songArtist}</span>
              </p>
              <small>Kode Room: <b>{incomingInvites[0].roomCode}</b></small>
            </div>
          </div>
          <div className="invite-toast-actions">
            <button
              type="button"
              className="invite-toast-btn decline"
              onClick={() => void respondToRoomInvite(incomingInvites[0].id)}
            >
              TOLAK
            </button>
            <button
              type="button"
              className="invite-toast-btn accept"
              onClick={async () => {
                const inv = incomingInvites[0];
                await respondToRoomInvite(inv.id);
                setShowMultiplayer(true);
                if (user) {
                  try {
                    await joinMultiplayerRoom(inv.roomCode, user);
                  } catch (e) {
                    console.error("Auto join invited room error:", e);
                  }
                }
              }}
            >
              GABUNG ARENA ↗
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-screen" role="status">
          <RiffMark compact />
          <div className="loading-bars">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
          <b>UNPACKING SIGNAL</b><span>Reading chart + audio locally</span>
        </div>
      )}
    </main>
  );
}
