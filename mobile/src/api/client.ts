import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../config";

const ACCESS_TOKEN_KEY = "attendstack_access_token";
const REFRESH_TOKEN_KEY = "attendstack_refresh_token";

export const tokenStorage = {
  async getAccess() {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  async getRefresh() {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setTokens(access: string, refresh: string) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
});

api.interceptors.request.use(async (config) => {
  const token = await tokenStorage.getAccess();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let onAuthFailure: (() => void) | null = null;
export function setOnAuthFailure(handler: () => void) {
  onAuthFailure = handler;
}

type RefreshOutcome = { status: "refreshed"; access: string } | { status: "invalid" } | { status: "offline" };
let refreshPromise: Promise<RefreshOutcome> | null = null;

/** Swap the refresh token for a new access token. The server rotates refresh
 * tokens (the old one stops working once used), so the new one must be saved
 * too — otherwise the *next* refresh fails and the user is signed out. Only an
 * invalid refresh token signs the user out; no network just fails this request. */
async function refreshAccessToken(): Promise<RefreshOutcome> {
  const refresh = await tokenStorage.getRefresh();
  if (!refresh) return { status: "invalid" };
  try {
    const response = await axios.post(`${API_BASE_URL}/api/v1/accounts/login/refresh/`, {
      refresh,
    });
    const newAccess = response.data.access as string;
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccess);
    if (response.data.refresh) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, response.data.refresh as string);
    }
    return { status: "refreshed", access: newAccess };
  } catch (err) {
    const code = axios.isAxiosError(err) ? err.response?.status : undefined;
    return code === 400 || code === 401 ? { status: "invalid" } : { status: "offline" };
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const outcome = await refreshPromise;

      if (outcome.status === "refreshed") {
        originalRequest.headers.Authorization = `Bearer ${outcome.access}`;
        return api(originalRequest);
      }

      if (outcome.status === "invalid") {
        await tokenStorage.clear();
        onAuthFailure?.();
      }
    }
    return Promise.reject(error);
  }
);

export function unwrapList<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results;
}

/** Every row of a list endpoint, following DRF `next` links. Some endpoints
 * (e.g. /employees/) ignore `page_size` and always return 20 per page. */
export async function fetchAll<T>(url: string, params: Record<string, unknown> = {}, maxPages = 50): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  for (; page <= maxPages; page++) {
    const { data } = await api.get<T[] | { results: T[]; next: string | null }>(url, { params: { page_size: 100, ...params, page } });
    if (Array.isArray(data)) return data;
    rows.push(...data.results);
    if (!data.next) break;
  }
  return rows;
}

export function extractErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (typeof data?.detail === "string") return data.detail;
    if (data && typeof data === "object") {
      const firstKey = Object.keys(data)[0];
      const firstVal = firstKey ? data[firstKey] : null;
      const message = Array.isArray(firstVal) && typeof firstVal[0] === "string" ? firstVal[0] : typeof firstVal === "string" ? firstVal : null;
      if (message) {
        // Name the field ("Aadhaar number: …") so a long form says *which* input is wrong.
        if (firstKey === "non_field_errors" || firstKey === "detail" || /^\d+$/.test(firstKey)) return message;
        const field = firstKey.replace(/_/g, " ");
        return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${message}`;
      }
    }
    if (err.message === "Network Error") {
      return "Can't reach the server. Check that the backend is running and reachable on your network.";
    }
  }
  return fallback;
}
