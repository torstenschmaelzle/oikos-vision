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

// Filter state
export interface FilterState {
  minAreaEnabled: boolean;
  minAreaM2: number;
  maxAreaEnabled: boolean;
  maxAreaM2: number;
  buildingType: string;
  minWinterEnabled: boolean;
  minWinterKwh: number;
  maxWinterEnabled: boolean;
  maxWinterKwh: number;
  minSummerEnabled: boolean;
  minSummerKwh: number;
  maxSummerEnabled: boolean;
  maxSummerKwh: number;
  onlyWithRoofsEnabled: boolean;
}

export const defaultFilters: FilterState = {
  minAreaEnabled: false,
  minAreaM2: 0,
  maxAreaEnabled: false,
  maxAreaM2: 10000,
  buildingType: "",
  minWinterEnabled: false,
  minWinterKwh: 0,
  maxWinterEnabled: false,
  maxWinterKwh: 100000,
  minSummerEnabled: false,
  minSummerKwh: 0,
  maxSummerEnabled: false,
  maxSummerKwh: 100000,
  onlyWithRoofsEnabled: false,
};
