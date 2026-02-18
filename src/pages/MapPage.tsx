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
    ? state.filteredBuildings.find((b) => b.bdg_egid === state.selectedEgid)
    : null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-[hsl(150,20%,6%)]">
      {/* Top section: Map + Sidebar */}
      <div className="flex flex-1 min-h-[60vh] max-h-[75vh]">
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

        {/* Sidebar — dark glass panel */}
        <motion.aside
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="w-[320px] border-l border-primary/15 bg-[hsla(150,20%,8%,0.8)] backdrop-blur-xl overflow-y-auto shrink-0"
        >
          <div className="p-4 space-y-5">
            <AnimatePresence>
              {state.error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 p-3 rounded-lg bg-destructive/15 text-red-400 text-xs border border-destructive/20"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{state.error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {state.initialLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-lg bg-[hsl(150,15%,12%)] animate-pulse" />
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

                <div className="h-px bg-primary/15" />

                <FiltersPanel filters={state.filters} onChange={state.setFilters} />
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
            className="sticky top-16 z-30 bg-[hsla(150,20%,10%,0.85)] backdrop-blur-md border-y border-primary/15 px-6 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 text-sm">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="font-semibold text-[hsl(145,15%,90%)]">EGID {selectedBuilding.bdg_egid}</span>
              {selectedBuilding.stn_label && (
                <span className="text-[hsl(145,10%,55%)]">
                  — {selectedBuilding.stn_label} {selectedBuilding.adr_number ?? ""}
                </span>
              )}
            </div>
            <button
              onClick={() => state.selectBuilding(null)}
              className="flex items-center gap-1.5 text-xs text-[hsl(145,10%,55%)] hover:text-[hsl(145,15%,85%)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[hsl(150,15%,15%)]"
            >
              <X className="w-3.5 h-3.5" />
              Clear selection
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results section below map */}
      <section className="relative px-6 py-8 border-t border-primary/10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(150,20%,8%)] to-[hsl(150,20%,6%)]" />
        <div className="absolute inset-0 topo-pattern opacity-5" />

        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display font-semibold text-lg text-[hsl(145,15%,90%)]">
              Buildings
              {state.filteredBuildings.length > 0 && (
                <span className="ml-2 text-sm font-normal text-[hsl(145,10%,50%)]">
                  ({state.filteredBuildings.length})
                </span>
              )}
            </h3>
          </div>

          <ResultsList
            buildings={state.filteredBuildings}
            selectedEgid={state.selectedEgid}
            onSelect={state.selectBuilding}
            loading={state.gemeindeLoading}
          />
        </div>
      </section>
    </div>
  );
}
