import {
  Canton,
  Gemeinde,
  CantonGeoDetail,
  GemeindeGeoDetail,
  FeatureCollection,
  CantonGeoProperties,
  GemeindeGeoProperties,
  TopRoofsResponse,
  BuildingRoofsResponse,
  Geometry,
} from "./types";

const DEFAULT_BASE = "https://data.apioikosconsulting.com";

// ── Token management ────────────────────────────────────────────────────
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ── Core fetch helpers ──────────────────────────────────────────────────

/** Public GET (no auth, no cookies) */
async function apiFetch<T>(path: string): Promise<T> {
  const url = `${DEFAULT_BASE}${path}`;
  console.info(`[Oikos API] → GET ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail ?? "";
    } catch {}
    const message = `API ${res.status} from ${url}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
    console.error(`[Oikos API] ✗ ${message}`);
    throw new Error(message);
  }
  console.info(`[Oikos API] ✓ ${res.status} ${url}`);
  return res.json();
}

/** Authenticated GET (sends Bearer token) */
async function authFetch<T>(path: string): Promise<T> {
  const url = `${DEFAULT_BASE}${path}`;
  console.info(`[Oikos API] → AUTH GET ${url}`);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(url, { method: "GET", headers, credentials: "include" });
  if (!res.ok) {
    let detail = "";
    try { const body = await res.json(); detail = body?.detail ?? ""; } catch {}
    const message = `API ${res.status} from ${url}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
    console.error(`[Oikos API] ✗ ${message}`);
    throw new Error(message);
  }
  console.info(`[Oikos API] ✓ ${res.status} ${url}`);
  return res.json();
}

/** POST with JSON body + cookies (for auth endpoints) */
async function authPost<T>(path: string, body?: unknown): Promise<T> {
  const url = `${DEFAULT_BASE}${path}`;
  console.info(`[Oikos API] → POST ${url}`);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr: any) {
    // fetch() itself threw — typically CORS block or network offline
    const msg = networkErr?.message ?? "Unknown network error";
    console.error(`[Oikos API] ✗ Network error for POST ${url}: ${msg}`);
    if (msg === "Load failed" || msg === "Failed to fetch") {
      throw new Error(
        `Network/CORS error: The browser blocked the request to ${url}. ` +
        `This usually means the backend must add this origin to CORS: ${window.location.origin}`
      );
    }
    throw new Error(`Network error: ${msg}`);
  }

  if (!res.ok) {
    let detail = "";
    try { const b = await res.json(); detail = b?.detail ?? ""; } catch {}
    const message = `API ${res.status} from ${url}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
    console.error(`[Oikos API] ✗ ${message}`);
    throw new Error(message);
  }

  console.info(`[Oikos API] ✓ ${res.status} ${url}`);
  let data: T;
  try {
    data = await res.json();
  } catch (parseErr) {
    console.error(`[Oikos API] ✗ JSON parse failed for ${url}`);
    throw new Error("Response parsing failed — expected JSON");
  }
  console.info(`[Oikos API] ✓ Parsed response from ${url}`);
  return data;
}

// ── Auth types ──────────────────────────────────────────────────────────
export interface AuthUser {
  id: number;
  email: string;
  role: "superadmin" | "canton_admin" | "canton_viewer";
  canton_code: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

// ── Auth API ────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    authPost<LoginResponse>("/api/auth/login", { email, password }),

  refresh: () => authPost<LoginResponse>("/api/auth/refresh"),

  logout: () => authPost<{ ok: boolean }>("/api/auth/logout"),

  me: () => authFetch<AuthUser>("/api/auth/me"),

  setupAccount: (token: string, password: string) =>
    authPost<LoginResponse>("/api/auth/setup-account", { token, password }),

  inviteUser: (email: string, role: string) =>
    authPost<{ ok: boolean; message: string }>("/api/auth/invite-user", { email, role }),

  createCantonAdmin: (email: string, canton_code: string) =>
    authPost<{ ok: boolean; message: string }>("/api/auth/create-canton-admin", { email, canton_code }),

  users: () => authFetch<Array<{ id: number; email: string; role: string; canton_code: string | null; is_active: boolean; created_at: string; last_login_at: string | null }>>("/api/auth/users"),
};

// ── Public data API (corrected routes) ──────────────────────────────────
export const api = {
  health: () => apiFetch<{ ok: boolean; statement_timeout_ms: number; sslmode?: string }>("/api/health"),
  cantons: () => apiFetch<Canton[]>("/api/cantons"),
  gemeinden: (cantonId: number) => apiFetch<Gemeinde[]>(`/api/gemeinden?canton_id=${cantonId}`),
  cantonsGeo: () => apiFetch<FeatureCollection<Geometry, CantonGeoProperties>>("/api/cantons/map"),
  cantonGeo: (cantonId: number) => apiFetch<CantonGeoDetail>(`/api/cantons/map/${cantonId}`),
  gemeindenGeo: (cantonId: number) =>
    apiFetch<FeatureCollection<Geometry, GemeindeGeoProperties>>(`/api/gemeinden/map?canton_id=${cantonId}`),
  gemeindeGeo: (bfs: number) => apiFetch<GemeindeGeoDetail>(`/api/gemeinden/map/${bfs}`),
  topRoofs: (bfs: number, limit: number) =>
    apiFetch<TopRoofsResponse>(`/api/roofs/top?bfs_nummer=${bfs}&limit=${limit}`),
  buildingRoofs: (egid: number) => apiFetch<BuildingRoofsResponse>(`/api/roofs/building/${egid}?include_union=true`),
};
