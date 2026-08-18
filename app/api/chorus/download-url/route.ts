import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return NextResponse.json({ error: "Valid HTTP/HTTPS URL is required" }, { status: 400 });
  }

  // Convert Google Drive view links to direct download links
  let finalUrl = targetUrl;
  const gDriveMatch = targetUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|file\/u\/\d+\/d\/)([a-zA-Z0-9_-]+)/i);
  if (gDriveMatch) {
    finalUrl = `https://drive.google.com/uc?export=download&id=${gDriveMatch[1]}`;
  }

  // Convert Dropbox share links to direct dl
  if (finalUrl.includes("dropbox.com")) {
    finalUrl = finalUrl.replace(/\?dl=0/i, "?dl=1").replace(/www\.dropbox\.com/i, "dl.dropboxusercontent.com");
  }

  try {
    const res = await fetch(finalUrl, {
      headers: {
        "User-Agent": "RIFF-LAB/1.0 (https://reihan.online)",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Target server returned status ${res.status}` },
        { status: res.status }
      );
    }

    if (!res.body) {
      return NextResponse.json({ error: "Empty response body" }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const filename = targetUrl.split("/").pop()?.split("?")[0] || "downloaded-track.sng";

    return new Response(res.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Direct URL download error:", error);
    return NextResponse.json(
      { error: "Failed to fetch file from provided URL" },
      { status: 500 }
    );
  }
}
