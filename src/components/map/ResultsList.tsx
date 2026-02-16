import { Building } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Sun, Snowflake, Layers } from "lucide-react";

interface Props {
  buildings: Building[];
  selectedEgid: number | null;
  onSelect: (egid: number) => void;
  loading: boolean;
}

export default function ResultsList({ buildings, selectedEgid, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-muted animate-pulse-soft" />
        ))}
      </div>
    );
  }

  if (buildings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>No buildings to display.</p>
        <p className="text-xs mt-1">Select a gemeinde to load buildings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
      <AnimatePresence mode="popLayout">
        {buildings.map((b, i) => (
          <motion.button
            key={b.bdg_egid}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ delay: Math.min(i * 0.02, 0.3) }}
            onClick={() => onSelect(b.bdg_egid)}
            className={`w-full text-left p-3 rounded-lg border transition-all text-xs ${
              selectedEgid === b.bdg_egid
                ? "border-primary bg-accent shadow-glow"
                : "border-border/50 bg-card hover:border-primary/30 hover:shadow-soft"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-foreground">EGID {b.bdg_egid}</span>
              {b.roof_rows != null && (
                <span className="flex items-center gap-0.5 text-muted-foreground">
                  <Layers className="w-3 h-3" /> {b.roof_rows}
                </span>
              )}
            </div>
            {b.stn_label && (
              <p className="text-muted-foreground truncate">
                {b.stn_label} {b.adr_number ?? ""}
                {b.zip_label ? `, ${b.zip_label}` : ""}
              </p>
            )}
            <div className="flex gap-3 mt-1.5 text-muted-foreground">
              {b.sommer_total != null && (
                <span className="flex items-center gap-0.5">
                  <Sun className="w-3 h-3 text-amber-500" />
                  {Math.round(b.sommer_total).toLocaleString()}
                </span>
              )}
              {b.winter_total != null && (
                <span className="flex items-center gap-0.5">
                  <Snowflake className="w-3 h-3 text-sky-500" />
                  {Math.round(b.winter_total).toLocaleString()}
                </span>
              )}
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
