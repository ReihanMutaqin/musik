import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const md5 = searchParams.get("md5");
  const novideo = searchParams.get("novideo") === "true";

  if (!md5 || !/^[a-f0-9]{32}$/i.test(md5)) {
    return NextResponse.json({ error: "Valid md5 hash is required" }, { status: 400 });
  }

  const sngFilename = `${md5}${novideo ? "_novideo" : ""}.sng`;
  const targetUrl = `https://files.enchor.us/${sngFilename}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "RIFF-LAB/1.0 (https://reihan.online)",
      },
    });

    if (!res.ok) {
      // Fallback to normal .sng if _novideo was requested but not found
      if (novideo) {
        const fallbackRes = await fetch(`https://files.enchor.us/${md5}.sng`, {
          headers: {
            "User-Agent": "RIFF-LAB/1.0 (https://reihan.online)",
          },
        });
        if (fallbackRes.ok && fallbackRes.body) {
          return new Response(fallbackRes.body, {
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `attachment; filename="${md5}.sng"`,
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      }
      return NextResponse.json(
        { error: `File not found on Enchor CDN (Status ${res.status})` },
        { status: res.status }
      );
    }

    if (!res.body) {
      return NextResponse.json({ error: "Empty response body" }, { status: 502 });
    }

    return new Response(res.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${sngFilename}"`,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Chorus download error:", error);
    return NextResponse.json(
      { error: "Failed to download song from Chorus" },
      { status: 500 }
    );
  }
}
