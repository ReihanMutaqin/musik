import { unzipSync } from "fflate";
import { parseChart, parseMidi } from "./chart";
import type { ImportedSong, SongAsset, SongMetadata } from "./types";

type FileMap = Map<string, Uint8Array>;

const textDecoder = new TextDecoder("utf-8");
const audioPattern = /\.(ogg|opus|mp3|wav|m4a|webm)$/i;
const imagePattern = /\.(png|jpe?g|webp)$/i;

function mimeFor(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  return ({
    opus: "audio/ogg; codecs=opus",
    ogg: "audio/ogg",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    webm: "audio/webm",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

function makeBlob(bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function basename(path: string) {
  return path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
}

function parseIni(source: string) {
  const result: Record<string, string> = {};
  source.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#") || trimmed.startsWith("[")) return;
    const separator = trimmed.indexOf("=");
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim().toLowerCase();
    const value = trimmed.slice(separator + 1).trim().replace(/^"|"$/g, "");
    result[key] = value;
  });
  return result;
}

function normalizeMetadata(raw: Record<string, string>, sourceName: string): SongMetadata {
  const durationMs = Number(raw.song_length ?? raw.length ?? 0);
  return {
    title: raw.name?.trim() || sourceName.replace(/\.(sng|zip)$/i, ""),
    artist: raw.artist?.trim() || "Unknown artist",
    album: raw.album?.trim() || "Unknown release",
    year: raw.year?.replace(/^,\s*/, "").trim() || "—",
    genre: raw.genre?.trim() || "Custom chart",
    charter: raw.charter?.trim() || raw.frets?.trim() || "Unknown charter",
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    sourceName,
  };
}

function selectAudio(entries: Array<[string, Uint8Array]>): SongAsset[] {
  const audio = entries
    .filter(([name]) => audioPattern.test(name) && !/(^|\/)preview\./i.test(name))
    .map(([name, bytes]) => ({ name: basename(name), blob: makeBlob(bytes, mimeFor(name)) }));

  const rank = (name: string) => {
    if (/^song\./i.test(name)) return 0;
    if (/^guitar\./i.test(name)) return 1;
    if (/^rhythm\./i.test(name) || /^bass\./i.test(name)) return 2;
    if (/^drums/i.test(name)) return 3;
    if (/^vocals/i.test(name)) return 4;
    if (/^keys/i.test(name)) return 5;
    if (/^crowd/i.test(name)) return 8;
    return 6;
  };
  return audio.sort((a, b) => rank(a.name) - rank(b.name));
}

function buildSong(
  files: FileMap,
  rawMetadata: Record<string, string>,
  sourceName: string,
  sourceType: "sng" | "zip",
): ImportedSong {
  const entries = [...files.entries()];
  const chartEntry = entries.find(([name]) => basename(name) === "notes.chart")
    ?? entries.find(([name]) => name.toLowerCase().endsWith(".chart"));
  const midiEntry = entries.find(([name]) => basename(name) === "notes.mid")
    ?? entries.find(([name]) => name.toLowerCase().endsWith(".mid"));
  const charts = chartEntry
    ? parseChart(textDecoder.decode(chartEntry[1]))
    : midiEntry
      ? parseMidi(midiEntry[1])
      : [];
  const audio = selectAudio(entries);
  const artEntry = entries.find(([name]) => /(^|\/)album\.(png|jpe?g|webp)$/i.test(name))
    ?? entries.find(([name]) => imagePattern.test(name));
  const metadata = normalizeMetadata(rawMetadata, sourceName);

  if (!charts.length) throw new Error("Chart playable tidak ditemukan. Paket perlu berisi notes.chart atau notes.mid.");
  if (!audio.length) throw new Error("Audio tidak ditemukan. Sertakan song.ogg, song.opus, MP3, WAV, atau stem audio.");

  return {
    id: `${slug(metadata.artist)}-${slug(metadata.title)}-${Date.now()}`,
    metadata,
    charts,
    audio,
    artwork: artEntry
      ? { name: basename(artEntry[0]), blob: makeBlob(artEntry[1], mimeFor(artEntry[0])) }
      : undefined,
    sourceType,
    fileCount: entries.length,
  };
}

function readSng(bytes: Uint8Array, sourceName: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const ensure = (length: number) => {
    if (offset + length > bytes.byteLength) throw new Error("File .sng terpotong atau rusak.");
  };
  const readText = (length: number) => {
    ensure(length);
    const value = textDecoder.decode(bytes.subarray(offset, offset + length));
    offset += length;
    return value;
  };
  const readU8 = () => { ensure(1); return view.getUint8(offset++); };
  const readI32 = () => { ensure(4); const value = view.getInt32(offset, true); offset += 4; return value; };
  const readU32 = () => { ensure(4); const value = view.getUint32(offset, true); offset += 4; return value; };
  const readU64 = () => {
    ensure(8);
    const value = Number(view.getBigUint64(offset, true));
    offset += 8;
    if (!Number.isSafeInteger(value)) throw new Error("Ukuran data .sng tidak didukung browser ini.");
    return value;
  };

  if (readText(6) !== "SNGPKG") throw new Error("Header .sng tidak dikenali.");
  const version = readU32();
  if (version !== 1) throw new Error(`Versi .sng ${version} belum didukung.`);
  ensure(16);
  const mask = bytes.slice(offset, offset + 16);
  offset += 16;

  const metadataLength = readU64();
  const metadataEnd = offset + metadataLength;
  const metadataCount = readU64();
  if (metadataCount > 10_000 || metadataEnd > bytes.byteLength) throw new Error("Metadata .sng tidak valid.");
  const metadata: Record<string, string> = {};
  for (let index = 0; index < metadataCount; index += 1) {
    const keyLength = readI32();
    if (keyLength < 0 || keyLength > 1_000_000) throw new Error("Kunci metadata .sng tidak valid.");
    const key = readText(keyLength).toLowerCase();
    const valueLength = readI32();
    if (valueLength < 0 || valueLength > 8_000_000) throw new Error("Nilai metadata .sng tidak valid.");
    metadata[key] = readText(valueLength);
  }
  offset = metadataEnd;

  const indexLength = readU64();
  const indexEnd = offset + indexLength;
  const fileCount = readU64();
  if (fileCount > 20_000 || indexEnd > bytes.byteLength) throw new Error("Indeks file .sng tidak valid.");
  const fileIndex: Array<{ name: string; length: number; at: number }> = [];
  for (let index = 0; index < fileCount; index += 1) {
    const name = readText(readU8());
    const length = readU64();
    const at = readU64();
    if (at + length > bytes.byteLength) throw new Error(`Data ${name} di dalam .sng tidak lengkap.`);
    fileIndex.push({ name, length, at });
  }

  const files: FileMap = new Map();
  fileIndex.forEach((file) => {
    const decoded = new Uint8Array(file.length);
    for (let index = 0; index < file.length; index += 1) {
      decoded[index] = bytes[file.at + index] ^ mask[index % 16] ^ (index & 0xff);
    }
    files.set(file.name, decoded);
  });
  return buildSong(files, metadata, sourceName, "sng");
}

function readZip(bytes: Uint8Array, sourceName: string) {
  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(bytes);
  } catch {
    throw new Error("ZIP tidak dapat dibuka. Pastikan arsip tidak memakai password dan tidak rusak.");
  }
  const entries = Object.entries(extracted).filter(([name]) => !name.endsWith("/") && !/(^|\/)__MACOSX\//i.test(name));
  const chartPaths = entries.filter(([name]) => /(^|\/)(notes\.(chart|mid)|[^/]+\.chart)$/i.test(name));
  if (!chartPaths.length) throw new Error("ZIP belum memuat notes.chart atau notes.mid.");

  const roots = [...new Set(chartPaths.map(([name]) => name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : ""))];
  return roots.map((root, rootIndex) => {
    const scoped = entries.filter(([name]) => root === "" || name.startsWith(root));
    const files: FileMap = new Map(scoped.map(([name, data]) => [root ? name.slice(root.length) : name, data]));
    const iniEntry = [...files.entries()].find(([name]) => basename(name) === "song.ini");
    const metadata = iniEntry ? parseIni(textDecoder.decode(iniEntry[1])) : {};
    const label = roots.length > 1 ? `${sourceName} · ${rootIndex + 1}` : sourceName;
    return buildSong(files, metadata, label, "zip");
  });
}

export async function importRhythmFile(file: File): Promise<ImportedSong[]> {
  if (file.size > 800 * 1024 * 1024) throw new Error("Paket terlalu besar. Batas impor saat ini 800 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "sng" && extension !== "zip") throw new Error("Gunakan file .sng atau .zip dari paket chart.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return extension === "sng" ? [readSng(bytes, file.name)] : readZip(bytes, file.name);
}
