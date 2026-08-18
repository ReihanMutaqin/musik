import { Midi } from "@tonejs/midi";
import type {
  Difficulty,
  Instrument,
  PlayableChart,
  RhythmNote,
  SectionMarker,
} from "./types";

const difficultyOrder: Difficulty[] = ["easy", "medium", "hard", "expert"];

const instrumentNames: Record<string, { instrument: Instrument; label: string }> = {
  Single: { instrument: "guitar", label: "Lead Guitar" },
  DoubleGuitar: { instrument: "guitar", label: "Co-op Guitar" },
  DoubleBass: { instrument: "bass", label: "Bass" },
  DoubleRhythm: { instrument: "rhythm", label: "Rhythm" },
  Drums: { instrument: "drums", label: "Drums" },
  Keyboard: { instrument: "keys", label: "Keys" },
};

const midiTracks: Record<string, { instrument: Instrument; label: string }> = {
  "PART GUITAR": { instrument: "guitar", label: "Lead Guitar" },
  "T1 GEMS": { instrument: "guitar", label: "Lead Guitar" },
  "PART BASS": { instrument: "bass", label: "Bass" },
  "PART RHYTHM": { instrument: "rhythm", label: "Rhythm" },
  "PART DRUMS": { instrument: "drums", label: "Drums" },
  "PART KEYS": { instrument: "keys", label: "Keys" },
};

function readSections(source: string) {
  const sections = new Map<string, string>();
  const expression = /^\[([^\]]+)]\s*\r?\n?\{([\s\S]*?)^}/gm;
  for (const match of source.matchAll(expression)) {
    sections.set(match[1].trim(), match[2]);
  }
  return sections;
}

function readSongValue(section: string, key: string) {
  const match = section.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "mi"));
  return match?.[1]?.replace(/^"|"$/g, "").trim();
}

type TempoPoint = { tick: number; bpm: number; seconds: number };

function makeTickConverter(sync: string, resolution: number, offset: number) {
  const raw = [...sync.matchAll(/^\s*(\d+)\s*=\s*B\s+(\d+)/gm)]
    .map((match) => ({ tick: Number(match[1]), bpm: Number(match[2]) / 1000 }))
    .filter((point) => point.bpm > 0)
    .sort((a, b) => a.tick - b.tick);

  if (!raw.length || raw[0].tick !== 0) raw.unshift({ tick: 0, bpm: 120 });

  const points: TempoPoint[] = [];
  let seconds = offset;
  let previousTick = raw[0].tick;
  let previousBpm = raw[0].bpm;
  points.push({ ...raw[0], seconds });

  for (let index = 1; index < raw.length; index += 1) {
    const point = raw[index];
    seconds += ((point.tick - previousTick) * 60) / (previousBpm * resolution);
    points.push({ ...point, seconds });
    previousTick = point.tick;
    previousBpm = point.bpm;
  }

  return (tick: number) => {
    let low = 0;
    let high = points.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (points[middle].tick <= tick) low = middle;
      else high = middle - 1;
    }
    const point = points[low];
    return point.seconds + ((tick - point.tick) * 60) / (point.bpm * resolution);
  };
}

function parseEventSections(events: string, tickToSeconds: (tick: number) => number) {
  const markers: SectionMarker[] = [];
  for (const match of events.matchAll(/^\s*(\d+)\s*=\s*E\s+"section\s+(.+?)"\s*$/gim)) {
    markers.push({ time: tickToSeconds(Number(match[1])), name: match[2].trim() });
  }
  return markers.sort((a, b) => a.time - b.time);
}

export function parseChart(source: string): PlayableChart[] {
  const clean = source.replace(/^\uFEFF/, "");
  const sections = readSections(clean);
  const song = sections.get("Song") ?? "";
  const sync = sections.get("SyncTrack") ?? "";
  const resolution = Number(readSongValue(song, "Resolution")) || 192;
  const offset = Number(readSongValue(song, "Offset")) || 0;
  const tickToSeconds = makeTickConverter(sync, resolution, offset);
  const markers = parseEventSections(sections.get("Events") ?? "", tickToSeconds);
  const charts: PlayableChart[] = [];

  for (const [name, body] of sections) {
    const sectionMatch = name.match(/^(Easy|Medium|Hard|Expert)(.+)$/);
    if (!sectionMatch) continue;
    const difficulty = sectionMatch[1].toLowerCase() as Difficulty;
    const instrumentInfo = instrumentNames[sectionMatch[2]];
    if (!instrumentInfo || instrumentInfo.instrument === "drums") continue;

    const grouped = new Map<number, { lanes: Set<number>; sustain: number; overdrive: boolean }>();
    const powerPhrases = [...body.matchAll(/^\s*(\d+)\s*=\s*S\s+2\s+(\d+)/gm)].map((match) => ({
      from: Number(match[1]),
      to: Number(match[1]) + Number(match[2]),
    }));

    for (const match of body.matchAll(/^\s*(\d+)\s*=\s*N\s+(\d+)\s+(\d+)/gm)) {
      const tick = Number(match[1]);
      const laneCode = Number(match[2]);
      if ((laneCode < 0 || laneCode > 4) && laneCode !== 7) continue;
      const lane = laneCode === 7 ? -1 : laneCode;
      const sustain = Number(match[3]);
      const current = grouped.get(tick) ?? { lanes: new Set<number>(), sustain: 0, overdrive: false };
      current.lanes.add(lane);
      current.sustain = Math.max(current.sustain, sustain);
      current.overdrive = powerPhrases.some((phrase) => tick >= phrase.from && tick <= phrase.to);
      grouped.set(tick, current);
    }

    const notes: RhythmNote[] = [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([tick, note], index) => {
        const start = tickToSeconds(tick);
        return {
          id: index,
          tick,
          time: start,
          duration: Math.max(0, tickToSeconds(tick + note.sustain) - start),
          lanes: [...note.lanes].sort((a, b) => a - b),
          overdrive: note.overdrive,
        };
      });

    if (notes.length) {
      charts.push({
        id: `chart-${name}`,
        label: instrumentInfo.label,
        instrument: instrumentInfo.instrument,
        difficulty,
        notes,
        sections: markers,
      });
    }
  }

  return charts.sort((a, b) => {
    if (a.instrument !== b.instrument) return a.label.localeCompare(b.label);
    return difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty);
  });
}

export function parseMidi(bytes: Uint8Array): PlayableChart[] {
  const midi = new Midi(bytes);
  const charts: PlayableChart[] = [];

  for (const track of midi.tracks) {
    const info = midiTracks[track.name.trim().toUpperCase()];
    if (!info || info.instrument === "drums") continue;

    difficultyOrder.forEach((difficulty, difficultyIndex) => {
      const base = 60 + difficultyIndex * 12;
      const playable = track.notes.filter((note) =>
        (note.midi >= base && note.midi <= base + 4) || note.midi === base - 1,
      );
      if (!playable.length) return;

      const grouped = new Map<number, typeof playable>();
      playable.forEach((note) => {
        const group = grouped.get(note.ticks) ?? [];
        group.push(note);
        grouped.set(note.ticks, group);
      });

      const notes: RhythmNote[] = [...grouped.entries()]
        .sort(([a], [b]) => a - b)
        .map(([tick, group], index) => ({
          id: index,
          tick,
          time: Math.min(...group.map((note) => note.time)),
          duration: Math.max(...group.map((note) => note.duration)),
          lanes: group.map((note) => (note.midi === base - 1 ? -1 : note.midi - base)).sort((a, b) => a - b),
          overdrive: false,
        }));

      charts.push({
        id: `midi-${track.name}-${difficulty}`,
        label: info.label,
        instrument: info.instrument,
        difficulty,
        notes,
        sections: [],
      });
    });
  }

  return charts.sort((a, b) => {
    if (a.instrument !== b.instrument) return a.label.localeCompare(b.label);
    return difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty);
  });
}

