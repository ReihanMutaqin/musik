import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") || searchParams.get("search") || "";
  const abjad = searchParams.get("abjad") || "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 10; // Exactly 10 songs per page

  try {
    // If filtering by specific alphabet letter (A-Z or #)
    if (abjad && abjad !== "ALL") {
      const letter = abjad.toUpperCase();
      const targetStart = (page - 1) * pageSize;
      const targetEnd = targetStart + pageSize;
      let currentEnchorPage = Math.max(1, Math.floor(targetStart / 3.2));
      const matches: Record<string, unknown>[] = [];
      let fetchedPages = 0;
      let totalFound = 0;

      while (matches.length < targetEnd && fetchedPages < 10) {
        const queryTerm = letter === "#" ? "1" : letter.toLowerCase();
        const res = await fetch("https://api.enchor.us/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "RIFF-LAB/1.0 (https://reihan.online)",
          },
          body: JSON.stringify({
            search: queryTerm,
            page: currentEnchorPage,
          }),
          cache: "no-store",
        });

        if (!res.ok) break;
        const json = (await res.json()) as { found?: number; data?: Record<string, unknown>[] };
        if (!totalFound && json.found) totalFound = json.found;
        if (!json.data || json.data.length === 0) break;

        for (const song of json.data) {
          const songTitle = ((song.name as string) || "").trim().toUpperCase();
          const isMatch =
            letter === "#"
              ? /^[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(songTitle)
              : songTitle.startsWith(letter);

          if (isMatch) {
            matches.push(song);
          }
        }
        currentEnchorPage++;
        fetchedPages++;
      }

      const pagedData = matches.slice(targetStart, targetEnd);
      return NextResponse.json(
        {
          found: totalFound || matches.length,
          data: pagedData,
          page,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }
      );
    }

    // Standard Search
    const query = rawQuery.trim() || "Guitar Hero";
    const res = await fetch("https://api.enchor.us/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "RIFF-LAB/1.0 (https://reihan.online)",
      },
      body: JSON.stringify({
        search: query,
        page,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Enchor API responded with status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Chorus search error:", error);
    return NextResponse.json(
      { error: "Failed to query Chorus song database" },
      { status: 500 }
    );
  }
}
