export type TimedLyricLine = {
  time: number; // in seconds
  duration: number; // in seconds
  text: string;
};

/**
 * Parses an LRC formatted string (e.g. "[01:23.45] Lyric line text" or with [offset:500])
 */
export function parseLrc(source: string): TimedLyricLine[] {
  if (!source) return [];
  const lines = source.split(/\r?\n/);
  const parsed: Array<{ time: number; text: string }> = [];

  let globalOffsetMs = 0;
  const offsetMatch = source.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch) {
    globalOffsetMs = parseInt(offsetMatch[1], 10) || 0;
  }

  const timeRegex = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("[ar:") || trimmed.startsWith("[ti:") || trimmed.startsWith("[al:") || trimmed.startsWith("[offset:") || trimmed.startsWith("[by:")) {
      continue;
    }

    const matches = [...trimmed.matchAll(timeRegex)];
    if (!matches.length) continue;

    const text = trimmed.replace(timeRegex, "").trim();
    if (!text) continue;

    for (const match of matches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millisRaw = (match[3] || "0").padEnd(3, "0").slice(0, 3);
      const millis = parseInt(millisRaw, 10) / 1000;
      const rawSec = minutes * 60 + seconds + millis;
      const adjustedSec = Math.max(0, rawSec + globalOffsetMs / 1000);

      parsed.push({ time: adjustedSec, text });
    }
  }

  parsed.sort((a, b) => a.time - b.time);

  // Compute line durations
  return parsed.map((item, index) => {
    const nextTime = parsed[index + 1]?.time ?? item.time + 4.5;
    const duration = Math.min(8, Math.max(1.0, nextTime - item.time));
    return {
      time: item.time,
      duration,
      text: item.text,
    };
  });
}

/**
 * Extracts lyrics embedded inside a .chart file's [Events] section
 */
export function parseChartLyrics(source: string, tickToSeconds: (tick: number) => number): TimedLyricLine[] {
  const eventsMatch = source.match(/\[Events\]\s*\r?\n?\{([\s\S]*?)^}/m);
  if (!eventsMatch) return [];

  const lines = eventsMatch[1].split(/\r?\n/);
  const words: Array<{ time: number; text: string }> = [];

  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s*=\s*E\s+"(?:lyric|phrase_start|phrase_end)\s*(.+?)"\s*$/i);
    if (!match) continue;
    const tick = parseInt(match[1], 10);
    let text = match[2].trim().replace(/^"|"$/g, "");
    if (text) {
      // Remove trailing hyphens or equal signs common in lyric charts
      text = text.replace(/[=-]+$/, "");
      words.push({ time: tickToSeconds(tick), text });
    }
  }

  if (!words.length) return [];

  // Group words into natural lines (max 6-8 words OR 3.5 seconds OR large time gap)
  const linesGrouped: TimedLyricLine[] = [];
  let currentGroup: string[] = [];
  let lineStartTime = words[0].time;

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const prev = words[i - 1];

    const timeDiff = prev ? word.time - prev.time : 0;
    const shouldBreak =
      (prev && timeDiff > 1.2) ||
      currentGroup.length >= 7 ||
      (currentGroup.join(" ").length > 35 && timeDiff > 0.4);

    if (shouldBreak && currentGroup.length > 0) {
      const lineText = currentGroup.join(" ").trim();
      if (lineText.length > 0) {
        linesGrouped.push({
          time: lineStartTime,
          duration: Math.max(1.5, Math.min(5, (prev ? prev.time : word.time) - lineStartTime + 1.2)),
          text: lineText,
        });
      }
      currentGroup = [];
      lineStartTime = word.time;
    }

    currentGroup.push(word.text);
  }

  if (currentGroup.length > 0) {
    const lineText = currentGroup.join(" ").trim();
    if (lineText.length > 0) {
      const last = words[words.length - 1];
      linesGrouped.push({
        time: lineStartTime,
        duration: Math.max(1.5, Math.min(5, last.time - lineStartTime + 1.2)),
        text: lineText,
      });
    }
  }

  return linesGrouped;
}

/**
 * Returns current and next active lyric lines based on playback time & user offset calibration
 */
export function getActiveLyric(
  lyrics: TimedLyricLine[],
  currentTime: number,
  offsetSeconds: number = 0
): {
  current?: TimedLyricLine;
  next?: TimedLyricLine;
  lineProgress: number;
  activeIndex: number;
  upcomingLines: TimedLyricLine[];
} {
  if (!lyrics.length) return { lineProgress: 0, activeIndex: -1, upcomingLines: [] };

  const effectiveTime = Math.max(0, currentTime + offsetSeconds);

  for (let i = 0; i < lyrics.length; i += 1) {
    const line = lyrics[i];
    if (effectiveTime >= line.time - 0.15 && effectiveTime <= line.time + line.duration + 0.3) {
      const progress = Math.min(1, Math.max(0, (effectiveTime - line.time) / Math.max(0.1, line.duration)));
      return {
        current: line,
        next: lyrics[i + 1],
        lineProgress: progress,
        activeIndex: i,
        upcomingLines: lyrics.slice(i + 1, i + 5),
      };
    }
  }

  // Find upcoming line
  const upcomingIdx = lyrics.findIndex((l) => l.time > effectiveTime);
  const upcoming = upcomingIdx !== -1 ? lyrics[upcomingIdx] : undefined;
  return {
    next: upcoming,
    lineProgress: 0,
    activeIndex: upcomingIdx !== -1 ? upcomingIdx - 1 : -1,
    upcomingLines: upcomingIdx !== -1 ? lyrics.slice(upcomingIdx, upcomingIdx + 4) : [],
  };
}
