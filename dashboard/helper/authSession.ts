/**
 * Keeps a signed-in user signed in.
 *
 * Access tokens are short-lived (2 h); every sign-in also gets a 7-day refresh
 * token that the server rotates on each use. We swap the refresh token for a
 * new access token shortly before it expires (and whenever a request comes
 * back 401), so the session slides along while the user keeps using the app.
 * Only an invalid/expired refresh token ends the session — a network blip
 * never does.
 */

const rawApiEndpoint = (process.env.NEXT_PUBLIC_API_ENDPOINT || "").trim();
const API_ROOT = rawApiEndpoint.replace(/\/api$/, "").replace(/\/+$/, "");
const REFRESH_URL = `${API_ROOT}/api/v1/accounts/login/refresh/`;

/** Refresh this long before the access token expires. */
export const REFRESH_LEAD_MS = 2 * 60 * 1000;

export type RefreshOutcome = { status: "refreshed"; access: string } | { status: "invalid" } | { status: "offline" };

export function getTokenExpiryMs(token: string | null): number | null {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

let inFlight: Promise<RefreshOutcome> | null = null;

/** Exchange the refresh token for a new access token. Concurrent callers share
 * one request: refresh tokens are single-use, so two parallel refreshes would
 * invalidate each other. */
export function refreshAccessToken(): Promise<RefreshOutcome> {
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<RefreshOutcome> => {
    const refresh = typeof window !== "undefined" ? localStorage.getItem("refreshToken") : null;
    if (!refresh) return { status: "invalid" };
    let response: Response;
    try {
      response = await fetch(REFRESH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
    } catch {
      return { status: "offline" };
    }
    if (response.status === 400 || response.status === 401) {
      // Another tab may have just rotated it — use theirs if it's fresh.
      const latest = localStorage.getItem("authToken");
      const exp = getTokenExpiryMs(latest);
      if (latest && localStorage.getItem("refreshToken") !== refresh && exp && exp > Date.now()) {
        return { status: "refreshed", access: latest };
      }
      return { status: "invalid" };
    }
    if (!response.ok) return { status: "offline" };
    const data = await response.json().catch(() => null);
    if (!data?.access) return { status: "offline" };
    localStorage.setItem("authToken", data.access);
    if (data.refresh) localStorage.setItem("refreshToken", data.refresh);
    return { status: "refreshed", access: data.access };
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
