import { Building } from "@/lib/types";
import { useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Building2, Sun, Snowflake, Layers, MapPin, Maximize2 } from "lucide-react";

interface Props {
  buildings: Building[];
  selectedEgid: number | null;
  onSelect: (egid: number) => void;
  loading: boolean;
}

function BuildingCard({
  b,
  selected,
  onSelect,
  index,
}: {
  b: Building;
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.4), ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.button
        onClick={onSelect}
        whileHover={{ y: -4, boxShadow: "0 8px 30px -8px hsla(152,60%,38%,0.25)" }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={`w-full text-left p-5 rounded-2xl border transition-all group backdrop-blur-md ${
          selected
            ? "border-primary/50 bg-[hsla(152,40%,15%,0.6)] shadow-[0_0_20px_-5px_hsla(152,60%,38%,0.3)] ring-1 ring-primary/30"
            : "border-primary/10 bg-[hsla(150,20%,10%,0.5)] hover:border-primary/25"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-display font-semibold text-sm text-[hsl(145,15%,90%)]">EGID {b.bdg_egid}</span>
          {b.roof_rows != null && (
            <span className="flex items-center gap-1 text-xs text-[hsl(145,10%,55%)] bg-[hsla(150,15%,15%,0.8)] px-2 py-0.5 rounded-full">
              <Layers className="w-3 h-3" /> {b.roof_rows} roofs
            </span>
          )}
        </div>

        {/* Address */}
        {b.stn_label && (
          <p className="text-sm text-[hsl(145,10%,55%)] mb-2 flex items-center gap-1.5">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {b.stn_label} {b.adr_number ?? ""}
              {b.zip_label ? `, ${b.zip_label}` : ""}
            </span>
          </p>
        )}

        {b.com_name && (
          <p className="text-xs text-[hsl(145,10%,45%)] mb-2">
            {b.com_name}{b.com_canton ? ` (${b.com_canton})` : ""}
          </p>
        )}

        {/* Energy stats */}
        <div className="flex flex-wrap gap-3 mt-3">
          {b.sommer_total != null && (
            <span className="flex items-center gap-1 text-xs text-[hsl(145,10%,55%)]">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-medium text-[hsl(145,15%,80%)]">{Math.round(b.sommer_total).toLocaleString()}</span> kWh
            </span>
          )}
          {b.winter_total != null && (
            <span className="flex items-center gap-1 text-xs text-[hsl(145,10%,55%)]">
              <Snowflake className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-medium text-[hsl(145,15%,80%)]">{Math.round(b.winter_total).toLocaleString()}</span> kWh
            </span>
          )}
          {b.roof_area_sum_m2 != null && (
            <span className="flex items-center gap-1 text-xs text-[hsl(145,10%,55%)]">
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="font-medium text-[hsl(145,15%,80%)]">{Math.round(b.roof_area_sum_m2).toLocaleString()}</span> m²
            </span>
          )}
        </div>
      </motion.button>
    </motion.div>
  );
}

export default function ResultsList({ buildings, selectedEgid, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-36 rounded-2xl bg-[hsl(150,15%,12%)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (buildings.length === 0) {
    return (
      <div className="text-center py-16 text-[hsl(145,10%,45%)]">
        <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No buildings to display</p>
        <p className="text-xs mt-1 opacity-70">Select a Gemeinde to load buildings.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {buildings.map((b, i) => (
        <BuildingCard
          key={b.bdg_egid}
          b={b}
          selected={selectedEgid === b.bdg_egid}
          onSelect={() => onSelect(b.bdg_egid)}
          index={i}
        />
      ))}
    </div>
  );
}
