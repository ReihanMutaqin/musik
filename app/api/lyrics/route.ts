import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const track = searchParams.get("track") || searchParams.get("title") || "";
  const artist = searchParams.get("artist") || "";
  const album = searchParams.get("album") || "";
  const duration = searchParams.get("duration") || "";

  if (!track.trim()) {
    return NextResponse.json({ error: "Track title is required" }, { status: 400 });
  }

  // Clean artist and track names (e.g. remove "(Live)", "(Metallica cover)", "feat. ...")
  const cleanTrack = track
    .replace(/\s*\([^)]*(cover|live|remaster|version|edit|karaoke|instrumental)[^)]*\)/gi, "")
    .replace(/\s*-\s*(live|remastered|mono|stereo).*/gi, "")
    .trim();

  const cleanArtist = artist
    .replace(/\s*\([^)]*\)/gi, "")
    .replace(/\s*feat\..*/gi, "")
    .replace(/\s*ft\..*/gi, "")
    .trim();

  try {
    // 1. Try exact match using /api/get
    const queryParams = new URLSearchParams({
      track_name: cleanTrack || track,
      artist_name: cleanArtist || artist,
    });
    if (album) queryParams.set("album_name", album);
    if (duration && Number(duration) > 0) queryParams.set("duration", Math.round(Number(duration)).toString());

    let res = await fetch(`https://lrclib.net/api/get?${queryParams.toString()}`, {
      headers: {
        "User-Agent": "RIFF-LAB/1.0 (https://reihan.online)",
      },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        id?: number;
        trackName?: string;
        artistName?: string;
        syncedLyrics?: string;
        plainLyrics?: string;
      };
      if (data && (data.syncedLyrics || data.plainLyrics)) {
        return NextResponse.json({
          source: "lrclib",
          id: data.id,
          trackName: data.trackName,
          artistName: data.artistName,
          syncedLyrics: data.syncedLyrics,
          plainLyrics: data.plainLyrics,
        }, {
          headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
        });
      }
    }

    // 2. Fallback to /api/search
    const searchQuery = `${cleanArtist} ${cleanTrack}`.trim() || track;
    res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`, {
      headers: {
        "User-Agent": "RIFF-LAB/1.0 (https://reihan.online)",
      },
    });

    if (res.ok) {
      const results = (await res.json()) as Array<{
        id: number;
        trackName: string;
        artistName: string;
        syncedLyrics?: string;
        plainLyrics?: string;
      }>;

      if (Array.isArray(results) && results.length > 0) {
        const best = results.find((item) => item.syncedLyrics) || results[0];
        return NextResponse.json({
          source: "lrclib-search",
          id: best.id,
          trackName: best.trackName,
          artistName: best.artistName,
          syncedLyrics: best.syncedLyrics,
          plainLyrics: best.plainLyrics,
        }, {
          headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
        });
      }
    }

    return NextResponse.json({ source: "none", syncedLyrics: null, plainLyrics: null });
  } catch (error) {
    console.error("LRCLIB fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch lyrics" }, { status: 500 });
  }
}
