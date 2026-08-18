"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { importRhythmFile } from "@/lib/rhythm/importer";
import { createTrainingSong } from "@/lib/rhythm/demo";
import type { Difficulty, ImportedSong, Instrument } from "@/lib/rhythm/types";
import { getGlobalOrOnlineLyrics, saveGlobalLyrics, stringifyLyricsToLrc } from "@/lib/firebase/lyrics";
import { parseLrc, getActiveLyric, type TimedLyricLine } from "@/lib/rhythm/lyrics";
import { useAuth, DEFAULT_KEYBINDS } from "@/lib/firebase/auth";
import { AuthWall } from "@/components/auth/AuthWall";
import { LeaderboardModal } from "./LeaderboardModal";
import { MultiplayerLobbyModal } from "./MultiplayerLobbyModal";
import { ProfileModal } from "@/components/profile/ProfileModal";
import { FriendsModal } from "@/components/social/FriendsModal";
import { subscribeToIncomingFriendRequests } from "@/lib/firebase/friends";
import { setPlayerDownloadStatus, type MultiplayerRoom } from "@/lib/firebase/multiplayer";
import { GameStage } from "./GameStage";

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

const popularChips = [
  "DragonForce",
  "Metallica",
  "Avenged Sevenfold",
  "Polyphia",
  "Anime",
  "Guitar Hero",
  "Rock Band",
  "Queen",
  "Slipknot",
  "Linkin Park",
];

const alphabetList = [
  "ALL",
  "#",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
];

type ChorusSongItem = {
  chartId: number;
  md5: string;
  name: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  charter: string;
  song_length: number;
  diff_guitar: number;
  diff_bass: number;
  diff_drums: number;
  diff_keys: number;
  hasVideoBackground: boolean;
};

type CuratedPack = {
  id: string;
  category: "Guitar Hero" | "Rock Band" | "Modern Shred" | "Anime & J-Rock" | "Metal & Core";
  title: string;
  artist: string;
  badge: string;
  charter: string;
  query: string;
  description: string;
};

const curatedPacks: CuratedPack[] = [
  // Guitar Hero Legends
  { id: "gh-ttfaf", category: "Guitar Hero", title: "Through the Fire and Flames", artist: "DragonForce", badge: "GH3 FINAL BOSS", charter: "Neversoft", query: "DragonForce Through the Fire and Flames", description: "Lagu paling legendaris di Guitar Hero 3 dengan solo intro trill tercepat." },
  { id: "gh-cliffs", category: "Guitar Hero", title: "Cliffs of Dover", artist: "Eric Johnson", badge: "GH3 CLASSIC", charter: "Neversoft", query: "Eric Johnson Cliffs of Dover", description: "Melodi pentatonik legendaris tier tertinggi di Guitar Hero 3." },
  { id: "gh-koc", category: "Guitar Hero", title: "Knights of Cydonia", artist: "Muse", badge: "GH3 TIER 8", charter: "Neversoft", query: "Muse Knights of Cydonia", description: "Riff triplet galloping yang sangat seru dan epik." },
  { id: "gh-freebird", category: "Guitar Hero", title: "Free Bird", artist: "Lynyrd Skynyrd", badge: "GH2 ENCORE", charter: "Harmonix", query: "Lynyrd Skynyrd Free Bird", description: "Solo gitar 5 menit nonstop penutup Guitar Hero 2." },
  { id: "gh-metallica-one", category: "Guitar Hero", title: "One", artist: "Metallica", badge: "GH: METALLICA", charter: "Neversoft", query: "Metallica One", description: "Intro akustik merdu dilanjutkan breakdown double bass mematikan." },

  // Rock Band Anthems
  { id: "rb-more-than", category: "Rock Band", title: "More Than a Feeling", artist: "Boston", badge: "ROCK BAND 1", charter: "Harmonix", query: "Boston More Than a Feeling", description: "Lagu rock harmonik klasik wajib pembuka seri Rock Band." },
  { id: "rb-green-day", category: "Rock Band", title: "Boulevard of Broken Dreams", artist: "Green Day", badge: "GREEN DAY: RB", charter: "Harmonix", query: "Green Day Boulevard of Broken Dreams", description: "Anthem punk rock legendaris dengan vocal chorus berenergi." },
  { id: "rb-killers", category: "Rock Band", title: "Mr. Brightside", artist: "The Killers", badge: "ROCK BAND DLC", charter: "Harmonix", query: "The Killers Mr. Brightside", description: "Riff arpeggio 16th note yang seru dimainkan pada tempo cepat." },

  // Custom Songs Central (CSC) & Modern Shred
  { id: "csc-polyphia-god", category: "Modern Shred", title: "Playing God", artist: "Polyphia", badge: "CSC VIRAL", charter: "CSC / Jaded", query: "Polyphia Playing God", description: "Nylon guitar shredding flamenco kontemporer dari Tim Henson & Scott LePage." },
  { id: "csc-polyphia-goat", category: "Modern Shred", title: "G.O.A.T.", artist: "Polyphia", badge: "MATH ROCK", charter: "CSC", query: "Polyphia G.O.A.T.", description: "Riff ikonik hybrid picking dengan groove drum yang tajam." },
  { id: "csc-ichika", category: "Modern Shred", title: "Orb", artist: "Ichika Nito", badge: "FINGERSTYLE", charter: "CSC", query: "Ichika Nito", description: "Tapping 2 tangan presisi tinggi dengan harmoni khas Jepang." },
  { id: "csc-aal", category: "Modern Shred", title: "The Brain Dance", artist: "Animals As Leaders", badge: "DJENT / PROG", charter: "CSC", query: "Animals As Leaders", description: "Thumping 8-string progressive metal dari Tosin Abasi." },

  // Anime & J-Rock
  { id: "anime-bocchi", category: "Anime & J-Rock", title: "Ano Bando (That Band)", artist: "Kessoku Band (Bocchi the Rock!)", badge: "ANIME HIT", charter: "CSC / Community", query: "Kessoku Band", description: "Solo gitar improvisasi Bocchi di festival budaya sekolah." },
  { id: "anime-kon", category: "Anime & J-Rock", title: "Don't say \"lazy\"", artist: "After-School Tea Time (K-ON!)", badge: "K-ON! CLASSIC", charter: "Community", query: "K-ON Don't say lazy", description: "Ending song legendaris K-ON dengan bassline dan lick solo memukau." },
  { id: "anime-unravel", category: "Anime & J-Rock", title: "Unravel", artist: "TK from Ling Tosite Sigure", badge: "TOKYO GHOUL", charter: "Community", query: "TK from Ling Tosite Sigure Unravel", description: "Arpeggio gitar post-hardcore emosional dan vokal falsetto tinggi." },

  // Metal & Core
  { id: "metal-a7x", category: "Metal & Core", title: "Bat Country", artist: "Avenged Sevenfold", badge: "A7X DUO SOLO", charter: "Harmonix / Neversoft", query: "Avenged Sevenfold Bat Country", description: "Harmoni lead Synyster Gates & Zacky Vengeance yang legendaris." },
  { id: "metal-slipknot", category: "Metal & Core", title: "Psychosocial", artist: "Slipknot", badge: "NU-METAL", charter: "Harmonix", query: "Slipknot Psychosocial", description: "Riff chug berat dan solo sweep picking Mick Thomson & Jim Root." },
  { id: "metal-linkin", category: "Metal & Core", title: "In the End", artist: "Linkin Park", badge: "HYBRID THEORY", charter: "Harmonix", query: "Linkin Park In the End", description: "Lagu rock paling terkenal era 2000-an dengan nuansa piano dan rap rock." },
];

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

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
        <div className="demo-strum-bar" />
      </div>
    </div>
  );
}

export function RhythmLab() {
  const { user, profile, signOutUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [songs, setSongs] = useState<ImportedSong[]>([]);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [selectedChartId, setSelectedChartId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("UNPACKING SIGNAL");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<"landing" | "setup" | "game">("landing");
  const [sourceTab, setSourceTab] = useState<"cloud" | "packs" | "direct-url" | "local">("cloud");
  const [packCategory, setPackCategory] = useState<string>("All");
  const [directUrl, setDirectUrl] = useState("");
  const [speed, setSpeed] = useState(1);
  const [offsetMs, setOffsetMs] = useState(0);
  const [inputMode, setInputMode] = useState<"tap" | "strum">("tap");
  const [gamepadInfo, setGamepadInfo] = useState<string>("");

  const formatKeyLabel = (code?: string): string => {
    if (!code) return "";
    if (code.startsWith("Key")) return code.replace("Key", "");
    if (code.startsWith("Digit")) return code.replace("Digit", "");
    if (code === "Semicolon") return ";";
    if (code === "Comma") return ",";
    if (code === "Period") return ".";
    if (code === "Slash") return "/";
    if (code === "Space") return "SPACE";
    if (code.startsWith("Shift")) return "SHIFT";
    if (code.startsWith("Control")) return "CTRL";
    if (code.startsWith("Alt")) return "ALT";
    return code.toUpperCase();
  };

  const activeKeybinds = useMemo(() => {
    return profile?.keybinds || DEFAULT_KEYBINDS;
  }, [profile?.keybinds]);

  const currentKeyLabels = useMemo(() => {
    return [
      formatKeyLabel(activeKeybinds.lane0),
      formatKeyLabel(activeKeybinds.lane1),
      formatKeyLabel(activeKeybinds.lane2),
      formatKeyLabel(activeKeybinds.lane3),
      formatKeyLabel(activeKeybinds.lane4),
    ];
  }, [activeKeybinds]);

  const strumKeyLabel = useMemo(() => formatKeyLabel(activeKeybinds.strum), [activeKeybinds.strum]);
  const pulseKeyLabel = useMemo(() => formatKeyLabel(activeKeybinds.pulse), [activeKeybinds.pulse]);

  // Modals state
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [incomingRequestsCount, setIncomingRequestsCount] = useState(0);

  // Subscribe to incoming friend requests for real-time header badge
  useEffect(() => {
    if (!user) {
      setIncomingRequestsCount(0);
      return;
    }
    const unsub = subscribeToIncomingFriendRequests(user.uid, (reqs) => {
      setIncomingRequestsCount(reqs.length);
    });
    return () => unsub();
  }, [user]);

  // Sound Check Global Lyric Studio state
  const [showSoundCheckLyricStudio, setShowSoundCheckLyricStudio] = useState(false);
  const [soundCheckLyrics, setSoundCheckLyrics] = useState<TimedLyricLine[]>([]);
  const [soundCheckLyricOffsetMs, setSoundCheckLyricOffsetMs] = useState(0);
  const [soundCheckLyricSource, setSoundCheckLyricSource] = useState<"firestore" | "lrclib" | "custom" | "embedded" | "none">("none");
  const [soundCheckLyricRawLrc, setSoundCheckLyricRawLrc] = useState("");
  const [soundCheckLyricSyncedBy, setSoundCheckLyricSyncedBy] = useState("");
  const [savingGlobalLyrics, setSavingGlobalLyrics] = useState(false);
  const [soundCheckActiveTab, setSoundCheckActiveTab] = useState<"calibrate" | "search" | "paste">("calibrate");
  const [soundCheckSearchQuery, setSoundCheckSearchQuery] = useState("");
  const [soundCheckSearching, setSoundCheckSearching] = useState(false);
  const [soundCheckCustomLrc, setSoundCheckCustomLrc] = useState("");
  const [soundCheckAudioPlaying, setSoundCheckAudioPlaying] = useState(false);
  const [soundCheckAudioCurrentTime, setSoundCheckAudioCurrentTime] = useState(0);
  const soundCheckAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundCheckAnimFrameRef = useRef<number>(0);
  const [multiplayerMatchRoom, setMultiplayerMatchRoom] = useState<MultiplayerRoom | null>(null);

  // Chorus Cloud Search state & Filters
  const [searchQuery, setSearchQuery] = useState("Guitar Hero");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ChorusSongItem[]>([]);
  const [totalFound, setTotalFound] = useState<number | null>(null);
  const [downloadingMd5, setDownloadingMd5] = useState<string | null>(null);

  // Song Browser: Alphabet Filter & Pagination
  const [alphabetFilter, setAlphabetFilter] = useState("ALL");
  const [sortOption, setSortOption] = useState<"relevance" | "title_asc" | "artist_asc" | "length_asc" | "length_desc">("relevance");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  useEffect(() => {
    const checkGamepad = () => {
      if (typeof navigator !== "undefined" && navigator.getGamepads) {
        const gps = navigator.getGamepads();
        const active = Array.from(gps).find((g) => g && g.connected);
        if (active) {
          const name = active.id.replace(/\([^)]*\)/g, "").trim() || "Gamepad Controller";
          setGamepadInfo(name);
        } else {
          setGamepadInfo("");
        }
      }
    };

    const timer = setInterval(checkGamepad, 1200);
    window.addEventListener("gamepadconnected", checkGamepad);
    window.addEventListener("gamepaddisconnected", checkGamepad);
    checkGamepad();

    return () => {
      clearInterval(timer);
      window.removeEventListener("gamepadconnected", checkGamepad);
      window.removeEventListener("gamepaddisconnected", checkGamepad);
    };
  }, []);

  // Initial cloud search on mount
  useEffect(() => {
    void executeSearch("Guitar Hero", undefined, 1);
  }, []);

  const executeSearch = async (query?: string, abjadLetter?: string, pageNumber = 1) => {
    const effectiveAbjad = abjadLetter !== undefined ? abjadLetter : alphabetFilter;
    let rawQ = query ?? searchQuery;
    // Strip emojis like 🇮🇩 or flags from query
    let q = rawQ.replace(/[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, "").trim();

    if (!q) {
      if (effectiveAbjad && effectiveAbjad !== "ALL" && effectiveAbjad !== "#") {
        q = effectiveAbjad.toLowerCase();
      } else if (effectiveAbjad === "#") {
        q = "1";
      } else {
        q = "Guitar Hero";
      }
    }

    setSearching(true);
    setError("");
    setCurrentPage(pageNumber);
    try {
      const abjadParam = effectiveAbjad && effectiveAbjad !== "ALL" ? `&abjad=${encodeURIComponent(effectiveAbjad)}` : "";
      const res = await fetch(`/api/chorus/search?q=${encodeURIComponent(q)}${abjadParam}&page=${pageNumber}`);
      if (!res.ok) throw new Error(`Search error (${res.status})`);
      const json = (await res.json()) as { found?: number; data?: ChorusSongItem[] };
      setSearchResults(json.data ?? []);
      setTotalFound(json.found ?? 0);
    } catch (err) {
      console.error("Search error:", err);
      setError("Gagal mencari lagu dari Chorus database.");
    } finally {
      setSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSearch(searchQuery, undefined, 1);
  };

  const handleAbjadClick = (letter: string) => {
    setAlphabetFilter(letter);
    if (!searchQuery.trim()) {
      void executeSearch("", letter, 1);
    } else {
      setCurrentPage(1);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || searching) return;
    void executeSearch(searchQuery, undefined, newPage);
  };

  // Filtered & Sorted Search Results:
  // "dari judul dong" -> Strictly filter by SONG TITLE (item.name) starting with selected letter
  const filteredAndSortedResults = useMemo(() => {
    let list = [...searchResults];

    if (alphabetFilter !== "ALL") {
      if (alphabetFilter === "#") {
        list = list.filter((item) => /^[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(item.name.trim()));
      } else {
        const char = alphabetFilter.toUpperCase();
        list = list.filter((item) => item.name.trim().toUpperCase().startsWith(char));
      }
    }

    // Sorting
    if (sortOption === "title_asc") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOption === "artist_asc") {
      list.sort((a, b) => a.artist.localeCompare(b.artist));
    } else if (sortOption === "length_asc") {
      list.sort((a, b) => a.song_length - b.song_length);
    } else if (sortOption === "length_desc") {
      list.sort((a, b) => b.song_length - a.song_length);
    }

    return list;
  }, [searchResults, alphabetFilter, sortOption]);

  const totalPages = Math.max(1, Math.ceil(totalFound / 20));
  const paginatedResults = filteredAndSortedResults;

  const playChorusSong = async (item: ChorusSongItem, autoOpenMultiplayer = false) => {
    setDownloadingMd5(item.md5);
    setLoading(true);
    setLoadingText(`Mengunduh "${item.name}" dari Chorus...`);
    setError("");
    try {
      const res = await fetch(`/api/chorus/download?md5=${item.md5}&novideo=true`);
      if (!res.ok) throw new Error(`Gagal mengunduh lagu (${res.status})`);
      setLoadingText("Mengekstrak partitur chart & audio stems...");
      const blob = await res.blob();
      const filename = `${item.artist} - ${item.name}.sng`;
      const file = new File([blob], filename, { type: "application/octet-stream" });
      const imported = await importRhythmFile(file);
      setSongs(imported);
      chooseSong(imported[0]);

      if (autoOpenMultiplayer) {
        setShowMultiplayer(true);
      } else {
        setScreen("setup");
      }
    } catch (err) {
      console.error("Chorus direct play error:", err);
      setError(err instanceof Error ? err.message : "Gagal memuat lagu dari Chorus.");
    } finally {
      setDownloadingMd5(null);
      setLoading(false);
    }
  };

  const handleDirectUrlLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = directUrl.trim();
    if (!url) return;
    setLoading(true);
    setLoadingText("Mengunduh chart dari URL...");
    setError("");

    try {
      const res = await fetch(`/api/chorus/download-url?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Gagal mengunduh file dari URL (${res.status})`);
      const blob = await res.blob();
      const ext = url.split("?")[0].split(".").pop() || "sng";
      const file = new File([blob], `custom-track.${ext}`, { type: "application/octet-stream" });
      const imported = await importRhythmFile(file);
      setSongs(imported);
      chooseSong(imported[0]);
      setScreen("setup");
    } catch (err) {
      console.error("Direct URL load error:", err);
      setError(err instanceof Error ? err.message : "Gagal memuat chart dari URL.");
    } finally {
      setLoading(false);
    }
  };

  const playCuratedPack = async (pack: CuratedPack) => {
    setSourceTab("cloud");
    const cleanQ = pack.query.replace(/[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, "").trim();
    setSearchQuery(cleanQ);
    void executeSearch(cleanQ);
  };

  const selectedSong = useMemo(() => songs.find((song) => song.id === selectedSongId) ?? songs[0], [songs, selectedSongId]);
  const selectedChart = useMemo(() => selectedSong?.charts.find((chart) => chart.id === selectedChartId) ?? selectedSong?.charts[0], [selectedSong, selectedChartId]);

  // Load Global Synced Lyrics when selectedSong changes
  useEffect(() => {
    if (!selectedSong) return;
    let isCancelled = false;

    const load = async () => {
      try {
        const dur = selectedSong.metadata.durationMs / 1000;
        const res = await getGlobalOrOnlineLyrics(
          selectedSong.metadata.artist,
          selectedSong.metadata.title,
          selectedSong.metadata.album,
          dur
        );
        if (isCancelled) return;
        if (res.lyrics.length > 0) {
          setSoundCheckLyrics(res.lyrics);
          setSoundCheckLyricOffsetMs(res.offsetMs || 0);
          setSoundCheckLyricSource(res.source);
          setSoundCheckLyricRawLrc(res.rawLrc || "");
          setSoundCheckLyricSyncedBy(res.syncedByName || "");
          selectedSong.lyrics = res.lyrics;
        } else if (selectedSong.lyrics && selectedSong.lyrics.length > 0) {
          setSoundCheckLyrics(selectedSong.lyrics);
          setSoundCheckLyricSource("embedded");
          setSoundCheckLyricSyncedBy("Internal Chart");
        } else {
          setSoundCheckLyrics([]);
          setSoundCheckLyricSource("none");
          setSoundCheckLyricSyncedBy("");
        }
      } catch (err) {
        console.warn("Sound check lyrics load error:", err);
      }
    };

    void load();
    return () => {
      isCancelled = true;
    };
  }, [selectedSong]);

  const openSoundCheckLyricStudio = () => {
    if (!selectedSong) return;
    setSoundCheckSearchQuery(`${selectedSong.metadata.artist === "Unknown artist" ? "" : selectedSong.metadata.artist} ${selectedSong.metadata.title}`.trim());
    setShowSoundCheckLyricStudio(true);
  };

  const toggleSoundCheckAudio = () => {
    if (!selectedSong?.audio?.length) return;
    if (!soundCheckAudioRef.current) {
      const primary = selectedSong.audio[0];
      const audioUrl = URL.createObjectURL(primary.blob);
      const audio = new Audio(audioUrl);
      soundCheckAudioRef.current = audio;
      audio.onended = () => {
        setSoundCheckAudioPlaying(false);
        setSoundCheckAudioCurrentTime(0);
      };
    }

    const audio = soundCheckAudioRef.current;
    if (soundCheckAudioPlaying) {
      audio.pause();
      setSoundCheckAudioPlaying(false);
      cancelAnimationFrame(soundCheckAnimFrameRef.current);
    } else {
      audio.play().then(() => {
        setSoundCheckAudioPlaying(true);
        const update = () => {
          if (audio) {
            setSoundCheckAudioCurrentTime(audio.currentTime);
            soundCheckAnimFrameRef.current = requestAnimationFrame(update);
          }
        };
        soundCheckAnimFrameRef.current = requestAnimationFrame(update);
      }).catch((e) => console.error("Audio preview play error:", e));
    }
  };

  const seekSoundCheckAudio = (timeSec: number) => {
    if (soundCheckAudioRef.current) {
      soundCheckAudioRef.current.currentTime = timeSec;
      setSoundCheckAudioCurrentTime(timeSec);
    }
  };

  const closeSoundCheckLyricStudio = () => {
    if (soundCheckAudioRef.current) {
      soundCheckAudioRef.current.pause();
    }
    setSoundCheckAudioPlaying(false);
    cancelAnimationFrame(soundCheckAnimFrameRef.current);
    setShowSoundCheckLyricStudio(false);
  };

  const handleSoundCheckSearchLyrics = async () => {
    if (!soundCheckSearchQuery.trim() || !selectedSong) return;
    setSoundCheckSearching(true);
    try {
      const dur = Math.round(selectedSong.metadata.durationMs / 1000);
      const res = await fetch(`/api/lyrics?track=${encodeURIComponent(soundCheckSearchQuery)}&artist=&duration=${dur}`);
      if (!res.ok) throw new Error("Lirik tidak ditemukan di database LRCLIB.");
      const data = await res.json();
      if (data.syncedLyrics) {
        const parsed = parseLrc(data.syncedLyrics);
        if (parsed.length > 0) {
          setSoundCheckLyrics(parsed);
          setSoundCheckLyricSource("lrclib");
          setSoundCheckLyricRawLrc(data.syncedLyrics);
          selectedSong.lyrics = parsed;
          alert(`✅ Ditemukan ${parsed.length} baris lirik untuk "${data.trackName || soundCheckSearchQuery}"!\n\nKlik "SIMPAN GLOBAL" di bawah agar semua orang di dunia otomatis mendapatkan lirik ini.`);
          setSoundCheckActiveTab("calibrate");
          return;
        }
      }
      throw new Error("Lirik bertanda waktu (.lrc) tidak tersedia untuk pencarian ini.");
    } catch (err: any) {
      alert(err?.message || "Gagal mencari lirik.");
    } finally {
      setSoundCheckSearching(false);
    }
  };

  const handleSoundCheckApplyCustomLrc = () => {
    if (!soundCheckCustomLrc.trim()) return;
    const parsed = parseLrc(soundCheckCustomLrc);
    if (parsed.length > 0) {
      setSoundCheckLyrics(parsed);
      setSoundCheckLyricSource("custom");
      setSoundCheckLyricRawLrc(soundCheckCustomLrc);
      if (selectedSong) selectedSong.lyrics = parsed;
      alert(`✅ Berhasil memuat ${parsed.length} baris lirik kustom!\n\nKlik "SIMPAN GLOBAL" di bawah agar tersimpan permanen di database.`);
      setSoundCheckActiveTab("calibrate");
    } else {
      alert("Format LRC tidak valid. Pastikan ada timestamp seperti [01:23.45] Teks lirik.");
    }
  };

  const handleSoundCheckSaveGlobal = async () => {
    if (!selectedSong) return;
    if (!soundCheckLyrics.length && !soundCheckLyricRawLrc) {
      alert("Belum ada lirik untuk disimpan.");
      return;
    }
    setSavingGlobalLyrics(true);
    try {
      const lrcToSave = soundCheckLyricRawLrc || stringifyLyricsToLrc(soundCheckLyrics, soundCheckLyricOffsetMs);
      const res = await saveGlobalLyrics(
        selectedSong.metadata.artist,
        selectedSong.metadata.title,
        lrcToSave,
        soundCheckLyricOffsetMs,
        user
      );
      if (res.success) {
        setSoundCheckLyricSource("firestore");
        setSoundCheckLyricSyncedBy(user?.displayName || "RIFF Community");
        selectedSong.lyrics = soundCheckLyrics;
        alert(`🎉 BERHASIL DISIMPAN SECARA GLOBAL!\n\nSemua pemain di seluruh dunia kini akan otomatis mendapatkan lirik dan timing sinkron ini tanpa perlu mengatur ulang.`);
        closeSoundCheckLyricStudio();
      } else {
        alert(`Gagal menyimpan global: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || err}`);
    } finally {
      setSavingGlobalLyrics(false);
    }
  };
  const activeInstrument = selectedChart?.instrument;
  const instruments = useMemo(
    () => (selectedSong ? [...new Set(selectedSong.charts.map((chart) => chart.instrument))] : []),
    [selectedSong]
  );

  const artBlob = selectedSong?.artwork?.blob;
  const artUrl = useMemo(() => (artBlob ? URL.createObjectURL(artBlob) : ""), [artBlob]);

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
    setLoadingText("Menganalisis file & audio...");
    setError("");
    try {
      const imported = await importRhythmFile(file);
      setSongs(imported);
      chooseSong(imported[0]);
      setScreen("setup");
    } catch (err) {
      console.error("Local file import error:", err);
      setError(err instanceof Error ? err.message : "Gagal memuat file.");
    } finally {
      setLoading(false);
    }
  };

  const chooseInstrument = (instrument: Instrument) => {
    if (!selectedSong) return;
    const chart = selectedSong.charts.find((c) => c.instrument === instrument && c.difficulty === selectedChart?.difficulty)
      ?? selectedSong.charts.find((c) => c.instrument === instrument)
      ?? selectedChart;
    if (chart) setSelectedChartId(chart.id);
  };

  const chooseDifficulty = (difficulty: Difficulty) => {
    if (!selectedSong || !selectedChart) return;
    const chart = selectedSong.charts.find((c) => c.instrument === selectedChart.instrument && c.difficulty === difficulty)
      ?? selectedChart;
    setSelectedChartId(chart.id);
  };

  const filteredPacks = useMemo(() => {
    if (packCategory === "All") return curatedPacks;
    return curatedPacks.filter((p) => p.category === packCategory);
  }, [packCategory]);

  return (
    <div className={`riff-shell ${dragging ? "is-dragging" : ""}`}>
      <AuthWall />

      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".sng,.zip,.chart,.mid,.midi,.mp3,.wav,.ogg,.flac,.m4a"
        onChange={(event) => {
          void processFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <header className="riff-header">
        <button className="brand-button" type="button" onClick={() => setScreen("landing")}>
          <RiffMark />
        </button>

        <div className="header-center">
          <span>CHORUS CLOUD</span>
          <i />
          <span>MULTIPLAYER</span>
          <i />
          <span>LEADERBOARD</span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="mp-header-btn"
            onClick={() => setShowMultiplayer(true)}
            title="Masuk ke Multiplayer Arena"
          >
            Multiplayer
          </button>
          <button
            type="button"
            className="lb-header-btn"
            onClick={() => setShowLeaderboard(true)}
            title="Lihat Peringkat Global Leaderboard"
          >
            Leaderboard
          </button>
          <button
            type="button"
            className={`friends-header-btn ${incomingRequestsCount > 0 ? "has-badge" : ""}`}
            onClick={() => setShowFriendsModal(true)}
            title="Daftar Teman & Komunitas"
          >
            Friends {incomingRequestsCount > 0 && <span className="header-req-badge">{incomingRequestsCount}</span>}
          </button>
          <button
            type="button"
            className="import-header-btn"
            onClick={() => inputRef.current?.click()}
          >
            Import File <span>＋</span>
          </button>

          {/* User Profile Pill in Header */}
          {user && (
            <div
              className="user-profile-header-item"
              onClick={() => setShowProfileModal(true)}
              title="Klik untuk Edit Profil & Pengaturan"
            >
              {profile?.photoURL && profile.photoURL.length > 5 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photoURL} alt={profile.displayName || "User"} className="user-avatar-tiny" />
              ) : (
                <span className="user-avatar-tiny fallback">
                  {profile?.photoURL || (profile?.displayName || user.email || "U")[0].toUpperCase()}
                </span>
              )}
              <div className="user-text-col">
                <span className="user-name-tiny">
                  {profile?.username ? `@${profile.username}` : (profile?.displayName || user.displayName || "Player").split(" ")[0]}
                </span>
                <span className="user-role-tiny">{profile?.title || "Player"}</span>
              </div>
              <button
                type="button"
                className="user-signout-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void signOutUser();
                }}
                title="Keluar / Logout"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </header>

      {screen === "landing" ? (
        <>
          <section className="landing-grid">
            <div className="landing-copy">
              <p className="eyebrow"><span>01</span> BROWSER RHYTHM LAB</p>
              <h1>SEARCH & PLAY.<br />HIT THE <em>NIGHT.</em></h1>
              <p className="landing-lede">
                Mainkan ribuan lagu <strong>Guitar Hero & Rock Band</strong> dari katalog cloud Chorus, curated setlist komunitas, direct link, atau import audio dengan <strong>AI AutoChart</strong> langsung di browser.
              </p>

              {/* Source Tab Switcher */}
              <div className="source-tabs">
                <button
                  type="button"
                  className={`source-tab-btn ${sourceTab === "cloud" ? "active" : ""}`}
                  onClick={() => setSourceTab("cloud")}
                >
                  Chorus Cloud
                </button>
                <button
                  type="button"
                  className={`source-tab-btn ${sourceTab === "packs" ? "active" : ""}`}
                  onClick={() => setSourceTab("packs")}
                >
                  Curated Packs
                </button>
                <button
                  type="button"
                  className={`source-tab-btn ${sourceTab === "direct-url" ? "active" : ""}`}
                  onClick={() => setSourceTab("direct-url")}
                >
                  Direct Link
                </button>
                <button
                  type="button"
                  className={`source-tab-btn ${sourceTab === "local" ? "active" : ""}`}
                  onClick={() => setSourceTab("local")}
                >
                  File Lokal / AI
                </button>
              </div>

              <div className="landing-actions">
                {sourceTab === "local" ? (
                  <button className="primary-action" type="button" onClick={() => inputRef.current?.click()}>
                    <UploadGlyph />
                    <span><b>{loading ? "PROCESSING…" : "IMPORT FILE / AUDIO"}</b><small>.SNG / .ZIP / MP3 / WAV (AI AUTOGENERATOR)</small></span>
                    <em>↗</em>
                  </button>
                ) : (
                  <button className="secondary-action" type="button" onClick={loadTraining}>
                    Try training riff <span>▶</span>
                  </button>
                )}
              </div>
              {error && <div className="import-error" role="alert"><b>NOTIFICATION</b><span>{error}</span></div>}
            </div>
            <LandingHighway />
          </section>

          {/* =========================================================================
              TAB 1: CHORUS CLOUD SEARCH SECTION (SLEEK LIST & ALPHABET FILTER)
             ========================================================================= */}
          {sourceTab === "cloud" && (
            <section className="chorus-cloud-section" aria-label="Chorus Online Song Search">
              <div className="chorus-search-box">
                <div className="chorus-header-row">
                  <div>
                    <span className="chorus-badge">CHORUS ENCORE DATABASE</span>
                    <h2>Katalog & Pencarian Lagu Global</h2>
                  </div>
                  {totalFound !== null && (
                    <span className="found-count">{totalFound.toLocaleString("id-ID")} lagu ditemukan</span>
                  )}
                </div>

                <form className="chorus-form" onSubmit={handleSearchSubmit}>
                  <div className="search-input-wrap">
                    <SearchGlyph />
                    <input
                      type="text"
                      className="chorus-search-input"
                      placeholder="Ketik judul lagu, band, artis, atau charter... (contoh: DragonForce, Metallica, Polyphia)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button type="submit" className="chorus-search-btn" disabled={searching}>
                      {searching ? "MENCARI..." : "CARI LAGU ↗"}
                    </button>
                  </div>
                </form>

                {/* Popular Recommendation Chips */}
                <div className="chorus-chips-row">
                  <span>Populer:</span>
                  {popularChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={`chip-btn ${searchQuery === chip ? "active" : ""}`}
                      onClick={() => {
                        setSearchQuery(chip);
                        void executeSearch(chip);
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Alphabet A-Z Filter Ribbon */}
                <div className="alphabet-ribbon-wrap">
                  <span className="ribbon-label">FILTER ABJAD:</span>
                  <div className="alphabet-ribbon">
                    {alphabetList.map((letter) => (
                      <button
                        key={letter}
                        type="button"
                        className={`abjad-btn ${alphabetFilter === letter ? "active" : ""}`}
                        onClick={() => handleAbjadClick(letter)}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* List Controls & Sorting Bar */}
                <div className="chorus-list-toolbar">
                  <div className="toolbar-left">
                    <span>Menampilkan <b>{paginatedResults.length}</b> dari <b>{filteredAndSortedResults.length}</b> lagu ({alphabetFilter === "ALL" ? "Semua Abjad" : `Abjad ${alphabetFilter}`})</span>
                  </div>

                  <div className="toolbar-right">
                    <label htmlFor="sort-select">Urutkan:</label>
                    <select
                      id="sort-select"
                      className="chorus-sort-select"
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value as any)}
                    >
                      <option value="relevance">Paling Relevan</option>
                      <option value="title_asc">Judul Lagu (A - Z)</option>
                      <option value="artist_asc">Nama Artis (A - Z)</option>
                      <option value="length_asc">Durasi (Terpendek)</option>
                      <option value="length_desc">Durasi (Terpanjang)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Search Results in SLEEK PROFESSIONAL LIST VIEW */}
              <div className="chorus-results-container">
                {searching ? (
                  <div className="chorus-loading-state">
                    <div className="spinner-orbit" />
                    <span>Mencari daftar lagu di database Chorus...</span>
                  </div>
                ) : filteredAndSortedResults.length > 0 ? (
                  <div className="chorus-table-container">
                    <div className="chorus-list-table">
                      {paginatedResults.map((songItem, index) => {
                        const isDownloading = downloadingMd5 === songItem.md5;
                        const rowNumber = (currentPage - 1) * pageSize + index + 1;
                        return (
                          <article
                            key={`${songItem.md5}-${index}`}
                            className={`chorus-table-row ${isDownloading ? "is-downloading" : ""}`}
                          >
                            {/* Track Index Number */}
                            <div className="row-col index">
                              <span>{String(rowNumber).padStart(2, "0")}</span>
                            </div>

                            {/* Disc Icon */}
                            <div className="row-col art">
                              <div className="vinyl-disc-icon">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </div>
                            </div>

                            {/* Song Title & Artist Meta */}
                            <div className="row-col info">
                              <div className="row-title-wrap">
                                <h3 className="row-song-title" title={songItem.name}>{songItem.name}</h3>
                                <span className="row-artist-name" title={songItem.artist}>{songItem.artist}</span>
                              </div>
                              <div className="row-tags-meta">
                                <span className="meta-pill album">{songItem.album || "Single"}</span>
                                {songItem.year && <span className="meta-pill year">{songItem.year}</span>}
                                {songItem.charter && (
                                  <span className="meta-pill charter" title={`Charted by ${songItem.charter}`}>
                                    by <b>{songItem.charter}</b>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Playable Instruments Chips */}
                            <div className="row-col instruments">
                              {songItem.diff_guitar >= 0 && (
                                <span className="inst-badge lead" title={`Lead Guitar (Tier ${songItem.diff_guitar})`}>
                                  GUITAR <small>T{songItem.diff_guitar}</small>
                                </span>
                              )}
                              {songItem.diff_bass >= 0 && <span className="inst-badge bass" title="Bass">BASS</span>}
                              {songItem.diff_drums >= 0 && <span className="inst-badge drums" title="Drums">DRUMS</span>}
                              {songItem.diff_keys >= 0 && <span className="inst-badge keys" title="Keys">KEYS</span>}
                            </div>

                            {/* Track Length */}
                            <div className="row-col duration">
                              <span>{formatDuration(songItem.song_length)}</span>
                            </div>

                            {/* Action Buttons */}
                            <div className="row-col actions">
                              <button
                                type="button"
                                className="row-action-btn play"
                                disabled={isDownloading || loading}
                                onClick={() => void playChorusSong(songItem, false)}
                                title="Mainkan lagu ini secara solo"
                              >
                                {isDownloading ? (
                                  <>
                                    <span className="btn-spinner" />
                                    <span>MEMUAT…</span>
                                  </>
                                ) : (
                                  <>
                                    <span>▶ PLAY</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                className="row-action-btn mp"
                                disabled={isDownloading || loading}
                                onClick={() => void playChorusSong(songItem, true)}
                                title="Buka room multiplayer dengan lagu ini"
                              >
                                HOST ROOM
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {/* Rich Multi-Page Pagination Bar */}
                    {totalPages > 1 && (
                      <div className="chorus-pagination-bar">
                        <button
                          type="button"
                          className="page-nav-btn"
                          disabled={currentPage <= 1 || searching}
                          onClick={() => handlePageChange(currentPage - 1)}
                        >
                          ◀ SEBELUMNYA
                        </button>

                        <div className="page-numbers-wrap">
                          {(() => {
                            const pages: number[] = [];
                            const maxVisible = 5;
                            let start = Math.max(1, currentPage - 2);
                            let end = Math.min(totalPages, start + maxVisible - 1);
                            if (end - start < maxVisible - 1) {
                              start = Math.max(1, end - maxVisible + 1);
                            }
                            for (let p = start; p <= end; p++) pages.push(p);

                            return (
                              <div className="page-buttons-list">
                                {start > 1 && (
                                  <>
                                    <button
                                      type="button"
                                      className={`page-num-btn ${currentPage === 1 ? "active" : ""}`}
                                      onClick={() => handlePageChange(1)}
                                    >
                                      1
                                    </button>
                                    {start > 2 && <span className="page-ellipsis">…</span>}
                                  </>
                                )}
                                {pages.map((p) => (
                                  <button
                                    key={p}
                                    type="button"
                                    className={`page-num-btn ${currentPage === p ? "active" : ""}`}
                                    onClick={() => handlePageChange(p)}
                                  >
                                    {p}
                                  </button>
                                ))}
                                {end < totalPages && (
                                  <>
                                    {end < totalPages - 1 && <span className="page-ellipsis">…</span>}
                                    <button
                                      type="button"
                                      className={`page-num-btn ${currentPage === totalPages ? "active" : ""}`}
                                      onClick={() => handlePageChange(totalPages)}
                                    >
                                      {totalPages}
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                          <span className="page-info-subtext">
                            Halaman <b>{currentPage}</b> dari <b>{totalPages.toLocaleString("id-ID")}</b> ({totalFound.toLocaleString("id-ID")} Lagu)
                          </span>
                        </div>

                        <button
                          type="button"
                          className="page-nav-btn"
                          disabled={currentPage >= totalPages || searching}
                          onClick={() => handlePageChange(currentPage + 1)}
                        >
                          SELANJUTNYA ▶
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="chorus-empty-state">
                    <p>Tidak ada lagu yang cocok dengan abjad <strong>&quot;{alphabetFilter}&quot;</strong> atau kata kunci <strong>&quot;{searchQuery}&quot;</strong>.</p>
                    <small>Coba pilih abjad &quot;ALL&quot; atau ketik nama band/judul lagu lain.</small>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 2: CURATED SETLISTS & COMMUNITY PACKS */}
          {sourceTab === "packs" && (
            <section className="curated-packs-section" aria-label="Curated Setlists & Community Packs">
              <div className="curated-header">
                <div className="curated-copy">
                  <span className="curated-badge">LEGENDARY SETLISTS & CHARTS</span>
                  <h2>Pilihan Setlist Komunitas Terbaik</h2>
                  <p>Koleksi lagu paling populer dari Guitar Hero 1-3, Rock Band, Custom Songs Central (CSC), Modern Shred, dan Anime.</p>
                </div>
                <div className="pack-filter-row">
                  {["All", "Guitar Hero", "Rock Band", "Modern Shred", "Anime & J-Rock", "Metal & Core"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`pack-cat-btn ${packCategory === cat ? "active" : ""}`}
                      onClick={() => setPackCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="curated-grid">
                {filteredPacks.map((pack) => (
                  <article key={pack.id} className="pack-card">
                    <div className="pack-card-top">
                      <span className="pack-badge">{pack.badge}</span>
                      <span className="pack-category">{pack.category}</span>
                    </div>
                    <div className="pack-card-body">
                      <h3>{pack.title}</h3>
                      <p className="pack-artist">{pack.artist}</p>
                      <p className="pack-desc">{pack.description}</p>
                    </div>
                    <div className="pack-card-footer">
                      <small>Charter: <b>{pack.charter}</b></small>
                      <button
                        type="button"
                        className="pack-play-btn"
                        onClick={() => void playCuratedPack(pack)}
                      >
                        MAIN LAGU INI ↗
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* TAB 3: DIRECT URL / LINK LOADER */}
          {sourceTab === "direct-url" && (
            <section className="direct-url-section" aria-label="Direct URL Loader">
              <div className="direct-url-box">
                <span className="url-badge">UNIVERSAL STREAMING PROXY</span>
                <h2>Mainkan via Direct Link / URL</h2>
                <p>Paste link file <strong>.SNG</strong>, <strong>.ZIP</strong>, <strong>Google Drive</strong>, <strong>Dropbox</strong>, atau link direct download mana pun.</p>

                <form className="direct-url-form" onSubmit={handleDirectUrlLoad}>
                  <input
                    type="url"
                    className="direct-url-input"
                    placeholder="https://files.enchor.us/song.sng atau link Google Drive / Dropbox..."
                    value={directUrl}
                    onChange={(e) => setDirectUrl(e.target.value)}
                    required
                  />
                  <button type="submit" className="direct-url-btn" disabled={loading}>
                    {loading ? "MENGUNDUH & STREAMING..." : "STREAM & PLAY ↗"}
                  </button>
                </form>

                <div className="supported-links-guide">
                  <b>Didukung:</b>
                  <span>• Link .sng / .zip langsung</span>
                  <span>• Google Drive share link</span>
                  <span>• Dropbox share link</span>
                  <span>• GitHub raw & Custom CDN</span>
                </div>
              </div>
            </section>
          )}

          {/* TAB 4: LOCAL DROPZONE / AI AUTOCHART SECTION */}
          {sourceTab === "local" && (
            <section
              className="drop-deck"
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); void processFile(event.dataTransfer.files?.[0]); }}
            >
              <div className="drop-index">[ DROPZONE & AI AUTOCHART ]</div>
              <div className="drop-title"><UploadGlyph /><strong>{dragging ? "RELEASE TO LOAD" : "DRAG YOUR SONG OR AUDIO HERE"}</strong></div>
              <p>Mendukung paket chart <b>.SNG / .ZIP</b> atau file audio murni <b>(MP3 / WAV / OGG / FLAC)</b>.</p>
              <div className="ai-autochart-banner">
                <span>AI AUTOCHART ENGINE</span>
                <small>Jika kamu memasukkan file MP3/WAV biasa tanpa chart, RIFF//LAB akan otomatis menghasilkan partitur 5 fret yang selaras dengan irama lagu.</small>
              </div>
              <div className="format-ticker" aria-label="Supported formats">
                <span>SNGPKG v1</span><i />
                <span>CHORUS ZIP</span><i />
                <span>NOTES.CHART</span><i />
                <span>NOTES.MID</span><i />
                <span>MP3 / WAV / OGG / FLAC / M4A (AI AUTOCHART)</span>
              </div>
            </section>
          )}

          <section className="flow-section">
            <div className="section-heading">
              <span>ZERO-INSTALL WORKFLOW</span>
              <h2>DIRECT PLAY<br />TO <em>DOWNBEAT.</em></h2>
            </div>
            <div className="flow-steps">
              <article><span>01</span><div><b>SEARCH</b><p>Ketik lagu apa saja langsung di search bar Chorus Cloud tanpa buka web lain.</p></div></article>
              <article><span>02</span><div><b>INSTANT LOAD</b><p>Klik &quot;Mainkan Sekarang&quot;—RIFF//LAB otomatis mengunduh & mengekstrak chart.</p></div></article>
              <article><span>03</span><div><b>PLAY</b><p>Pilih instrumen & difficulty, lalu mainkan dengan keyboard atau Gamepad.</p></div></article>
            </div>
          </section>
        </>
      ) : selectedSong && selectedChart ? (
        <section className="setup-screen">
          <div className="setup-rail">
            <button className="rail-back" type="button" onClick={() => setScreen("landing")}><span>←</span> CARI LAGU LAIN</button>
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
              <div className="lyric-meta-clickable" onClick={openSoundCheckLyricStudio} title="Klik untuk membuka Studio Sinkronisasi Lirik Global">
                <span>LYRICS (GLOBAL SYNC)</span>
                <b className={`lyric-status-badge-inline ${soundCheckLyricSource}`}>
                  {soundCheckLyricSource === "firestore"
                    ? `GLOBAL (${soundCheckLyrics.length})`
                    : soundCheckLyrics.length > 0
                    ? `LRCLIB (${soundCheckLyrics.length})`
                    : "SYNC LIRIK ＋"}
                </b>
              </div>
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

            <div className="tuning-grid soundcheck-tuning-grid">
              <div className="tuning-card">
                <span>INPUT STYLE</span>
                <div className="segmented">
                  <button type="button" className={inputMode === "tap" ? "active" : ""} onClick={() => setInputMode("tap")}>TAP</button>
                  <button type="button" className={inputMode === "strum" ? "active" : ""} onClick={() => setInputMode("strum")}>FRET + STRUM</button>
                </div>
                <small>{inputMode === "tap" ? `${currentKeyLabels.join(" ")} langsung memukul not` : `Tahan ${currentKeyLabels.join(" ")} · ${strumKeyLabel} untuk strum`}</small>
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
              <div className="tuning-card soundcheck-lyric-card" onClick={openSoundCheckLyricStudio}>
                <div className="soundcheck-lyric-card-top">
                  <span>GLOBAL SYNCHRONIZED LYRICS</span>
                  <b className={`soundcheck-source-tag ${soundCheckLyricSource}`}>
                    {soundCheckLyricSource === "firestore" ? "GLOBAL FIRESTORE ✓" : soundCheckLyrics.length ? "AUTO LRCLIB" : "BELUM DISINKRONKAN"}
                  </b>
                </div>
                <div className="soundcheck-lyric-card-body">
                  <strong>
                    {soundCheckLyrics.length > 0
                      ? `${soundCheckLyrics.length} Baris Lirik (${soundCheckLyricOffsetMs > 0 ? "+" : ""}{soundCheckLyricOffsetMs}ms)`
                      : "Belum Ada Lirik Tersinkron"}
                  </strong>
                  <button type="button" className="soundcheck-open-studio-btn">
                    SYNC & SIMPAN GLOBAL ↗
                  </button>
                </div>
                <small>
                  {soundCheckLyricSyncedBy
                    ? `Disinkronkan oleh: ${soundCheckLyricSyncedBy}`
                    : "Simpan sekali agar semua pemain otomatis sinkron."}
                </small>
              </div>
            </div>

            <div className="setup-launch-row">
              <div className="setup-legends-stack">
                <div className="key-legend">
                  <span>KEYBOARD</span>
                  {currentKeyLabels.map((key, idx) => <kbd key={idx}>{key}</kbd>)}
                  <i>|</i>
                  <span>STRUM</span>
                  <kbd>{strumKeyLabel}</kbd>
                  <i>|</i>
                  <span>PULSE</span>
                  <kbd>{pulseKeyLabel}</kbd>
                </div>
                <div className="key-legend gamepad-legend">
                  <span>GAMEPAD</span>
                  {["LT", "LB", "RB", "RT", "A"].map((btn) => <kbd key={btn} className="gp-kbd">{btn}</kbd>)}
                  <i>|</i>
                  <span>GUITAR</span>
                  <span className="guitar-frets">1 2 3 4 5 + STRUM</span>
                  {gamepadInfo && (
                    <span className="gamepad-live-tag">
                      <i className="live-dot" /> {gamepadInfo}
                    </span>
                  )}
                </div>
              </div>
              <button className="stage-button" type="button" onClick={() => setScreen("game")}>
                <span><small>03 / ENTER</small><b>GO TO STAGE</b></span><em>↗</em>
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {screen === "game" && selectedSong && selectedChart && (
        <GameStage
          song={selectedSong}
          chart={selectedChart}
          speed={speed}
          offsetMs={offsetMs}
          inputMode={inputMode}
          multiplayerRoom={multiplayerMatchRoom}
          onExit={() => {
            setMultiplayerMatchRoom(null);
            setScreen("setup");
          }}
        />
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
          onEnsureSongLoaded={async (title, artist, md5, roomCode) => {
            if (selectedSong && selectedSong.metadata.title.toLowerCase() === title.toLowerCase()) {
              if (roomCode && user) {
                void setPlayerDownloadStatus(roomCode, user.uid, "ready", 100);
              }
              return;
            }
            if (roomCode && user) {
              void setPlayerDownloadStatus(roomCode, user.uid, "downloading", 25);
            }
            try {
              if (md5) {
                await playChorusSong(
                  { md5, name: title, artist, song_length: 180, diff_guitar: 3, diff_bass: 3, diff_drums: -1, diff_keys: -1 } as ChorusSongItem,
                  false
                );
              } else {
                const res = await fetch(`/api/chorus/search?q=${encodeURIComponent(`${artist} ${title}`)}&page=1`);
                if (res.ok) {
                  const data = (await res.json()) as { data?: ChorusSongItem[] };
                  if (data.data && data.data[0]) {
                    await playChorusSong(data.data[0], false);
                  }
                }
              }
              if (roomCode && user) {
                void setPlayerDownloadStatus(roomCode, user.uid, "ready", 100);
              }
            } catch (e) {
              console.error("Auto load room song error:", e);
              if (roomCode && user) {
                void setPlayerDownloadStatus(roomCode, user.uid, "failed", 0);
              }
            }
          }}
          onStartMatch={(room) => {
            setMultiplayerMatchRoom(room);
            setShowMultiplayer(false);

            if (selectedSong) {
              const myPlayer = user ? room.players[user.uid] : undefined;
              const targetInst = myPlayer?.instrument || "guitar";
              const targetDiff = room.difficulty || myPlayer?.difficulty || "expert";

              // 1. Exact match (instrument + difficulty)
              let bestChart = selectedSong.charts.find(
                (c) => c.instrument === targetInst && c.difficulty === targetDiff
              );

              // 2. Match instrument only
              if (!bestChart) {
                bestChart = selectedSong.charts.find((c) => c.instrument === targetInst);
              }
              // 3. Match difficulty only
              if (!bestChart) {
                bestChart = selectedSong.charts.find((c) => c.difficulty === targetDiff);
              }
              // 4. Fallback to first chart
              if (!bestChart && selectedSong.charts.length > 0) {
                bestChart = selectedSong.charts[0];
              }

              if (bestChart) {
                setSelectedChart(bestChart);
              }
            }

            setScreen("game");
          }}
          onClose={() => setShowMultiplayer(false)}
        />
      )}

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}

      {showFriendsModal && (
        <FriendsModal
          onClose={() => setShowFriendsModal(false)}
          onInviteToMultiplayer={(_friend) => {
            setShowFriendsModal(false);
            setShowMultiplayer(true);
          }}
        />
      )}

      {/* SOUND CHECK GLOBAL LYRIC STUDIO MODAL */}
      {showSoundCheckLyricStudio && selectedSong && (
        <div className="game-overlay soundcheck-lyric-overlay" role="dialog" aria-modal="true">
          <div className="soundcheck-lyric-modal-card">
            <div className="soundcheck-modal-top">
              <div className="soundcheck-title-wrap">
                <div>
                  <h3>Studio Sinkronisasi Lirik Global</h3>
                  <small>{selectedSong.metadata.title} · {selectedSong.metadata.artist}</small>
                </div>
              </div>
              <button type="button" className="lyric-modal-close" onClick={closeSoundCheckLyricStudio}>✕</button>
            </div>

            <div className="soundcheck-modal-tabs">
              <button
                type="button"
                className={`soundcheck-tab-btn ${soundCheckActiveTab === "calibrate" ? "active" : ""}`}
                onClick={() => setSoundCheckActiveTab("calibrate")}
              >
                Kalibrasi & Preview ({soundCheckLyricOffsetMs > 0 ? "+" : ""}{soundCheckLyricOffsetMs}ms)
              </button>
              <button
                type="button"
                className={`soundcheck-tab-btn ${soundCheckActiveTab === "search" ? "active" : ""}`}
                onClick={() => setSoundCheckActiveTab("search")}
              >
                Cari Online (LRCLIB)
              </button>
              <button
                type="button"
                className={`soundcheck-tab-btn ${soundCheckActiveTab === "paste" ? "active" : ""}`}
                onClick={() => setSoundCheckActiveTab("paste")}
              >
                Paste LRC File
              </button>
            </div>

            <div className="soundcheck-modal-body">
              {soundCheckActiveTab === "calibrate" && (
                <div className="soundcheck-calibrate-view">
                  {/* AUDIO PREVIEW PLAYER */}
                  <div className="sc-audio-player-bar">
                    <button
                      type="button"
                      className={`sc-play-btn ${soundCheckAudioPlaying ? "is-playing" : ""}`}
                      onClick={toggleSoundCheckAudio}
                      title={soundCheckAudioPlaying ? "Pause Audio" : "Play Audio Preview"}
                    >
                      {soundCheckAudioPlaying ? "Pause" : "Play Preview"}
                    </button>
                    <div className="sc-audio-time-track">
                      <span>{Math.floor(soundCheckAudioCurrentTime / 60)}:{Math.floor(soundCheckAudioCurrentTime % 60).toString().padStart(2, "0")}</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, selectedSong.metadata.durationMs / 1000)}
                        step="0.1"
                        value={soundCheckAudioCurrentTime}
                        onChange={(e) => seekSoundCheckAudio(Number(e.target.value))}
                        className="sc-scrubber"
                      />
                      <span>{formatDuration(selectedSong.metadata.durationMs)}</span>
                    </div>
                  </div>

                  {/* LIVE SCROLLING TELEPROMPTER PREVIEW */}
                  <div className="sc-live-teleprompter-box">
                    <div className="sc-teleprompter-title">
                      <span>VISUALISASI LIRIK SINKRON (WAKTU LAGU + OFFSET)</span>
                      <small>{soundCheckLyrics.length} baris lirik</small>
                    </div>
                    <div className="sc-teleprompter-scroller">
                      {soundCheckLyrics.length === 0 ? (
                        <div className="sc-no-lyrics-hint">
                          <p>Belum ada lirik tersinkronisasi untuk lagu ini.</p>
                          <small>Gunakan tab <b>&quot;Cari Online&quot;</b> atau <b>&quot;Paste LRC&quot;</b> di atas untuk menambahkan lirik.</small>
                        </div>
                      ) : (
                        soundCheckLyrics.map((line, idx) => {
                          const activeLyricData = getActiveLyric(soundCheckLyrics, soundCheckAudioCurrentTime, soundCheckLyricOffsetMs / 1000);
                          const isActive = activeLyricData.activeIndex === idx;
                          return (
                            <div
                              key={idx}
                              className={`sc-lyric-row ${isActive ? "is-active" : ""}`}
                              onClick={() => seekSoundCheckAudio(Math.max(0, line.time - soundCheckLyricOffsetMs / 1000))}
                              title={`Lompat audio ke ${Math.floor(line.time / 60)}:${(line.time % 60).toFixed(0).padStart(2, "0")}`}
                            >
                              <span className="sc-ts">{Math.floor(line.time / 60)}:{Math.floor(line.time % 60).toString().padStart(2, "0")}</span>
                              <p className="sc-txt">{line.text}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* OFFSET FINE-TUNING CONTROLS */}
                  <div className="sc-offset-panel">
                    <div className="sc-offset-header">
                      <span>KALIBRASI OFFSET GLOBAL</span>
                      <strong className="sc-offset-val">{soundCheckLyricOffsetMs > 0 ? `+${soundCheckLyricOffsetMs}` : soundCheckLyricOffsetMs} ms</strong>
                    </div>
                    <div className="offset-btn-grid">
                      <button type="button" onClick={() => setSoundCheckLyricOffsetMs((prev) => prev - 1000)}>-1.0s</button>
                      <button type="button" onClick={() => setSoundCheckLyricOffsetMs((prev) => prev - 500)}>-500ms</button>
                      <button type="button" onClick={() => setSoundCheckLyricOffsetMs((prev) => prev - 100)}>-100ms</button>
                      <button type="button" onClick={() => setSoundCheckLyricOffsetMs((prev) => prev - 50)}>-50ms</button>
                      <button type="button" className="reset-offset-btn" onClick={() => setSoundCheckLyricOffsetMs(0)}>RESET 0ms</button>
                      <button type="button" onClick={() => setSoundCheckLyricOffsetMs((prev) => prev + 50)}>+50ms</button>
                      <button type="button" onClick={() => setSoundCheckLyricOffsetMs((prev) => prev + 100)}>+100ms</button>
                      <button type="button" onClick={() => setSoundCheckLyricOffsetMs((prev) => prev + 500)}>+500ms</button>
                      <button type="button" onClick={() => setSoundCheckLyricOffsetMs((prev) => prev + 1000)}>+1.0s</button>
                    </div>
                    <div className="offset-slider-wrap">
                      <input
                        type="range"
                        min="-5000"
                        max="5000"
                        step="25"
                        value={soundCheckLyricOffsetMs}
                        onChange={(e) => setSoundCheckLyricOffsetMs(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {soundCheckActiveTab === "search" && (
                <div className="sync-search-view">
                  <p>Cari lirik tersinkronisasi (.lrc) dari database global LRCLIB jika lirik otomatis belum pas:</p>
                  <div className="sync-search-row">
                    <input
                      type="text"
                      className="sync-text-input"
                      placeholder="Masukkan judul lagu / artis..."
                      value={soundCheckSearchQuery}
                      onChange={(e) => setSoundCheckSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleSoundCheckSearchLyrics()}
                    />
                    <button
                      type="button"
                      className="sync-action-btn"
                      onClick={() => void handleSoundCheckSearchLyrics()}
                      disabled={soundCheckSearching}
                    >
                      {soundCheckSearching ? "Mencari..." : "Cari Lirik ↗"}
                    </button>
                  </div>
                  <small className="sync-note">
                    Database LRCLIB menyediakan lirik sinkron milidetik untuk jutaan lagu internasional & populer.
                  </small>
                </div>
              )}

              {soundCheckActiveTab === "paste" && (
                <div className="sync-paste-view">
                  <p>Tempel teks lirik berformat LRC timestamp langsung di bawah:</p>
                  <textarea
                    className="sync-lrc-textarea"
                    placeholder={`[00:12.45] First line of song lyrics\n[00:16.80] Second line of song lyrics\n[00:21.10] Third line of song lyrics`}
                    rows={7}
                    value={soundCheckCustomLrc}
                    onChange={(e) => setSoundCheckCustomLrc(e.target.value)}
                  />
                  <div className="sync-paste-footer">
                    <button
                      type="button"
                      className="sync-action-btn"
                      onClick={handleSoundCheckApplyCustomLrc}
                      disabled={!soundCheckCustomLrc.trim()}
                    >
                      Terapkan Lirik Kustom ↗
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="soundcheck-modal-footer">
              <span className="soundcheck-status-tag">
                {soundCheckLyrics.length > 0 ? `${soundCheckLyrics.length} baris (${soundCheckLyricSource.toUpperCase()})` : "Belum ada lirik"}
              </span>
              <div className="soundcheck-footer-actions">
                <button
                  type="button"
                  className="global-save-btn"
                  onClick={handleSoundCheckSaveGlobal}
                  disabled={savingGlobalLyrics || !soundCheckLyrics.length}
                  title="Simpan lirik dan offset ini ke database global Firestore agar semua orang otomatis tersinkron!"
                >
                  {savingGlobalLyrics ? "Menyimpan Global..." : "Simpan Global"}
                </button>
                <button
                  type="button"
                  className="launch-button soundcheck-done-btn"
                  onClick={closeSoundCheckLyricStudio}
                >
                  Selesai <span>✓</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {screen !== "game" && (
        <footer className="riff-footer">
          <span>RIFF//LAB © 2026 REIHAN.ONLINE</span>
          <span>LOCAL-FIRST ENGINE · POWERED BY CHORUS ENCORE & CLONE HERO CHARTS</span>
          <span>NOT OFFICIALLY AFFILIATED WITH CLONE HERO OR ACTIVISION</span>
        </footer>
      )}

      {loading && (
        <div className="loading-screen" role="status">
          <RiffMark compact />
          <div className="loading-bars">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
          <b>{loadingText}</b>
          <span>Memproses paket partitur dan stem audio...</span>
        </div>
      )}
    </div>
  );
}
