// GeoJSON types
export interface Geometry {
  type: string;
  coordinates: any;
}

export interface Feature<G = Geometry, P = Record<string, any>> {
  type: "Feature";
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G = Geometry, P = Record<string, any>> {
  type: "FeatureCollection";
  features: Feature<G, P>[];
}

// API types
export interface HealthResponse {
  ok: boolean;
  statement_timeout_ms: number;
}

export interface Canton {
  id: number;
  code: string;
  name: string;
}

export interface Gemeinde {
  bfs_nummer: number;
  name: string;
  canton_id: number;
}

export interface CantonGeoDetail {
  id: number;
  code: string;
  name: string;
  geojson: Geometry;
}

export interface GemeindeGeoDetail {
  bfs_nummer: number;
  name: string;
  canton_id: number;
  canton_code?: string;
  geojson: Geometry;
}

export interface Building {
  bdg_egid: number;
  stn_label?: string | null;
  adr_number?: string | null;
  zip_label?: string | null;
  com_name?: string | null;
  com_canton?: string | null;
  sommer_total?: number | null;
  winter_total?: number | null;
  roof_rows?: number | null;
  lat?: number | null;
  lon?: number | null;
  roof_area_sum_m2?: number | null;
  roof_area_union_m2?: number | null;
  // GWR fields
  gkat?: number | null;
  gkat_label?: string | null;
  gklas?: number | null;
  gklas_label?: string | null;
  gbauj?: number | null;
  ggesh?: number | null;
  genh1?: number | null;
  genh1_label?: string | null;
  gwaerzh1?: number | null;
  gwaerzh1_label?: string | null;
  sb_objektart_code?: number | null;
  sb_objektart_label?: string | null;
}

export interface TopRoofsResponse {
  gemeinde: {
    bfs_nummer: number;
    name: string;
    canton_id: number;
    canton_code: string;
    canton_name: string;
  };
  limit: number;
  source: string;
  filters: Record<string, unknown>;
  buildings: Building[];
}

export interface RoofPart {
  objectid: number;
  gwr_egid: number;
  summer?: number | null;
  winter?: number | null;
  geojson: Geometry | null;
}

export interface BuildingRoofsResponse {
  bdg_egid: number;
  parts_count: number;
  union: Geometry | null;
  parts: RoofPart[];
}

// Map state
export interface CantonGeoProperties {
  id: number;
  code: string;
  name: string;
}

export interface GemeindeGeoProperties {
  bfs_nummer: number;
  name: string;
  canton_id: number;
  canton_code?: string;
}

// Filter options from /gemeinden/{bfs}/filter-options
export interface FilterOptionItem {
  code: number;
  label: string | null;
  buildings: number;
}

export interface FilterOptions {
  bfs_nummer: number;
  gemeinde_name: string;
  sb_objektart: FilterOptionItem[];
  gkat: FilterOptionItem[];
  gklas: FilterOptionItem[];
  genh1: FilterOptionItem[];
  baujahr_range: { min: number | null; max: number | null };
  ggesh_range: { min: number | null; max: number | null };
}

// GWR API-level filter state (sent as query params to /roofs/top)
export interface FilterState {
  gkat: number[];
  gklas: number[];
  genh1: number[];
  sb_objektart: number[];
  baujahr_min: number | null;
  baujahr_max: number | null;
  ggesh_min: number | null;
  ggesh_max: number | null;
}

export const defaultFilters: FilterState = {
  gkat: [],
  gklas: [],
  genh1: [],
  sb_objektart: [],
  baujahr_min: null,
  baujahr_max: null,
  ggesh_min: null,
  ggesh_max: null,
};
