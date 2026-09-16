import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LIVE_ORIGIN = "https://attendance.nextgenapplication.com";
const LOCAL_MEDIA_DIR = "/home/squarefit/AttendStack/backend/media";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  const filename = searchParams.get("filename") || "download";

  if (!rawUrl) {
    return NextResponse.json({ message: "File URL is required." }, { status: 400 });
  }

  const cleanFilename =
    filename
      .replace(/[/\\?%*:|"<>]/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "download";

  let targetUrl = rawUrl.trim();

  // If URL has http://attendance.nextgenapplication.com, convert to https://
  if (targetUrl.startsWith("http://attendance.nextgenapplication.com")) {
    targetUrl = targetUrl.replace(/^http:\/\//i, "https://");
  }
  if (targetUrl.startsWith("http://nextgenapplication.com")) {
    targetUrl = targetUrl.replace(/^http:\/\//i, "https://");
  }

  // 1. Direct Local File System Check for /media/ files (Zero latency & 100% reliable)
  try {
    let mediaRelativePath = "";
    if (targetUrl.includes("/media/")) {
      mediaRelativePath = targetUrl.substring(targetUrl.indexOf("/media/") + "/media/".length).split("?")[0];
    } else if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      mediaRelativePath = targetUrl.replace(/^\/+/, "").replace(/^media\//, "").split("?")[0];
    }

    if (mediaRelativePath) {
      // Decode URI components in path (e.g. spaces %20)
      const decodedRelPath = decodeURIComponent(mediaRelativePath);
      const diskFilePath = path.join(LOCAL_MEDIA_DIR, decodedRelPath);

      // Prevent path traversal
      if (diskFilePath.startsWith(LOCAL_MEDIA_DIR) && fs.existsSync(diskFilePath)) {
        const fileBuffer = fs.readFileSync(diskFilePath);
        const ext = path.extname(diskFilePath).toLowerCase();
        let mimeType = "application/octet-stream";
        if (ext === ".zip") mimeType = "application/zip";
        else if (ext === ".pdf") mimeType = "application/pdf";
        else if (ext === ".png") mimeType = "image/png";
        else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
        else if (ext === ".txt") mimeType = "text/plain";
        else if (ext === ".json") mimeType = "application/json";
        else if (ext === ".mp4") mimeType = "video/mp4";

        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Content-Disposition": `attachment; filename="${cleanFilename}"; filename*=UTF-8''${encodeURIComponent(cleanFilename)}`,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Content-Length": fileBuffer.length.toString(),
          },
        });
      }
    }
  } catch (fsErr) {
    console.warn("Direct disk read attempt in download-proxy skipped:", fsErr);
  }

  const reqOrigin = new URL(request.url).origin;
  const envEndpoint = (
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    process.env.API_ENDPOINT ||
    ""
  )
    .replace(/\/api\/?$/, "")
    .replace(/\/+$/, "");

  // Determine the effective backend base
  let backendBase = envEndpoint;
  if (!backendBase) {
    if (reqOrigin.includes("localhost:3000") || reqOrigin.includes("127.0.0.1:3000")) {
      backendBase = reqOrigin.replace(":3000", ":8000");
    } else if (reqOrigin.includes("attendance.nextgenapplication.com")) {
      backendBase = LIVE_ORIGIN;
    } else {
      backendBase = reqOrigin || LIVE_ORIGIN;
    }
  }

  // If URL is relative (/media/...), prepend backendBase
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    const cleanPath = targetUrl.startsWith("/") ? targetUrl : `/${targetUrl}`;
    targetUrl = `${backendBase}${cleanPath}`;
  } else {
    // If running in live production and URL has localhost / 127.0.0.1 from dev DB records,
    // rewrite it to LIVE_ORIGIN
    if (
      !reqOrigin.includes("localhost") &&
      !reqOrigin.includes("127.0.0.1") &&
      (targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1"))
    ) {
      try {
        const parsed = new URL(targetUrl);
        targetUrl = `${LIVE_ORIGIN}${parsed.pathname}${parsed.search}`;
      } catch {
        // ignore
      }
    }
  }

  try {
    let response = await fetch(targetUrl, {
      cache: "no-store",
    });

    // If initial fetch failed, try fallback against backendBase directly
    if (!response.ok) {
      try {
        const parsed = new URL(targetUrl);
        const fallbackUrl = `${backendBase}${parsed.pathname}${parsed.search}`;
        if (fallbackUrl !== targetUrl) {
          const fallbackRes = await fetch(fallbackUrl, { cache: "no-store" });
          if (fallbackRes.ok) {
            response = fallbackRes;
          }
        }
      } catch {
        // fallback failed
      }
    }

    // Try fallback against local Django backend port (8001)
    if (!response.ok) {
      try {
        const parsed = new URL(targetUrl);
        const localGunicornUrl = `http://127.0.0.1:8001${parsed.pathname}${parsed.search}`;
        const localRes = await fetch(localGunicornUrl, { cache: "no-store" });
        if (localRes.ok) {
          response = localRes;
        }
      } catch {
        // local gunicorn fallback failed
      }
    }

    if (!response.ok) {
      console.error(`Download proxy could not fetch file at '${targetUrl}', status: ${response.status}`);
      return NextResponse.json(
        { message: `Failed to fetch file (${response.status})` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const fileBytes = await response.arrayBuffer();

    return new NextResponse(fileBytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${cleanFilename}"; filename*=UTF-8''${encodeURIComponent(cleanFilename)}`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error proxying download file:", error);
    return NextResponse.json(
      { message: "Could not stream download file." },
      { status: 502 }
    );
  }
}
