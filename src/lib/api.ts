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

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${DEFAULT_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  health: () => apiFetch<{ ok: boolean; statement_timeout_ms: number }>("/api/health"),
  cantons: () => apiFetch<Canton[]>("/api/cantons"),
  gemeinden: (cantonId: number) => apiFetch<Gemeinde[]>(`/api/gemeinden?canton_id=${cantonId}`),
  cantonsGeo: () => apiFetch<FeatureCollection<Geometry, CantonGeoProperties>>("/api/map/cantons"),
  cantonGeo: (cantonId: number) => apiFetch<CantonGeoDetail>(`/api/map/canton/${cantonId}`),
  gemeindenGeo: (cantonId: number) =>
    apiFetch<FeatureCollection<Geometry, GemeindeGeoProperties>>(`/api/map/gemeinden?canton_id=${cantonId}`),
  gemeindeGeo: (bfs: number) => apiFetch<GemeindeGeoDetail>(`/api/map/gemeinde/${bfs}`),
  topRoofs: (bfs: number, limit: number) =>
    apiFetch<TopRoofsResponse>(`/api/roofs/top?bfs_nummer=${bfs}&limit=${limit}`),
  buildingRoofs: (egid: number) => apiFetch<BuildingRoofsResponse>(`/api/map/building/${egid}`),
};
