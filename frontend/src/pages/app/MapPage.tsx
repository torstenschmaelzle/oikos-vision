import { useMapState } from "@/hooks/useMapState";
import MapView from "@/components/map/MapView";
import SelectionToolbar from "@/components/map/SelectionToolbar";
import FiltersPanel from "@/components/map/FiltersPanel";
import ResultsList from "@/components/map/ResultsList";
import RoofDetailPanel from "@/components/map/RoofDetailPanel";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

export default function MapPage() {
  const state = useMapState();
  const anyLoading = state.initialLoading || state.cantonLoading || state.gemeindeLoading;

  const selectedBuilding = state.selectedEgid
    ? state.buildings.find((b) => b.bdg_egid === state.selectedEgid)
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      {/* Top section: Map + Sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <motion.aside
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="w-[320px] border-r border-border bg-card overflow-y-auto shrink-0"
        >
          <div className="p-4 space-y-5">
            <AnimatePresence>
              {state.error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-xs border border-destructive/20"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{state.error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {state.initialLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
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

                <FiltersPanel
                  filters={state.filters}
                  filterOptions={state.filterOptions}
                  hasGemeinde={state.selectedBfs != null}
                  onChange={state.setFilters}
                />
              </>
            )}
          </div>
        </motion.aside>

        {/* Map */}
        <div className="flex-1 min-w-0 p-3 relative z-0">
          <MapView
            cantonsGeo={state.cantonsGeo}
            selectedCantonGeo={state.selectedCantonGeo}
            gemeindenGeo={state.gemeindenGeo}
            selectedGemeindeGeo={state.selectedGemeindeGeo}
            buildings={state.buildings}
            buildingRoofs={state.buildingRoofs}
            selectedEgid={state.selectedEgid}
            onSelectBuilding={state.selectBuilding}
            onSelectCanton={state.selectCanton}
            onSelectGemeinde={state.selectGemeinde}
            loading={anyLoading || state.buildingLoading}
          />
        </div>

        {/* Roof detail panel */}
        <AnimatePresence>
          {state.selectedEgid && (
            <RoofDetailPanel
              building={selectedBuilding}
              buildingRoofs={state.buildingRoofs}
              buildingLoading={state.buildingLoading}
              onClose={() => state.selectBuilding(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Results section below map — fixed height, inner grid scrolls */}
      <section className="flex flex-col border-t border-border bg-background shrink-0 h-[280px]">
        <div className="px-6 pt-4 pb-2 flex items-center justify-between shrink-0">
          <h3 className="font-display font-semibold text-lg text-foreground">
            Buildings
            {state.buildings.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({state.buildings.length})
              </span>
            )}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <ResultsList
            buildings={state.buildings}
            selectedEgid={state.selectedEgid}
            onSelect={state.selectBuilding}
            loading={state.gemeindeLoading}
          />
        </div>
      </section>
    </div>
  );
}
