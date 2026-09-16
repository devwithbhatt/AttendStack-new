const apiRoot = (process.env.NEXT_PUBLIC_API_ENDPOINT || "")
  .replace(/\/api\/?$/, "")
  .replace(/\/+$/, "");

const isInlineUrl = (url: string) => /^(data|blob):/i.test(url);
const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

export const resolvePayslipLogoUrl = (logoUrl?: string | null) => {
  const trimmed = logoUrl?.trim();
  if (!trimmed) return null;

  if (isInlineUrl(trimmed) || isHttpUrl(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
    return `${protocol}${trimmed}`;
  }

  if (trimmed.startsWith("/") && apiRoot) {
    return `${apiRoot}${trimmed}`;
  }

  return trimmed;
};

export const getPayslipLogoDisplayUrl = (logoUrl?: string | null) => {
  const resolved = resolvePayslipLogoUrl(logoUrl);
  if (!resolved || isInlineUrl(resolved)) return resolved;

  if (!isHttpUrl(resolved)) {
    return resolved;
  }

  if (typeof window !== "undefined") {
    try {
      const targetUrl = new URL(resolved);
      if (targetUrl.origin === window.location.origin) {
        return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
      }
    } catch {
      return resolved;
    }
  }

  return `/api/logo-proxy?url=${encodeURIComponent(resolved)}`;
};
