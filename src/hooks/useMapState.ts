import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Canton,
  Gemeinde,
  FeatureCollection,
  Geometry,
  CantonGeoProperties,
  GemeindeGeoProperties,
  CantonGeoDetail,
  GemeindeGeoDetail,
  TopRoofsResponse,
  BuildingRoofsResponse,
  Building,
  FilterState,
  defaultFilters,
} from "@/lib/types";

function showError(err: unknown) {
  const msg = err instanceof Error ? err.message : "Unknown error";
  toast({ title: "Error", description: msg, variant: "destructive" });
  return msg;
}

export interface MapState {
  // lists
  cantons: Canton[];
  gemeinden: Gemeinde[];
  // geo layers
  cantonsGeo: FeatureCollection<Geometry, CantonGeoProperties> | null;
  selectedCantonGeo: CantonGeoDetail | null;
  gemeindenGeo: FeatureCollection<Geometry, GemeindeGeoProperties> | null;
  selectedGemeindeGeo: GemeindeGeoDetail | null;
  // selection
  selectedCantonId: number | null;
  selectedBfs: number | null;
  selectedEgid: number | null;
  // data
  overview: TopRoofsResponse | null;
  buildingRoofs: BuildingRoofsResponse | null;
  // filters
  filters: FilterState;
  limit: number;
  // loading
  initialLoading: boolean;
  cantonLoading: boolean;
  gemeindeLoading: boolean;
  buildingLoading: boolean;
  // error
  error: string | null;
  // filtered buildings
  filteredBuildings: Building[];
  // actions
  selectCanton: (id: number | null) => void;
  selectGemeinde: (bfs: number | null) => void;
  selectBuilding: (egid: number | null) => void;
  setFilters: (f: FilterState) => void;
  setLimit: (l: number) => void;
}

function applyFilters(buildings: Building[], f: FilterState): Building[] {
  return buildings.filter((b) => {
    if (f.minAreaEnabled && (b.roof_area_sum_m2 ?? 0) < f.minAreaM2) return false;
    if (f.maxAreaEnabled && (b.roof_area_sum_m2 ?? Infinity) > f.maxAreaM2) return false;
    if (f.minWinterEnabled && (b.winter_total ?? 0) < f.minWinterKwh) return false;
    if (f.maxWinterEnabled && (b.winter_total ?? Infinity) > f.maxWinterKwh) return false;
    if (f.minSummerEnabled && (b.sommer_total ?? 0) < f.minSummerKwh) return false;
    if (f.maxSummerEnabled && (b.sommer_total ?? Infinity) > f.maxSummerKwh) return false;
    if (f.onlyWithRoofsEnabled && (!b.roof_rows || b.roof_rows <= 0)) return false;
    return true;
  });
}

export function useMapState(): MapState {
  const [cantons, setCantons] = useState<Canton[]>([]);
  const [gemeinden, setGemeinden] = useState<Gemeinde[]>([]);
  const [cantonsGeo, setCantonsGeo] = useState<FeatureCollection<Geometry, CantonGeoProperties> | null>(null);
  const [selectedCantonGeo, setSelectedCantonGeo] = useState<CantonGeoDetail | null>(null);
  const [gemeindenGeo, setGemeindenGeo] = useState<FeatureCollection<Geometry, GemeindeGeoProperties> | null>(null);
  const [selectedGemeindeGeo, setSelectedGemeindeGeo] = useState<GemeindeGeoDetail | null>(null);
  const [selectedCantonId, setSelectedCantonId] = useState<number | null>(null);
  const [selectedBfs, setSelectedBfs] = useState<number | null>(null);
  const [selectedEgid, setSelectedEgid] = useState<number | null>(null);
  const [overview, setOverview] = useState<TopRoofsResponse | null>(null);
  const [buildingRoofs, setBuildingRoofs] = useState<BuildingRoofsResponse | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [limit, setLimit] = useState(80);
  const [initialLoading, setInitialLoading] = useState(true);
  const [cantonLoading, setCantonLoading] = useState(false);
  const [gemeindeLoading, setGemeindeLoading] = useState(false);
  const [buildingLoading, setBuildingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    setInitialLoading(true);
    Promise.all([api.cantons(), api.cantonsGeo()])
      .then(([c, geo]) => {
        setCantons(c);
        setCantonsGeo(geo);
        setGemeinden([]);
        setGemeindenGeo(null);
        setSelectedGemeindeGeo(null);
        setOverview(null);
        setBuildingRoofs(null);
        setSelectedCantonGeo(null);
        setError(null);
      })
      .catch((e) => setError(showError(e)))
      .finally(() => setInitialLoading(false));
  }, []);

  const selectCanton = useCallback(
    (id: number | null) => {
      setSelectedCantonId(id);
      setSelectedBfs(null);
      setSelectedEgid(null);
      setOverview(null);
      setBuildingRoofs(null);
      setSelectedGemeindeGeo(null);

      if (!id) {
        setGemeinden([]);
        setGemeindenGeo(null);
        setSelectedCantonGeo(null);
        return;
      }

      setCantonLoading(true);
      Promise.all([api.gemeinden(id), api.gemeindenGeo(id), api.cantonGeo(id)])
        .then(([g, gGeo, cGeo]) => {
          setGemeinden(g);
          setGemeindenGeo(gGeo);
          setSelectedCantonGeo(cGeo);
          setError(null);
        })
        .catch((e) => setError(showError(e)))
        .finally(() => setCantonLoading(false));
    },
    []
  );

  const selectGemeinde = useCallback(
    (bfs: number | null) => {
      setSelectedBfs(bfs);
      setSelectedEgid(null);
      setBuildingRoofs(null);
      setOverview(null);

      if (!bfs) {
        setSelectedGemeindeGeo(null);
        return;
      }

      setGemeindeLoading(true);
      Promise.all([api.gemeindeGeo(bfs), api.topRoofs(bfs, limit)])
        .then(([gGeo, roofs]) => {
          setSelectedGemeindeGeo(gGeo);
          setOverview(roofs);
          setError(null);
        })
        .catch((e) => setError(showError(e)))
        .finally(() => setGemeindeLoading(false));
    },
    [limit]
  );

  const selectBuilding = useCallback((egid: number | null) => {
    setSelectedEgid(egid);
    setBuildingRoofs(null);
    if (!egid) return;
    setBuildingLoading(true);
    api
      .buildingRoofs(egid)
      .then((r) => {
        setBuildingRoofs(r);
        setError(null);
      })
      .catch((e) => setError(showError(e)))
      .finally(() => setBuildingLoading(false));
  }, []);

  const filteredBuildings = overview ? applyFilters(overview.buildings, filters) : [];

  return {
    cantons,
    gemeinden,
    cantonsGeo,
    selectedCantonGeo,
    gemeindenGeo,
    selectedGemeindeGeo,
    selectedCantonId,
    selectedBfs,
    selectedEgid,
    overview,
    buildingRoofs,
    filters,
    limit,
    initialLoading,
    cantonLoading,
    gemeindeLoading,
    buildingLoading,
    error,
    filteredBuildings,
    selectCanton,
    selectGemeinde,
    selectBuilding,
    setFilters,
    setLimit,
  };
}
