/**
 * API mock helpers — pre-built mock data and fetch interceptors.
 *
 * Usage: vi.mock("@/lib/api") then set return values per test.
 */
import type { Canton, Gemeinde, Building, TopRoofsResponse } from "@/lib/types";

// ── Mock data factories ─────────────────────────────────────────────────

export function createCanton(overrides?: Partial<Canton>): Canton {
  return { id: 78, code: "ZH", name: "Zürich", ...overrides };
}

export function createGemeinde(overrides?: Partial<Gemeinde>): Gemeinde {
  return { bfs_nummer: 261, name: "Zürich", canton_id: 78, ...overrides };
}

export function createBuilding(overrides?: Partial<Building>): Building {
  return {
    bdg_egid: 1001,
    stn_label: "Bahnhofstrasse",
    adr_number: "1",
    zip_label: "8001 Zürich",
    com_name: "Zürich",
    com_canton: "ZH",
    sommer_total: 15000,
    winter_total: 8000,
    roof_rows: 3,
    lat: 47.3769,
    lon: 8.5417,
    roof_area_sum_m2: 250,
    roof_area_union_m2: 220,
    ...overrides,
  };
}

export function createTopRoofsResponse(
  buildings: Building[] = [createBuilding()],
  overrides?: Partial<TopRoofsResponse>
): TopRoofsResponse {
  return {
    gemeinde: {
      bfs_nummer: 261,
      name: "Zürich",
      canton_id: 78,
      canton_code: "ZH",
      canton_name: "Zürich",
    },
    limit: 80,
    source: "test",
    buildings,
    ...overrides,
  };
}

// ── Mock user records (for settings pages) ──────────────────────────────

export function createUserRecord(overrides?: Record<string, any>) {
  return {
    id: 10,
    email: "user@example.com",
    role: "canton_viewer",
    canton_code: "ZH",
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    last_login_at: "2025-06-01T12:00:00Z",
    ...overrides,
  };
}

// ── Convenience: create a mock api module ───────────────────────────────

export function createMockApi() {
  return {
    health: vi.fn().mockResolvedValue({ ok: true, statement_timeout_ms: 3000 }),
    cantons: vi.fn().mockResolvedValue([createCanton()]),
    gemeinden: vi.fn().mockResolvedValue([createGemeinde()]),
    cantonsGeo: vi.fn().mockResolvedValue({ type: "FeatureCollection", features: [] }),
    cantonGeo: vi.fn().mockResolvedValue({ id: 78, code: "ZH", name: "Zürich", geojson: { type: "Polygon", coordinates: [] } }),
    gemeindenGeo: vi.fn().mockResolvedValue({ type: "FeatureCollection", features: [] }),
    gemeindeGeo: vi.fn().mockResolvedValue({ bfs_nummer: 261, name: "Zürich", canton_id: 78, geojson: { type: "Polygon", coordinates: [] } }),
    topRoofs: vi.fn().mockResolvedValue(createTopRoofsResponse()),
    buildingRoofs: vi.fn().mockResolvedValue({ bdg_egid: 1001, parts_count: 0, union: null, parts: [] }),
  };
}

export function createMockAuthApi() {
  return {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    setupAccount: vi.fn(),
    inviteUser: vi.fn(),
    createCantonAdmin: vi.fn(),
    users: vi.fn().mockResolvedValue([createUserRecord()]),
    deleteUser: vi.fn(),
  };
}
