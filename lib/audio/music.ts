export const NOTE_NAMES = ["DO", "RE", "MI", "FA", "SOL", "LA", "SI"] as const;

export type ScaleId = "major" | "minor" | "major-pentatonic" | "minor-pentatonic" | "chromatic" | "japanese" | "ambient" | "experimental";
export type MusicModeId = "harmony" | "theremin" | "air-piano" | "drums" | "chords" | "ambient" | "conductor" | "dual-hand";
export type PresetId = "soft-bell" | "warm-pad" | "digital-pluck" | "dream-lead" | "tiny-robot" | "retro-wave" | "glass" | "soft-bass" | "air";

export const SCALES: Record<ScaleId, { label: string; intervals: number[] }> = {
  major: { label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: "Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  "major-pentatonic": { label: "Pentatonic Major", intervals: [0, 2, 4, 7, 9] },
  "minor-pentatonic": { label: "Pentatonic Minor", intervals: [0, 3, 5, 7, 10] },
  chromatic: { label: "Chromatic", intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  japanese: { label: "Japanese", intervals: [0, 1, 5, 7, 8] },
  ambient: { label: "Ambient", intervals: [0, 2, 7, 9, 14] },
  experimental: { label: "Experimental", intervals: [0, 1, 4, 6, 9] },
};

export const MUSIC_MODES: Array<{ id: MusicModeId; label: string; short: string }> = [
  { id: "harmony", label: "Harmony", short: "Jari memilih nada, posisi tangan memilih oktaf." },
  { id: "theremin", label: "Theremin", short: "Naik-turun mengatur pitch, kiri-kanan mengatur warna suara." },
  { id: "air-piano", label: "Air Piano", short: "Area horizontal kamera menjadi tuts piano tak terlihat." },
  { id: "drums", label: "Gesture Drums", short: "Jumlah jari memicu kick, snare, hi-hat, dan clap." },
  { id: "chords", label: "Chord Magic", short: "Bentuk tangan memainkan harmoni tanpa teori rumit." },
  { id: "ambient", label: "Ambient Hands", short: "Gerakan pelan membentuk pad yang lembut dan luas." },
  { id: "conductor", label: "Beat Conductor", short: "Kecepatan tangan mengatur ketukan dan intensitas." },
  { id: "dual-hand", label: "Dual Hand Synth", short: "Tangan kiri untuk nada, tangan kanan untuk volume dan efek." },
];

export const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: "soft-bell", label: "Soft Bell" },
  { id: "warm-pad", label: "Warm Pad" },
  { id: "digital-pluck", label: "Digital Pluck" },
  { id: "dream-lead", label: "Dream Lead" },
  { id: "tiny-robot", label: "Tiny Robot" },
  { id: "retro-wave", label: "Retro Wave" },
  { id: "glass", label: "Glass" },
  { id: "soft-bass", label: "Soft Bass" },
  { id: "air", label: "Air" },
];

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function scaleMidiAt(position: number, scaleId: ScaleId, lowMidi = 48, octaves = 3) {
  const scale = SCALES[scaleId] || SCALES["major-pentatonic"];
  const normalized = Math.max(0, Math.min(0.999, position));
  const steps = scale.intervals.length * octaves;
  const step = Math.min(steps - 1, Math.floor(normalized * steps));
  const octave = Math.floor(step / scale.intervals.length);
  return lowMidi + octave * 12 + scale.intervals[step % scale.intervals.length];
}

export function noteLabelFromMidi(midi: number) {
  const solfege = ["DO", "DO♯", "RE", "RE♯", "MI", "FA", "FA♯", "SOL", "SOL♯", "LA", "LA♯", "SI"];
  return `${solfege[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
