import { API_UNAUTHORIZED_EVENT, maybeRefreshToken } from "@workspace/api-client-react";

export const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

// Thrown by authFetch on any non-2xx response, carrying the parsed body (if
// any) — this is what lets react-query's isError/error actually reflect a
// failed request, instead of the failure body being returned as if it were
// success data (see Orders.tsx before this: `res.json()` on a 401 returned
// `{error, message}` as valid `data`, which is why the KPI cards showed "—"
// and the order list showed empty instead of surfacing any error).
export class ApiRequestError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, statusText: string, data: unknown) {
    const message =
      data && typeof data === "object" && typeof (data as Record<string, unknown>).message === "string"
        ? (data as Record<string, string>).message
        : `HTTP ${status} ${statusText}`;
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.data = data;
  }
}

// The one place every hand-rolled (non-generated-client) fetch in this app
// should go through — attaches the bearer token, throws ApiRequestError on
// any non-2xx response, and reports a 401 that came back on a token-bearing
// request as a session expiry (see API_UNAUTHORIZED_EVENT — use-auth.tsx is
// the listener). A 401 from an endpoint we didn't attach a token to (e.g.
// wrong password on /auth/login) is a normal domain error, not a session
// expiry, and is left to the caller's own error handling.
export async function authFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("flychat_token");
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    let data: unknown = null;
    try { data = await response.json(); } catch { /* no/invalid JSON body */ }
    if (response.status === 401 && token) window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));
    throw new ApiRequestError(response.status, response.statusText, data);
  }

  if (token) maybeRefreshToken(token);

  if (response.status === 204 || response.status === 205) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
