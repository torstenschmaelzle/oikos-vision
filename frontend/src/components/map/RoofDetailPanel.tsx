import { motion } from "framer-motion";
import { X } from "lucide-react";
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
    <div className="flex justify-between items-baseline px-2 py-[5px] rounded bg-[#0a0f18]">
      <span className="text-[9px] text-[#475569]">{label}</span>
      <span className="text-[9px] text-[#e2e8f0] font-semibold text-right truncate max-w-[55%]">
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
      className="w-[400px] shrink-0 flex flex-col h-full bg-[#0d1117] border-l border-[#1e293b] overflow-hidden"
    >
      {/* Accent stripe */}
      <div className="h-[3px] bg-gradient-to-r from-[#10b981] via-[#34d399] to-[#fbbf24] shrink-0" />

      {/* Hero */}
      <div className="relative h-[220px] bg-[#060a10] shrink-0 overflow-hidden">
        <span className="absolute top-3 left-4 text-[9px] font-bold tracking-[0.15em] text-[#10b981] uppercase z-10">
          ☀ SOLAR POTENTIAL · EGID {building?.bdg_egid ?? "…"}
        </span>
        <button
          onClick={onClose}
          className="absolute top-2.5 right-3 z-10 w-[22px] h-[22px] flex items-center justify-center rounded-full border border-[#1e293b] text-[#64748b] hover:text-[#94a3b8] hover:border-[#334155] transition-colors"
        >
          <X className="w-3 h-3" />
        </button>

        {buildingLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-32 rounded bg-[#0d1117] animate-pulse" />
          </div>
        ) : hasGeometry ? (
          <div className="absolute inset-0 pt-8">
            <RoofViewer3D parts={parts} floors={floors} />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] text-[#334155]">No 3D data available</span>
          </div>
        )}

        {hasGeometry && !buildingLoading && (
          <span className="absolute bottom-2 right-3 text-[8px] tracking-wide text-[#334155] z-10 pointer-events-none">
            DRAG TO ROTATE · SCROLL TO ZOOM
          </span>
        )}
      </div>

      {/* Model header */}
      {buildingLoading ? (
        <div className="px-4 py-3.5 border-b border-[#161d2b] space-y-2 shrink-0">
          <div className="h-2.5 w-32 rounded bg-[#0f2e22] animate-pulse" />
          <div className="h-5 w-48 rounded bg-[#1e293b] animate-pulse" />
          <div className="h-2.5 w-36 rounded bg-[#0a0f18] animate-pulse" />
        </div>
      ) : (
        <div className="px-4 py-3.5 border-b border-[#161d2b] shrink-0">
          <div className="text-[9px] font-bold tracking-[0.2em] text-[#10b981] uppercase mb-[3px]">
            {modelCode || "—"}
          </div>
          <div className="text-[20px] font-extrabold text-[#f8fafc] tracking-tight leading-tight">
            {address || `EGID ${building?.bdg_egid}`}
          </div>
          <div className="text-[11px] text-[#475569] mt-[3px]">{subtitle || "—"}</div>
        </div>
      )}

      {/* Performance bar */}
      {buildingLoading ? (
        <div className="grid grid-cols-3 gap-px bg-[#161d2b] border-b border-[#161d2b] shrink-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-[#0d1117] p-2.5 space-y-2">
              <div className="h-2 w-10 rounded bg-[#0a0f18] animate-pulse" />
              <div className="h-5 w-14 rounded bg-[#1e293b] animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-[#161d2b] border-b border-[#161d2b] shrink-0">
          <div className="bg-[#0d1117] p-[10px]">
            <div className="text-[8px] text-[#475569] uppercase tracking-wide mb-[3px]">☀ Sommer</div>
            <div className="text-[18px] font-extrabold leading-none text-[#fbbf24]">
              {fmt(building?.sommer_total)}
            </div>
            <div className="text-[8px] text-[#475569] mt-[2px]">kWh / Jahr</div>
          </div>
          <div className="bg-[#0d1117] p-[10px]">
            <div className="text-[8px] text-[#475569] uppercase tracking-wide mb-[3px]">❄ Winter</div>
            <div className="text-[18px] font-extrabold leading-none text-[#38bdf8]">
              {fmt(building?.winter_total)}
            </div>
            <div className="text-[8px] text-[#475569] mt-[2px]">kWh / Jahr</div>
          </div>
          <div className="bg-[#0d1117] p-[10px]">
            <div className="text-[8px] text-[#475569] uppercase tracking-wide mb-[3px]">📐 Fläche</div>
            <div className="text-[18px] font-extrabold leading-none text-[#94a3b8]">
              {fmt(building?.roof_area_union_m2)}
            </div>
            <div className="text-[8px] text-[#475569] mt-[2px]">m² gesamt</div>
          </div>
        </div>
      )}

      {/* Spec body */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#1e293b transparent" }}
      >
        {buildingLoading ? (
          <div className="p-4 space-y-[3px]">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-7 rounded bg-[#0a0f18] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-[#0f1724]">
              <div className="text-[8px] font-bold tracking-[0.18em] text-[#334155] uppercase mb-2">
                Gebäude · GWR
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
                <div className="text-[8px] font-bold tracking-[0.18em] text-[#334155] uppercase mb-2">
                  Dachflächen · Einzelübersicht
                </div>
                <div className="space-y-[3px]">
                  {parts.map((part, i) => (
                    <div
                      key={part.objectid}
                      className="flex items-center gap-2.5 px-2 py-[7px] bg-[#0a0f18] rounded"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: PART_COLORS[i % PART_COLORS.length] }}
                      />
                      <span className="text-[9px] text-[#475569] flex-1">Teil {i + 1}</span>
                      <div className="text-right">
                        <div className="text-[8px] text-[#fbbf24]">☀ {fmt(part.summer)} kWh</div>
                        <div className="text-[8px] text-[#38bdf8]">❄ {fmt(part.winter)} kWh</div>
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
