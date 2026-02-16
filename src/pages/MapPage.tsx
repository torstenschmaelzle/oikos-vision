import { useMapState } from "@/hooks/useMapState";
import MapView from "@/components/map/MapView";
import SelectionToolbar from "@/components/map/SelectionToolbar";
import FiltersPanel from "@/components/map/FiltersPanel";
import ResultsList from "@/components/map/ResultsList";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

export default function MapPage() {
  const state = useMapState();
  const anyLoading = state.initialLoading || state.cantonLoading || state.gemeindeLoading;

  return (
    <div className="flex flex-1 h-[calc(100vh-4rem)] overflow-hidden">
      {/* Map */}
      <div className="flex-1 p-3">
        <MapView
          cantonsGeo={state.cantonsGeo}
          selectedCantonGeo={state.selectedCantonGeo}
          gemeindenGeo={state.gemeindenGeo}
          selectedGemeindeGeo={state.selectedGemeindeGeo}
          buildings={state.filteredBuildings}
          buildingRoofs={state.buildingRoofs}
          selectedEgid={state.selectedEgid}
          onSelectBuilding={state.selectBuilding}
          loading={anyLoading || state.buildingLoading}
        />
      </div>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-[340px] border-l border-border/50 bg-card overflow-y-auto"
      >
        <div className="p-4 space-y-5">
          {state.error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          {state.initialLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-muted animate-pulse-soft" />
              ))}
            </div>
          ) : (
            <>
              <SelectionToolbar
                cantons={state.cantons}
                gemeinden={state.gemeinden}
                selectedCantonId={state.selectedCantonId}
                selectedBfs={state.selectedBfs}
                limit={state.limit}
                onSelectCanton={state.selectCanton}
                onSelectGemeinde={state.selectGemeinde}
                onSetLimit={state.setLimit}
                disabled={state.cantonLoading || state.gemeindeLoading}
              />

              <div className="h-px bg-border" />

              <FiltersPanel filters={state.filters} onChange={state.setFilters} />

              <div className="h-px bg-border" />

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Results {state.filteredBuildings.length > 0 && `(${state.filteredBuildings.length})`}
                </h3>
                <ResultsList
                  buildings={state.filteredBuildings}
                  selectedEgid={state.selectedEgid}
                  onSelect={state.selectBuilding}
                  loading={state.gemeindeLoading}
                />
              </div>
            </>
          )}
        </div>
      </motion.aside>
    </div>
  );
}
