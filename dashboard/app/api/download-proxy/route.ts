import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  const filename = searchParams.get("filename") || "download";

  if (!rawUrl) {
    return NextResponse.json({ message: "File URL is required." }, { status: 400 });
  }

  // Environment-driven backend endpoint
  const envEndpoint = (
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    process.env.API_ENDPOINT ||
    ""
  )
    .replace(/\/api\/?$/, "")
    .replace(/\/+$/, "");

  let targetUrl = rawUrl;

  // Resolve relative URLs (/media/...) against process.env or request origin
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    const requestOrigin = new URL(request.url).origin;
    const base = envEndpoint || requestOrigin;
    targetUrl = `${base}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
  }

  try {
    const response = await fetch(targetUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { message: `Failed to fetch file (${response.status})` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const fileBytes = await response.arrayBuffer();

    const cleanFilename = filename
      .replace(/[^a-zA-Z0-9_.-]/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 150) || "download";

    return new NextResponse(fileBytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${cleanFilename}"`,
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
