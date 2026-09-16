import { NextResponse } from "next/server";

const apiRoot = (process.env.NEXT_PUBLIC_API_ENDPOINT || "")
  .replace(/\/api\/?$/, "")
  .replace(/\/+$/, "");

const getAllowedOrigin = () => {
  try {
    return apiRoot ? new URL(apiRoot).origin : null;
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const allowedOrigin = getAllowedOrigin();
  if (!allowedOrigin) {
    return NextResponse.json({ message: "Logo proxy is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ message: "Logo URL is required." }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ message: "Logo URL is invalid." }, { status: 400 });
  }

  if (targetUrl.origin !== allowedOrigin) {
    return NextResponse.json({ message: "Logo URL is not allowed." }, { status: 403 });
  }

  let response: Response;
  try {
    response = await fetch(targetUrl.toString(), {
      cache: "force-cache",
    });
  } catch {
    return NextResponse.json({ message: "Logo could not be loaded." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ message: "Logo could not be loaded." }, { status: response.status });
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ message: "Logo response is not an image." }, { status: 415 });
  }

  const imageBytes = await response.arrayBuffer();
  return new NextResponse(imageBytes, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": contentType,
    },
  });
}
