import { Canton, Gemeinde } from "@/lib/types";
import { motion } from "framer-motion";
import { MapPin, Building2, Hash } from "lucide-react";

interface Props {
  cantons: Canton[];
  gemeinden: Gemeinde[];
  selectedCantonId: number | null;
  selectedBfs: number | null;
  limit: number;
  onSelectCanton: (id: number | null) => void;
  onSelectGemeinde: (bfs: number | null) => void;
  onSetLimit: (l: number) => void;
  disabled: boolean;
}

export default function SelectionToolbar({
  cantons,
  gemeinden,
  selectedCantonId,
  selectedBfs,
  limit,
  onSelectCanton,
  onSelectGemeinde,
  onSetLimit,
  disabled,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5" /> Selection
      </h3>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Canton</label>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow disabled:opacity-50"
          value={selectedCantonId ?? ""}
          onChange={(e) => onSelectCanton(e.target.value ? Number(e.target.value) : null)}
          disabled={disabled}
        >
          <option value="">All Cantons</option>
          {cantons.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Building2 className="w-3 h-3" /> Gemeinde
        </label>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow disabled:opacity-50"
          value={selectedBfs ?? ""}
          onChange={(e) => onSelectGemeinde(e.target.value ? Number(e.target.value) : null)}
          disabled={disabled || !selectedCantonId}
        >
          <option value="">Select Gemeinde</option>
          {gemeinden.map((g) => (
            <option key={g.bfs_nummer} value={g.bfs_nummer}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Hash className="w-3 h-3" /> Limit
        </label>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow disabled:opacity-50"
          value={limit}
          onChange={(e) => onSetLimit(Number(e.target.value))}
          disabled={disabled}
        >
          {[20, 40, 60, 80, 100, 150, 200].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
    </motion.div>
  );
}
