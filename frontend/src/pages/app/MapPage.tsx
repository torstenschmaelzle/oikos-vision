import { useMapState } from "@/hooks/useMapState";
import MapView from "@/components/map/MapView";
import SelectionToolbar from "@/components/map/SelectionToolbar";
import FiltersPanel from "@/components/map/FiltersPanel";
import ResultsList from "@/components/map/ResultsList";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, Building2 } from "lucide-react";

export default function MapPage() {
  const state = useMapState();
  const anyLoading = state.initialLoading || state.cantonLoading || state.gemeindeLoading;

  const selectedBuilding = state.selectedEgid
    ? state.buildings.find((b) => b.bdg_egid === state.selectedEgid)
    : null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)] bg-background">
      {/* Top section: Map + Sidebar */}
      <div className="flex flex-1 min-h-[60vh] max-h-[75vh]">
      {/* Map */}
        <div className="flex-1 p-3 relative z-0">
          <MapView
            cantonsGeo={state.cantonsGeo}
            selectedCantonGeo={state.selectedCantonGeo}
            gemeindenGeo={state.gemeindenGeo}
            selectedGemeindeGeo={state.selectedGemeindeGeo}
            buildings={state.buildings}
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
          className="w-[320px] border-l border-border bg-card overflow-y-auto shrink-0"
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
      </div>

      {/* Selected building mini-header */}
      <AnimatePresence>
        {selectedBuilding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="sticky top-14 z-30 bg-card border-y border-border px-6 py-2.5 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 text-sm">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="font-semibold text-foreground">EGID {selectedBuilding.bdg_egid}</span>
              {selectedBuilding.stn_label && (
                <span className="text-muted-foreground">
                  — {selectedBuilding.stn_label} {selectedBuilding.adr_number ?? ""}
                </span>
              )}
            </div>
            <button
              onClick={() => state.selectBuilding(null)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-muted"
            >
              <X className="w-3.5 h-3.5" />
              Clear selection
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results section below map */}
      <section className="relative px-6 py-8 border-t border-border overflow-hidden bg-background">
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display font-semibold text-lg text-foreground">
              Buildings
              {state.buildings.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({state.buildings.length})
                </span>
              )}
            </h3>
          </div>

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
