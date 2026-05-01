import { useState, useCallback, useEffect } from "react";
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
  FilterOptions,
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
  buildings: Building[];
  // filters
  filters: FilterState;
  filterOptions: FilterOptions | null;
  limit: number;
  // loading
  initialLoading: boolean;
  cantonLoading: boolean;
  gemeindeLoading: boolean;
  buildingLoading: boolean;
  // error
  error: string | null;
  // actions
  selectCanton: (id: number | null) => void;
  selectGemeinde: (bfs: number | null) => void;
  selectBuilding: (egid: number | null) => void;
  setFilters: (f: FilterState) => void;
  setLimit: (l: number) => void;
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
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
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
        setError(null);
      })
      .catch((e) => setError(showError(e)))
      .finally(() => setInitialLoading(false));
  }, []);

  // Fetch buildings whenever bfs, limit, or GWR filters change.
  // Using JSON.stringify as a stable dep key so object identity doesn't cause spurious re-fetches.
  const gwrKey = JSON.stringify(filters);
  useEffect(() => {
    if (!selectedBfs) {
      setOverview(null);
      return;
    }
    setGemeindeLoading(true);
    api
      .topRoofs(selectedBfs, limit, filters)
      .then((r) => {
        setOverview(r);
        setError(null);
      })
      .catch((e) => setError(showError(e)))
      .finally(() => setGemeindeLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBfs, limit, gwrKey]);

  const selectCanton = useCallback((id: number | null) => {
    setSelectedCantonId(id);
    setSelectedBfs(null);
    setSelectedEgid(null);
    setOverview(null);
    setBuildingRoofs(null);
    setSelectedGemeindeGeo(null);
    setFilterOptions(null);
    setFilters(defaultFilters);

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
  }, []);

  const selectGemeinde = useCallback((bfs: number | null) => {
    setSelectedBfs(bfs);
    setSelectedEgid(null);
    setBuildingRoofs(null);
    setOverview(null);
    setFilterOptions(null);
    setFilters(defaultFilters);

    if (!bfs) {
      setSelectedGemeindeGeo(null);
      return;
    }

    // Fetch geo + filter options (building fetch is driven by the useEffect above)
    Promise.all([api.gemeindeGeo(bfs), api.filterOptions(bfs)])
      .then(([gGeo, opts]) => {
        setSelectedGemeindeGeo(gGeo);
        setFilterOptions(opts);
        setError(null);
      })
      .catch((e) => setError(showError(e)));
  }, []);

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

  const buildings = overview?.buildings ?? [];

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
    buildings,
    filters,
    filterOptions,
    limit,
    initialLoading,
    cantonLoading,
    gemeindeLoading,
    buildingLoading,
    error,
    selectCanton,
    selectGemeinde,
    selectBuilding,
    setFilters,
    setLimit,
  };
}
