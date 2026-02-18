import { FilterState } from "@/lib/types";
import { motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

function FilterRow({
  label,
  enabled,
  value,
  onToggle,
  onValue,
  unit,
}: {
  label: string;
  enabled: boolean;
  value: number;
  onToggle: () => void;
  onValue: (v: number) => void;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggle}
        className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 ${
          enabled ? "bg-primary" : "bg-[hsl(150,12%,20%)]"
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full shadow-sm transition-transform ${
            enabled ? "translate-x-3 bg-[hsl(150,20%,6%)]" : "translate-x-0 bg-[hsl(145,10%,40%)]"
          }`}
        />
      </button>
      <span className="text-xs text-[hsl(145,10%,55%)] flex-1 min-w-0 truncate">{label}</span>
      <input
        type="number"
        className="w-20 rounded-md border border-primary/15 bg-[hsl(150,15%,10%)] px-2 py-1 text-xs text-[hsl(145,15%,90%)] focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-40"
        value={value}
        onChange={(e) => onValue(Number(e.target.value))}
        disabled={!enabled}
      />
      {unit && <span className="text-xs text-[hsl(145,10%,45%)]">{unit}</span>}
    </div>
  );
}

export default function FiltersPanel({ filters, onChange }: Props) {
  const update = (partial: Partial<FilterState>) => onChange({ ...filters, ...partial });

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="space-y-3"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(145,10%,50%)] flex items-center gap-1.5">
        <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
      </h3>

      <div className="space-y-2.5">
        <FilterRow label="Min Area" enabled={filters.minAreaEnabled} value={filters.minAreaM2} onToggle={() => update({ minAreaEnabled: !filters.minAreaEnabled })} onValue={(v) => update({ minAreaM2: v })} unit="m²" />
        <FilterRow label="Max Area" enabled={filters.maxAreaEnabled} value={filters.maxAreaM2} onToggle={() => update({ maxAreaEnabled: !filters.maxAreaEnabled })} onValue={(v) => update({ maxAreaM2: v })} unit="m²" />
        <FilterRow label="Min Winter" enabled={filters.minWinterEnabled} value={filters.minWinterKwh} onToggle={() => update({ minWinterEnabled: !filters.minWinterEnabled })} onValue={(v) => update({ minWinterKwh: v })} unit="kWh" />
        <FilterRow label="Max Winter" enabled={filters.maxWinterEnabled} value={filters.maxWinterKwh} onToggle={() => update({ maxWinterEnabled: !filters.maxWinterEnabled })} onValue={(v) => update({ maxWinterKwh: v })} unit="kWh" />
        <FilterRow label="Min Summer" enabled={filters.minSummerEnabled} value={filters.minSummerKwh} onToggle={() => update({ minSummerEnabled: !filters.minSummerEnabled })} onValue={(v) => update({ minSummerKwh: v })} unit="kWh" />
        <FilterRow label="Max Summer" enabled={filters.maxSummerEnabled} value={filters.maxSummerKwh} onToggle={() => update({ maxSummerEnabled: !filters.maxSummerEnabled })} onValue={(v) => update({ maxSummerKwh: v })} unit="kWh" />

        <div className="flex items-center gap-2">
          <button
            onClick={() => update({ onlyWithRoofsEnabled: !filters.onlyWithRoofsEnabled })}
            className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 ${
              filters.onlyWithRoofsEnabled ? "bg-primary" : "bg-[hsl(150,12%,20%)]"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full shadow-sm transition-transform ${
                filters.onlyWithRoofsEnabled ? "translate-x-3 bg-[hsl(150,20%,6%)]" : "translate-x-0 bg-[hsl(145,10%,40%)]"
              }`}
            />
          </button>
          <span className="text-xs text-[hsl(145,10%,55%)]">Only with roofs</span>
        </div>
      </div>
    </motion.div>
  );
}
