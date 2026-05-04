import { useState, useEffect } from "react";
import { useMapState } from "@/hooks/useMapState";
import MapView from "@/components/map/MapView";
import SelectionToolbar from "@/components/map/SelectionToolbar";
import FiltersPanel from "@/components/map/FiltersPanel";
import RoofDetailPanel from "@/components/map/RoofDetailPanel";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

export default function MapPage() {
  const state = useMapState();

  const [selectedPartIndex, setSelectedPartIndex] = useState<number | null>(null);

  // Reset part selection when selected building changes
  useEffect(() => {
    setSelectedPartIndex(null);
  }, [state.selectedEgid]);
  const anyLoading = state.initialLoading || state.cantonLoading || state.gemeindeLoading;

  const selectedBuilding = state.selectedEgid
    ? state.buildings.find((b) => b.bdg_egid === state.selectedEgid)
    : null;

  // Arrow navigation — buildings are already sorted by sommer_total desc in useMapState
  const currentIndex = state.selectedEgid
    ? state.buildings.findIndex((b) => b.bdg_egid === state.selectedEgid)
    : -1;

  const goToPrev = () => {
    if (currentIndex > 0) state.selectBuilding(state.buildings[currentIndex - 1].bdg_egid);
  };
  const goToNext = () => {
    if (currentIndex < state.buildings.length - 1)
      state.selectBuilding(state.buildings[currentIndex + 1].bdg_egid);
  };

  const showArrows = state.buildings.length > 1 && state.selectedBfs !== null;

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden bg-background flex">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-[320px] border-r border-border bg-card overflow-y-auto shrink-0 flex flex-col"
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

      {/* Map + arrow overlay */}
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
          selectedPartIndex={selectedPartIndex}
          onSelectPart={setSelectedPartIndex}
        />

        {/* TODO: remove — deploy test banner */}
        <div style={{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",background:"#22c55e",color:"#fff",padding:"4px 16px",borderRadius:8,fontSize:12,zIndex:9999,pointerEvents:"none"}}>
          CI/CD deploy test ✓
        </div>

        {/* Prev / Next arrows */}
        <AnimatePresence>
          {showArrows && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2"
            >
              <button
                onClick={goToPrev}
                disabled={currentIndex <= 0 || state.buildingLoading}
                aria-label="Previous building"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border shadow-md text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 rounded-full bg-card border border-border shadow-md text-xs font-medium text-foreground tabular-nums">
                {currentIndex >= 0 ? currentIndex + 1 : "—"} / {state.buildings.length}
              </span>
              <button
                onClick={goToNext}
                disabled={currentIndex >= state.buildings.length - 1 || state.buildingLoading}
                aria-label="Next building"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border shadow-md text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Roof detail panel */}
      <AnimatePresence>
        {state.selectedEgid && (
          <RoofDetailPanel
            building={selectedBuilding}
            buildingRoofs={state.buildingRoofs}
            buildingLoading={state.buildingLoading}
            onClose={() => state.selectBuilding(null)}
            selectedPartIndex={selectedPartIndex}
            onSelectPart={setSelectedPartIndex}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
