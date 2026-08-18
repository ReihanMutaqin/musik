import type { Difficulty, ImportedSong, PlayableChart, RhythmNote } from "./types";

const patterns: Record<Difficulty, number[][]> = {
  easy: [[0], [1], [2], [3], [2], [1], [4], [2]],
  medium: [[0], [1], [2], [3], [4], [3], [1, 2], [2]],
  hard: [[0], [2], [1], [3], [2, 4], [1], [0, 2], [3]],
  expert: [[0], [1], [2], [3], [4], [1, 3], [0, 2], [2, 4], [1], [3], [0, 4], [2]],
};

function createNotes(difficulty: Difficulty) {
  const notes: RhythmNote[] = [];
  const pattern = patterns[difficulty];
  const interval = difficulty === "easy" ? 0.75 : difficulty === "medium" ? 0.625 : 0.5;
  for (let index = 0; 2 + index * interval < 19; index += 1) {
    const lanes = pattern[index % pattern.length];
    const isHold = index % 4 === 3 || index % 7 === 0;
    const duration = isHold ? (index % 7 === 0 ? interval * 2.2 : interval * 1.3) : 0;
    notes.push({
      id: index,
      tick: index * 192,
      time: 2 + index * interval,
      duration,
      lanes,
      overdrive: (index >= 8 && index <= 14) || (index >= 25 && index <= 31),
    });
  }
  return notes;
}

function createWav() {
  const sampleRate = 22_050;
  const duration = 21;
  const samples = sampleRate * duration;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(at + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);

  let noise = 918_273;
  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const beatPhase = (time * 2) % 1;
    const barBeat = Math.floor(time * 2) % 8;
    const kick = Math.sin(2 * Math.PI * (76 - beatPhase * 30) * time) * Math.exp(-beatPhase * 12) * (barBeat % 2 === 0 ? 0.6 : 0.2);
    noise = (noise * 1_664_525 + 1_013_904_223) >>> 0;
    const random = noise / 0xffffffff * 2 - 1;
    const snare = random * Math.exp(-beatPhase * 18) * (barBeat % 4 === 2 ? 0.24 : 0);
    const bassFrequency = [55, 65.41, 73.42, 82.41][Math.floor(time / 2) % 4];
    const bass = Math.sin(2 * Math.PI * bassFrequency * time) * 0.16;
    const pulse = Math.sin(2 * Math.PI * bassFrequency * 4 * time) * 0.06 * (beatPhase < 0.52 ? 1 : 0);
    const fade = Math.min(1, time / 0.4, (duration - time) / 0.7);
    const sample = Math.max(-1, Math.min(1, (kick + snare + bass + pulse) * Math.max(0, fade)));
    view.setInt16(44 + index * 2, sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function createTrainingSong(): ImportedSong {
  const sections = [
    { time: 0, name: "Boot sequence" },
    { time: 4, name: "Neon pulse" },
    { time: 10, name: "Voltage rise" },
    { time: 16, name: "Final circuit" },
  ];
  const charts: PlayableChart[] = (Object.keys(patterns) as Difficulty[]).map((difficulty) => ({
    id: `training-${difficulty}`,
    label: "Lead Guitar",
    instrument: "guitar",
    difficulty,
    notes: createNotes(difficulty),
    sections,
  }));
  return {
    id: "riff-lab-training-signal",
    metadata: {
      title: "Neon Circuit",
      artist: "RIFF//LAB System",
      album: "Training Signal 01",
      year: "2026",
      genre: "Electro pulse",
      charter: "Reihan Online",
      durationMs: 21_000,
      sourceName: "Built-in training riff",
    },
    charts,
    audio: [{ name: "training.wav", blob: createWav() }],
    sourceType: "zip",
    fileCount: 2,
  };
}

