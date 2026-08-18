export type Difficulty = "easy" | "medium" | "hard" | "expert";

export type Instrument = "guitar" | "bass" | "rhythm" | "drums" | "keys" | "other";

export type RhythmNote = {
  id: number;
  tick: number;
  time: number;
  duration: number;
  lanes: number[];
  overdrive: boolean;
};

export type SectionMarker = {
  time: number;
  name: string;
};

export type PlayableChart = {
  id: string;
  label: string;
  instrument: Instrument;
  difficulty: Difficulty;
  notes: RhythmNote[];
  sections: SectionMarker[];
};

export type SongMetadata = {
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  charter: string;
  durationMs: number;
  sourceName: string;
};

export type SongAsset = {
  name: string;
  blob: Blob;
};

export type ImportedSong = {
  id: string;
  metadata: SongMetadata;
  charts: PlayableChart[];
  audio: SongAsset[];
  artwork?: SongAsset;
  sourceType: "sng" | "zip";
  fileCount: number;
};

