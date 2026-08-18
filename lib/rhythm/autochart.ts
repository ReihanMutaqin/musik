import type { Difficulty, PlayableChart, RhythmNote, SectionMarker } from "./types";

/**
 * AI / Algorithmic AutoChart Generator
 * Analyzes audio buffer waveform energy & transients to create playable 5-lane rhythm charts.
 */
export async function generateAutoChart(audioBuffer: AudioBuffer, title = "Audio Track"): Promise<PlayableChart[]> {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;

  // Window size: 50ms
  const hopSize = Math.floor(sampleRate * 0.04);
  const windowCount = Math.floor(channelData.length / hopSize);

  const energies: number[] = new Array(windowCount);
  const times: number[] = new Array(windowCount);

  // 1. Calculate Short-Time RMS Energy
  for (let i = 0; i < windowCount; i += 1) {
    const start = i * hopSize;
    let sum = 0;
    const len = Math.min(hopSize, channelData.length - start);
    for (let j = 0; j < len; j += 1) {
      const s = channelData[start + j];
      sum += s * s;
    }
    energies[i] = Math.sqrt(sum / len);
    times[i] = (i * hopSize) / sampleRate;
  }

  // 2. Onset Detection via Local Dynamic Peak Thresholding
  const movingWindow = 12; // ~500ms
  const rawOnsets: Array<{ time: number; energy: number }> = [];

  for (let i = movingWindow; i < windowCount - movingWindow; i += 1) {
    let localMean = 0;
    for (let j = i - movingWindow; j <= i + movingWindow; j += 1) {
      localMean += energies[j];
    }
    localMean /= movingWindow * 2 + 1;

    const threshold = localMean * 1.35 + 0.008;
    const isPeak =
      energies[i] > threshold &&
      energies[i] >= energies[i - 1] &&
      energies[i] >= energies[i + 1] &&
      energies[i] >= energies[i - 2] &&
      energies[i] >= energies[i + 2];

    if (isPeak) {
      // Minimum distance between notes ~ 90ms
      const last = rawOnsets[rawOnsets.length - 1];
      if (!last || times[i] - last.time > 0.085) {
        rawOnsets.push({ time: times[i], energy: energies[i] });
      }
    }
  }

  // 3. Generate Section Markers
  const sections: SectionMarker[] = [
    { time: 0, name: "Intro" },
    { time: duration * 0.18, name: "Verse 1" },
    { time: duration * 0.38, name: "Chorus 1" },
    { time: duration * 0.58, name: "Guitar Solo" },
    { time: duration * 0.76, name: "Chorus 2" },
    { time: duration * 0.92, name: "Outro" },
  ];

  // 4. Generate 4 standard difficulty charts (Easy, Medium, Hard, Expert)
  const difficulties: Difficulty[] = ["easy", "medium", "hard", "expert"];
  const charts: PlayableChart[] = [];

  for (const diff of difficulties) {
    const notes: RhythmNote[] = [];
    let noteId = 0;
    let currentLane = 0;
    let starPhraseActive = false;
    let starPhraseCount = 0;

    // Density and lane range based on difficulty
    const step = diff === "easy" ? 4 : diff === "medium" ? 2 : diff === "hard" ? 1.4 : 1;
    const maxLane = diff === "easy" ? 2 : diff === "medium" ? 3 : 4;
    const chordChance = diff === "expert" ? 0.18 : diff === "hard" ? 0.1 : 0;
    const sustainThreshold = diff === "easy" ? 0.6 : diff === "medium" ? 0.45 : 0.35;

    for (let i = 0; i < rawOnsets.length; i += 1) {
      if (diff !== "expert" && i % Math.round(step) !== 0) continue;

      const onset = rawOnsets[i];
      const nextOnset = rawOnsets[i + 1];
      const gap = nextOnset ? nextOnset.time - onset.time : 1.0;

      // Smart lane progression (Guitar Hero pattern feel)
      if (Math.random() < 0.35) {
        // Step movement (+1 or -1)
        const dir = Math.random() < 0.5 ? 1 : -1;
        currentLane = Math.max(0, Math.min(maxLane, currentLane + dir));
      } else if (Math.random() < 0.25) {
        // Jump to low/high
        currentLane = Math.floor(Math.random() * (maxLane + 1));
      }

      const lanes = [currentLane];

      // Occasional chords on high energy or downbeats
      if (chordChance > 0 && Math.random() < chordChance && onset.energy > 0.05) {
        const partnerLane = currentLane === 0 ? 1 : currentLane === 4 ? 3 : currentLane + 1;
        lanes.push(partnerLane);
        lanes.sort((a, b) => a - b);
      }

      // Sustain calculation
      let durationMs = 0;
      if (gap > sustainThreshold && Math.random() < 0.4) {
        durationMs = Math.min(2.5, gap * 0.75);
      }

      // Overdrive / Star Power phrases every ~25-35 notes
      if (!starPhraseActive && noteId > 0 && noteId % 28 === 0) {
        starPhraseActive = true;
        starPhraseCount = 5 + Math.floor(Math.random() * 4); // 5-8 star notes
      }

      const isOverdrive = starPhraseActive;
      if (starPhraseActive) {
        starPhraseCount -= 1;
        if (starPhraseCount <= 0) starPhraseActive = false;
      }

      notes.push({
        id: noteId += 1,
        tick: Math.round(onset.time * 480),
        time: onset.time,
        duration: durationMs,
        lanes,
        overdrive: isOverdrive,
      });
    }

    charts.push({
      id: `ai-${diff}-guitar`,
      difficulty: diff,
      instrument: "guitar",
      label: `Lead Guitar (AI AutoChart)`,
      notes,
      sections,
    });
  }

  return charts;
}
