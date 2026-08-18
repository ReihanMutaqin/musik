"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  fetchLeaderboard,
  fetchMostActivePlayers,
  fetchTopCareerPlayers,
  fetchTrackedSongs,
  getSongKey,
  type LeaderboardEntry,
  type PlayerRankingEntry,
  type SongCatalogEntry,
} from "@/lib/firebase/leaderboard";
import type { Difficulty } from "@/lib/rhythm/types";

type LeaderboardCategory = "song" | "career_score" | "most_played";

type LeaderboardModalProps = {
  initialSongTitle?: string;
  initialSongArtist?: string;
  onClose: () => void;
};

const defaultCatalog: SongCatalogEntry[] = [
  { songKey: "dragonforce_through-the-fire-and-flames", title: "Through the Fire and Flames", artist: "DragonForce", totalPlays: 1 },
  { songKey: "eric-johnson_cliffs-of-dover", title: "Cliffs of Dover", artist: "Eric Johnson", totalPlays: 1 },
  { songKey: "polyphia_playing-god", title: "Playing God", artist: "Polyphia", totalPlays: 1 },
  { songKey: "metallica_one", title: "One", artist: "Metallica", totalPlays: 1 },
  { songKey: "muse_knights-of-cydonia", title: "Knights of Cydonia", artist: "Muse", totalPlays: 1 },
  { songKey: "avenged-sevenfold_bat-country", title: "Bat Country", artist: "Avenged Sevenfold", totalPlays: 1 },
  { songKey: "billie-eilish_birds-of-a-feather", title: "BIRDS OF A FEATHER", artist: "Billie Eilish", totalPlays: 1 },
];

export function LeaderboardModal({ initialSongTitle, initialSongArtist, onClose }: LeaderboardModalProps) {
  const [category, setCategory] = useState<LeaderboardCategory>("song");

  // Song specific state
  const [selectedSongTitle, setSelectedSongTitle] = useState(initialSongTitle || "Through the Fire and Flames");
  const [selectedSongArtist, setSelectedSongArtist] = useState(initialSongArtist || "DragonForce");
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [songDifficulty, setSongDifficulty] = useState<Difficulty | "all">("all");
  const [songEntries, setSongEntries] = useState<LeaderboardEntry[]>([]);
  const [trackedSongs, setTrackedSongs] = useState<SongCatalogEntry[]>(defaultCatalog);

  // Global categories state
  const [careerPlayers, setCareerPlayers] = useState<PlayerRankingEntry[]>([]);
  const [activePlayers, setActivePlayers] = useState<PlayerRankingEntry[]>([]);

  const [loading, setLoading] = useState(true);

  // Load song catalog list on mount
  useEffect(() => {
    void fetchTrackedSongs().then((catalog) => {
      if (catalog && catalog.length > 0) {
        // Merge with defaults
        const merged = [...catalog];
        defaultCatalog.forEach((def) => {
          if (!merged.some((m) => m.songKey === def.songKey)) merged.push(def);
        });
        setTrackedSongs(merged);
      }
    });
  }, []);

  const activeSongKey = useMemo(
    () => getSongKey(selectedSongArtist, selectedSongTitle),
    [selectedSongArtist, selectedSongTitle]
  );

  // Fetch data based on active category
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const loadData = async () => {
      try {
        if (category === "song") {
          const diffParam = songDifficulty === "all" ? undefined : songDifficulty;
          const data = await fetchLeaderboard(activeSongKey, diffParam);
          if (isMounted) setSongEntries(data);
        } else if (category === "career_score") {
          const data = await fetchTopCareerPlayers();
          if (isMounted) setCareerPlayers(data);
        } else if (category === "most_played") {
          const data = await fetchMostActivePlayers();
          if (isMounted) setActivePlayers(data);
        }
      } catch (err) {
        console.error("Leaderboard loading error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [activeSongKey, category, songDifficulty]);

  const filteredCatalog = useMemo(() => {
    const q = songSearchQuery.trim().toLowerCase();
    if (!q) return trackedSongs;
    return trackedSongs.filter(
      (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );
  }, [songSearchQuery, trackedSongs]);

  const handleSelectSong = (song: SongCatalogEntry) => {
    setSelectedSongTitle(song.title);
    setSelectedSongArtist(song.artist);
    setSongSearchQuery("");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="leaderboard-modal professional-theme" onClick={(e) => e.stopPropagation()}>
        {/* MODAL HEADER */}
        <header className="lb-header">
          <div className="lb-header-copy">
            <div className="lb-header-top-row">
              <span className="lb-pro-badge">GLOBAL HALL OF FAME</span>
              <span className="lb-live-indicator">LIVE SYNC</span>
            </div>
            <h2>Papan Peringkat Global</h2>
            <p>Statistik performa pemain & rekor skor resmi di seluruh dunia</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </header>

        {/* PRIMARY CATEGORY TABS */}
        <div className="lb-primary-tabs">
          <button
            type="button"
            className={`lb-cat-btn ${category === "song" ? "active" : ""}`}
            onClick={() => setCategory("song")}
          >
            <span>Per Lagu</span>
          </button>
          <button
            type="button"
            className={`lb-cat-btn ${category === "career_score" ? "active" : ""}`}
            onClick={() => setCategory("career_score")}
          >
            <span>Total Skor Global</span>
          </button>
          <button
            type="button"
            className={`lb-cat-btn ${category === "most_played" ? "active" : ""}`}
            onClick={() => setCategory("most_played")}
          >
            <span>Lagu Terbanyak</span>
          </button>
        </div>

        {/* =========================================================================
            CATEGORY 1: SONG LEADERBOARD (WITH SEARCH)
           ========================================================================= */}
        {category === "song" && (
          <div className="lb-song-view-container">
            {/* Song Selector & Live Search */}
            <div className="lb-song-selector-bar">
              <div className="lb-current-song-pill">
                <div className="song-title-wrap">
                  <span className="song-sub-artist">{selectedSongArtist}</span>
                  <strong className="song-main-title">{selectedSongTitle}</strong>
                </div>
              </div>

              <div className="lb-song-search-input-wrap">
                <input
                  type="text"
                  className="lb-song-search-input"
                  placeholder="Cari lagu lain (contoh: TTFAF, Cliffs of Dover, Playing God)..."
                  value={songSearchQuery}
                  onChange={(e) => setSongSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Quick Catalog Dropdown Results if Searching */}
            {songSearchQuery.trim() && (
              <div className="lb-search-results-dropdown">
                {filteredCatalog.length > 0 ? (
                  filteredCatalog.map((song) => (
                    <div
                      key={song.songKey}
                      className="lb-search-result-item"
                      onClick={() => handleSelectSong(song)}
                    >
                      <strong>{song.title}</strong>
                      <span>{song.artist}</span>
                    </div>
                  ))
                ) : (
                  <div className="lb-search-result-empty">
                    <span>Lagu &quot;{songSearchQuery}&quot; belum memiliki catatan skor.</span>
                    <button
                      type="button"
                      className="lb-custom-search-btn"
                      onClick={() => {
                        setSelectedSongTitle(songSearchQuery);
                        setSelectedSongArtist("Custom Track");
                        setSongSearchQuery("");
                      }}
                    >
                      Buka Papan Skor Lagu Ini ↗
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Difficulty Sub-tabs */}
            <div className="lb-difficulty-tabs">
              {(["all", "expert", "hard", "medium", "easy"] as const).map((diff) => (
                <button
                  key={diff}
                  type="button"
                  className={`lb-diff-tab ${songDifficulty === diff ? "active" : ""}`}
                  onClick={() => setSongDifficulty(diff)}
                >
                  {diff.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Song Leaderboard Table */}
            <div className="lb-body">
              {loading ? (
                <div className="lb-loading-state">
                  <div className="spinner-orbit" />
                  <span>Memuat skor leaderboard...</span>
                </div>
              ) : songEntries.length > 0 ? (
                <div className="lb-list">
                  {songEntries.map((entry, index) => {
                    const rank = index + 1;
                    const medalClass = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "regular";
                    return (
                      <div key={entry.id || index} className={`lb-card-row ${medalClass}`}>
                        <div className={`lb-rank-badge ${medalClass}`}>
                          {`#${rank}`}
                        </div>

                        <div className="lb-player-cell">
                          {entry.photoURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={entry.photoURL} alt={entry.displayName} className="lb-player-avatar" />
                          ) : (
                            <div className="lb-player-avatar fallback">{entry.displayName.charAt(0).toUpperCase()}</div>
                          )}
                          <div className="lb-player-meta">
                            <strong>{entry.displayName}</strong>
                            <div className="lb-tags-row">
                              <span className={`diff-tag ${entry.difficulty}`}>{entry.difficulty.toUpperCase()}</span>
                              <span className="inst-tag">{entry.instrument.toUpperCase()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="lb-stats-cell">
                          <div className="lb-score-val">{entry.score.toLocaleString("id-ID")} PTS</div>
                          <div className="lb-stats-sub">{entry.accuracy.toFixed(1)}% SYNC · {entry.maxCombo} STREAK</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="lb-empty-state">
                  <strong>Belum Ada Skor untuk Lagu Ini</strong>
                  <p>Mainkan lagu ini dan raih posisi pertama di papan peringkat dunia!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 2: TOTAL CAREER SCORE (HIGHEST GLOBAL SCORE)
           ========================================================================= */}
        {category === "career_score" && (
          <div className="lb-body">
            {loading ? (
              <div className="lb-loading-state">
                <div className="spinner-orbit" />
                <span>Memuat peringkat skor global...</span>
              </div>
            ) : careerPlayers.length > 0 ? (
              <div className="lb-list">
                {careerPlayers.map((player, index) => {
                  const rank = index + 1;
                  const medalClass = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "regular";
                  return (
                    <div key={player.uid || index} className={`lb-card-row ${medalClass}`}>
                      <div className={`lb-rank-badge ${medalClass}`}>
                        {`#${rank}`}
                      </div>

                      <div className="lb-player-cell">
                        {player.photoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={player.photoURL} alt={player.displayName} className="lb-player-avatar" />
                        ) : (
                          <div className="lb-player-avatar fallback">{player.displayName.charAt(0).toUpperCase()}</div>
                        )}
                        <div className="lb-player-meta">
                          <strong>{player.displayName}</strong>
                          <div className="lb-tags-row">
                            <span className="plays-tag">{player.totalPlays || 0} lagu selesai</span>
                            {player.lastPlayedSong && (
                              <span className="last-song-tag">Terakhir: {player.lastPlayedSong}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="lb-stats-cell">
                        <div className="lb-score-val career">{(player.totalCareerScore || 0).toLocaleString("id-ID")} PTS</div>
                        <div className="lb-stats-sub">TOTAL SKOR KUMULATIF</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="lb-empty-state">
                <strong>Belum Ada Data Skor Global</strong>
                <p>Selesaikan lagu untuk mulai mengumpulkan akumulasi total skor!</p>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            CATEGORY 3: MOST ACTIVE ROCKERS (MOST SONGS PLAYED)
           ========================================================================= */}
        {category === "most_played" && (
          <div className="lb-body">
            {loading ? (
              <div className="lb-loading-state">
                <div className="spinner-orbit" />
                <span>Memuat pemain teraktif...</span>
              </div>
            ) : activePlayers.length > 0 ? (
              <div className="lb-list">
                {activePlayers.map((player, index) => {
                  const rank = index + 1;
                  const medalClass = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "regular";
                  return (
                    <div key={player.uid || index} className={`lb-card-row ${medalClass}`}>
                      <div className={`lb-rank-badge ${medalClass}`}>
                        {`#${rank}`}
                      </div>

                      <div className="lb-player-cell">
                        {player.photoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={player.photoURL} alt={player.displayName} className="lb-player-avatar" />
                        ) : (
                          <div className="lb-player-avatar fallback">{player.displayName.charAt(0).toUpperCase()}</div>
                        )}
                        <div className="lb-player-meta">
                          <strong>{player.displayName}</strong>
                          <div className="lb-tags-row">
                            <span className="career-score-tag">Skor: {(player.totalCareerScore || 0).toLocaleString("id-ID")} pts</span>
                            {player.lastPlayedSong && (
                              <span className="last-song-tag">Lagu: {player.lastPlayedSong}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="lb-stats-cell">
                        <div className="lb-score-val active-plays">{player.totalPlays || 0} LAGU</div>
                        <div className="lb-stats-sub">TOTAL SETLIST COMPLETED</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="lb-empty-state">
                <strong>Belum Ada Catatan Pemain Aktif</strong>
                <p>Jadilah yang paling aktif memainkan berbagai setlist lagu!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
