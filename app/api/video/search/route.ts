import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type VideoSearchResult = {
  videoId: string;
  title: string;
  author: string;
  durationText?: string;
  thumbnailUrl?: string;
};

/**
 * Smart cleaning of artist and song titles (removes chart metadata, parenthesis, noise)
 */
function cleanSearchQuery(artist: string, title: string): string {
  const cleanArtist = artist
    .replace(/unknown artist/gi, "")
    .replace(/various artists/gi, "")
    .trim();

  const cleanTitle = title
    .replace(/\(.*?\)/g, "") // remove (Official Video), (Explicit), (Clone Hero), etc.
    .replace(/\[.*?\]/g, "") // remove [Full Band], [Live], etc.
    .replace(/official\s*(music)?\s*video/gi, "")
    .replace(/official\s*audio/gi, "")
    .replace(/remaster(ed)?/gi, "")
    .replace(/4k|hd|hq|60fps/gi, "")
    .replace(/clone\s*hero(\s*chart)?/gi, "")
    .replace(/guitar\s*hero/gi, "")
    .replace(/rock\s*band/gi, "")
    .trim();

  return `${cleanArtist} ${cleanTitle}`.trim();
}

/**
 * Parses YouTube HTML to extract video items from ytInitialData
 */
function parseYtInitialData(html: string): VideoSearchResult[] {
  const results: VideoSearchResult[] = [];
  try {
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/) || html.match(/ytInitialData\s*=\s*({.+?});/);
    if (!match || !match[1]) return results;

    const data = JSON.parse(match[1]);
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]
        ?.itemSectionRenderer?.contents;

    if (!Array.isArray(contents)) return results;

    for (const item of contents) {
      const v = item?.videoRenderer;
      if (!v || !v.videoId) continue;

      const videoId = v.videoId;
      const title = v.title?.runs?.[0]?.text || "";
      const author = v.ownerText?.runs?.[0]?.text || "";
      const durationText = v.lengthText?.simpleText || "";
      const thumbnailUrl = v.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      // Filter out obvious 1-hour loops or full album compilations unless requested
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes("1 hour") || lowerTitle.includes("10 hours") || lowerTitle.includes("full album")) {
        continue;
      }

      results.push({
        videoId,
        title,
        author,
        durationText,
        thumbnailUrl,
      });

      if (results.length >= 8) break;
    }
  } catch (err) {
    console.warn("Error parsing ytInitialData:", err);
  }
  return results;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist") || "";
  const title = searchParams.get("title") || "";
  const queryParam = searchParams.get("q") || "";

  const query = queryParam ? queryParam.trim() : cleanSearchQuery(artist, title);

  if (!query) {
    return NextResponse.json({ success: false, error: "Missing query or artist/title" }, { status: 400 });
  }

  try {
    // Strategy 1: Search with "official music video"
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + " official music video")}`;
    const res = await fetch(ytUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      throw new Error(`YouTube responded with status ${res.status}`);
    }

    const html = await res.text();
    let videos = parseYtInitialData(html);

    // Strategy 2 fallback: If empty, search plain query
    if (videos.length === 0) {
      const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (fallbackRes.ok) {
        const fallbackHtml = await fallbackRes.text();
        videos = parseYtInitialData(fallbackHtml);
      }
    }

    // Rank & select best match
    // Give priority to videos with "official", VEVO, or verified artist channel
    let bestVideo: VideoSearchResult | null = null;
    if (videos.length > 0) {
      const officialMatch = videos.find(
        (v) =>
          v.title.toLowerCase().includes("official") ||
          v.author.toLowerCase().includes("vevo") ||
          v.author.toLowerCase().includes("official") ||
          v.author.toLowerCase().includes("records")
      );
      bestVideo = officialMatch || videos[0];
    }

    return NextResponse.json({
      success: true,
      query,
      bestVideo,
      results: videos,
    });
  } catch (err: unknown) {
    console.error("YouTube video search error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to search video",
      },
      { status: 500 }
    );
  }
}
