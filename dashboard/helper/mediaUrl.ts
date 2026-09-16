/**
 * Resolves media URLs properly between backend (Django) and frontend (Next.js).
 * Supports both local development (http://localhost:8000) and live production (https://attendance.nextgenapplication.com).
 */
export const LIVE_ORIGIN = "https://attendance.nextgenapplication.com";

export const getBackendBaseUrl = (): string => {
  const envEndpoint = (
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    process.env.API_ENDPOINT ||
    ""
  )
    .replace(/\/api\/?$/, "")
    .replace(/\/+$/, "");

  if (envEndpoint) {
    return envEndpoint;
  }

  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    // Local development: frontend runs on port 3000, Django backend runs on port 8000
    if (origin.includes("localhost:3000") || origin.includes("127.0.0.1:3000")) {
      return origin.replace(":3000", ":8000");
    }
    return origin;
  }

  return LIVE_ORIGIN;
};

export const resolveMediaUrl = (url?: string | null): string => {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(data|blob):/i.test(trimmed)) return trimmed;

  const backendBase = getBackendBaseUrl();

  // If already absolute URL
  if (/^https?:\/\//i.test(trimmed)) {
    // Always upgrade attendance.nextgenapplication.com or nextgenapplication.com to HTTPS
    if (trimmed.startsWith("http://attendance.nextgenapplication.com")) {
      return trimmed.replace(/^http:\/\//i, "https://");
    }
    if (trimmed.startsWith("http://nextgenapplication.com")) {
      return trimmed.replace(/^http:\/\//i, "https://");
    }

    if (typeof window !== "undefined") {
      const currentOrigin = window.location.origin;

      // If page is on HTTPS, ensure same-host HTTP URLs are upgraded to HTTPS to avoid mixed content
      if (window.location.protocol === "https:" && trimmed.startsWith("http://")) {
        try {
          const parsed = new URL(trimmed);
          if (parsed.hostname === window.location.hostname) {
            return `https://${parsed.host}${parsed.pathname}${parsed.search}`;
          }
        } catch {
          // ignore
        }
      }

      // In live production: if any old DB record has localhost / 127.0.0.1, convert to live domain
      if (
        !currentOrigin.includes("localhost") &&
        !currentOrigin.includes("127.0.0.1") &&
        (trimmed.includes("localhost") || trimmed.includes("127.0.0.1"))
      ) {
        try {
          const parsed = new URL(trimmed);
          return `${backendBase}${parsed.pathname}${parsed.search}`;
        } catch {
          return trimmed;
        }
      }

      // In local dev: if pointing mistakenly to localhost:3000 (frontend) for /media/ or /static/, rewrite to backend port 8000
      if (
        (currentOrigin.includes("localhost:3000") || currentOrigin.includes("127.0.0.1:3000")) &&
        (trimmed.startsWith("http://localhost:3000/") || trimmed.startsWith("http://127.0.0.1:3000/")) &&
        (trimmed.includes("/media/") || trimmed.includes("/static/"))
      ) {
        try {
          const parsed = new URL(trimmed);
          return `${backendBase}${parsed.pathname}${parsed.search}`;
        } catch {
          return trimmed;
        }
      }
    }
    return trimmed;
  }

  // Relative path like /media/...
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${backendBase}${cleanPath}`;
};

/**
 * Returns a same-origin download proxy URL that sets Content-Disposition: attachment
 */
export const getDownloadProxyUrl = (fileUrl: string, fileName?: string): string => {
  const resolved = resolveMediaUrl(fileUrl);
  const safeName = fileName || resolved.split("/").pop()?.split("?")[0] || "download";
  return `/api/download-proxy?url=${encodeURIComponent(resolved)}&filename=${encodeURIComponent(safeName)}`;
};

/**
 * Triggers a robust one-click file download across all devices and browsers
 */
export const triggerFileDownload = async (fileUrl: string, fileName?: string): Promise<void> => {
  if (!fileUrl) return;

  const resolved = resolveMediaUrl(fileUrl);
  const safeName =
    fileName ||
    resolved.split("/").pop()?.split("?")[0] ||
    `attendstack-file-${Date.now()}`;

  const proxyUrl = getDownloadProxyUrl(resolved, safeName);

  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Download proxy returned status ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = safeName;
    link.setAttribute("download", safeName);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 4000);
  } catch (err) {
    console.warn("Proxy blob download failed, attempting direct download:", err);
    const directLink = document.createElement("a");
    directLink.href = resolved;
    directLink.target = "_blank";
    directLink.download = safeName;
    directLink.setAttribute("download", safeName);
    directLink.style.display = "none";
    document.body.appendChild(directLink);
    directLink.click();
    document.body.removeChild(directLink);
  }
};
