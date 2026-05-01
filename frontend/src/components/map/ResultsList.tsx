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

function BuildingCard({ b, selected, onSelect, index }: { b: Building; selected: boolean; onSelect: () => void; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.4), ease: [0.22, 1, 0.36, 1] }}>
      <motion.button
        onClick={onSelect}
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={`w-full text-left p-4 rounded-lg border transition-all ${
          selected
            ? "border-primary bg-accent shadow-card ring-1 ring-primary/20"
            : "border-border bg-card hover:border-primary/30 hover:shadow-card"
        }`}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="font-display font-semibold text-sm text-foreground">EGID {b.bdg_egid}</span>
          {b.roof_rows != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
              <Layers className="w-3 h-3" /> {b.roof_rows} roofs
            </span>
          )}
        </div>

        {b.stn_label && (
          <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{b.stn_label} {b.adr_number ?? ""}{b.zip_label ? `, ${b.zip_label}` : ""}</span>
          </p>
        )}

        {b.com_name && (
          <p className="text-xs text-muted-foreground/70 mb-2">{b.com_name}{b.com_canton ? ` (${b.com_canton})` : ""}</p>
        )}

        <div className="flex flex-wrap gap-3 mt-3">
          {b.sommer_total != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium text-foreground">{Math.round(b.sommer_total).toLocaleString()}</span> kWh
            </span>
          )}
          {b.winter_total != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Snowflake className="w-3.5 h-3.5 text-sky-500" />
              <span className="font-medium text-foreground">{Math.round(b.winter_total).toLocaleString()}</span> kWh
            </span>
          )}
          {b.roof_area_sum_m2 != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="font-medium text-foreground">{Math.round(b.roof_area_sum_m2).toLocaleString()}</span> m²
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
          <div key={i} className="h-36 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (buildings.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No buildings to display</p>
        <p className="text-xs mt-1 opacity-70">Select a Gemeinde to load buildings.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {buildings.map((b, i) => (
        <BuildingCard key={b.bdg_egid} b={b} selected={selectedEgid === b.bdg_egid} onSelect={() => onSelect(b.bdg_egid)} index={i} />
      ))}
    </div>
  );
}
