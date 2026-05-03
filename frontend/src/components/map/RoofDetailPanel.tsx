import { motion } from "framer-motion";
import { X, Sun, Snowflake, Maximize2, Layers } from "lucide-react";
import { Building, BuildingRoofsResponse } from "@/lib/types";
import RoofViewer3D from "./RoofViewer3D";

interface Props {
  building: Building | null;
  buildingRoofs: BuildingRoofsResponse | null;
  buildingLoading: boolean;
  onClose: () => void;
}

const PART_COLORS = ["#10b981", "#059669", "#047857", "#065f46", "#064e3b"];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("de-CH");
}

function SpecRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between items-baseline px-2 py-[5px] rounded bg-muted">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[10px] text-foreground font-semibold text-right truncate max-w-[55%]">
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function RoofDetailPanel({ building, buildingRoofs, buildingLoading, onClose }: Props) {
  const parts = buildingRoofs?.parts ?? [];
  const hasGeometry = parts.some((p) => p.geojson != null);
  const floors = building?.ggesh ?? 3;

  const address = [building?.stn_label, building?.adr_number].filter(Boolean).join(" ");
  const modelCode = [building?.gkat_label, building?.sb_objektart_label, building?.gbauj]
    .filter(Boolean)
    .join(" · ");
  const subtitle = [
    building?.zip_label,
    building?.com_name,
    building?.com_canton ? `(${building.com_canton})` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 35 }}
      className="w-[400px] shrink-0 flex flex-col h-full bg-card border-l border-border overflow-hidden"
    >
      {/* Accent stripe */}
      <div className="h-[3px] bg-gradient-to-r from-primary via-emerald-400 to-amber-400 shrink-0" />

      {/* Hero — 3D viewer; canvas fills the area so bg-muted shows only if no canvas */}
      <div className="relative h-[220px] bg-muted shrink-0 overflow-hidden">
        <span className="absolute top-3 left-4 text-[9px] font-bold tracking-[0.15em] text-primary uppercase z-10">
          ☀ Solar Potential · EGID {building?.bdg_egid ?? "…"}
        </span>
        <button
          onClick={onClose}
          className="absolute top-2.5 right-3 z-10 w-[22px] h-[22px] flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
        </button>

        {buildingLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-32 rounded bg-background animate-pulse" />
          </div>
        ) : hasGeometry ? (
          <div className="absolute inset-0 pt-8">
            <RoofViewer3D parts={parts} floors={floors} />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">No 3D data available</span>
          </div>
        )}

        {hasGeometry && !buildingLoading && (
          <span className="absolute bottom-2 right-3 text-[8px] tracking-wide text-muted-foreground/50 z-10 pointer-events-none">
            DRAG TO ROTATE · SCROLL TO ZOOM
          </span>
        )}
      </div>

      {/* Model header */}
      {buildingLoading ? (
        <div className="px-4 py-3.5 border-b border-border space-y-2 shrink-0">
          <div className="h-2.5 w-28 rounded bg-muted animate-pulse" />
          <div className="h-5 w-44 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-32 rounded bg-muted animate-pulse" />
        </div>
      ) : (
        <div className="px-4 py-3.5 border-b border-border shrink-0">
          <div className="text-[9px] font-bold tracking-[0.2em] text-primary uppercase mb-[3px]">
            {modelCode || "—"}
          </div>
          <div className="font-display text-xl font-bold text-foreground tracking-tight leading-tight">
            {address || `EGID ${building?.bdg_egid}`}
          </div>
          <div className="text-xs text-muted-foreground mt-[3px]">{subtitle || "—"}</div>
        </div>
      )}

      {/* Performance bar */}
      {buildingLoading ? (
        <div className="grid grid-cols-3 gap-px bg-border border-b border-border shrink-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-card p-2.5 space-y-2">
              <div className="h-2 w-10 rounded bg-muted animate-pulse" />
              <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-border border-b border-border shrink-0">
          <div className="bg-card p-[10px]">
            <div className="flex items-center gap-1 mb-1">
              <Sun className="w-3 h-3 text-amber-500" />
              <span className="text-[8px] text-muted-foreground uppercase tracking-wide">Sommer</span>
            </div>
            <div className="text-lg font-bold leading-none text-amber-500">{fmt(building?.sommer_total)}</div>
            <div className="text-[8px] text-muted-foreground mt-[2px]">kWh / Jahr</div>
          </div>
          <div className="bg-card p-[10px]">
            <div className="flex items-center gap-1 mb-1">
              <Snowflake className="w-3 h-3 text-sky-500" />
              <span className="text-[8px] text-muted-foreground uppercase tracking-wide">Winter</span>
            </div>
            <div className="text-lg font-bold leading-none text-sky-500">{fmt(building?.winter_total)}</div>
            <div className="text-[8px] text-muted-foreground mt-[2px]">kWh / Jahr</div>
          </div>
          <div className="bg-card p-[10px]">
            <div className="flex items-center gap-1 mb-1">
              <Maximize2 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[8px] text-muted-foreground uppercase tracking-wide">Fläche</span>
            </div>
            <div className="text-lg font-bold leading-none text-foreground">{fmt(building?.roof_area_union_m2)}</div>
            <div className="text-[8px] text-muted-foreground mt-[2px]">m² gesamt</div>
          </div>
        </div>
      )}

      {/* Spec body */}
      <div className="flex-1 overflow-y-auto">
        {buildingLoading ? (
          <div className="p-4 space-y-[3px]">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-7 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Layers className="w-3 h-3 text-muted-foreground" />
                <span className="text-[9px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
                  Gebäude · GWR
                </span>
              </div>
              <div className="grid grid-cols-2 gap-[3px]">
                <SpecRow label="Baujahr" value={building?.gbauj} />
                <SpecRow label="Geschosse" value={building?.ggesh} />
                <SpecRow label="Kategorie" value={building?.gkat_label} />
                <SpecRow label="Klasse" value={building?.gklas_label} />
                <SpecRow label="Heizenergie" value={building?.genh1_label} />
                <SpecRow label="Wärmeverteilung" value={building?.gwaerzh1_label} />
                <SpecRow label="Dachtyp" value={building?.sb_objektart_label} />
                <SpecRow
                  label="Dachflächen"
                  value={
                    buildingRoofs
                      ? `${buildingRoofs.parts_count} Teil${buildingRoofs.parts_count !== 1 ? "e" : ""}`
                      : undefined
                  }
                />
              </div>
            </div>

            {parts.length > 0 && (
              <div className="p-3">
                <div className="text-[9px] font-bold tracking-[0.18em] text-muted-foreground uppercase mb-2">
                  Dachflächen · Einzelübersicht
                </div>
                <div className="space-y-[3px]">
                  {parts.map((part, i) => (
                    <div
                      key={part.objectid}
                      className="flex items-center gap-2.5 px-2 py-[7px] bg-muted rounded"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: PART_COLORS[i % PART_COLORS.length] }}
                      />
                      <span className="text-xs text-muted-foreground flex-1">Teil {i + 1}</span>
                      <div className="text-right">
                        <div className="text-[10px] text-amber-500 flex items-center gap-1 justify-end">
                          <Sun className="w-2.5 h-2.5" /> {fmt(part.summer)} kWh
                        </div>
                        <div className="text-[10px] text-sky-500 flex items-center gap-1 justify-end">
                          <Snowflake className="w-2.5 h-2.5" /> {fmt(part.winter)} kWh
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
