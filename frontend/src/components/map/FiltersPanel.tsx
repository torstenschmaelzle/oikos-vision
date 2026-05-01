import { useState, useEffect } from "react";
import { FilterState, FilterOptions } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { SlidersHorizontal, ChevronDown, ChevronRight, X } from "lucide-react";

interface Props {
  filters: FilterState;
  filterOptions: FilterOptions | null;
  hasGemeinde: boolean;
  onChange: (f: FilterState) => void;
}

function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {title}
        </span>
        {badge ? (
          <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 leading-none tabular-nums">
            {badge}
          </span>
        ) : null}
      </button>
      {open && <div className="space-y-0.5 pl-4">{children}</div>}
    </div>
  );
}

function FilterItem({
  code,
  label,
  count,
  checked,
  onToggle,
}: {
  code: number;
  label: string | null;
  count: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group py-0.5">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="shrink-0" />
      <span className="text-xs text-foreground flex-1 min-w-0 truncate group-hover:text-primary transition-colors">
        {label ?? `Code ${code}`}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {count.toLocaleString("de-CH")}
      </span>
    </label>
  );
}

export default function FiltersPanel({ filters, filterOptions, hasGemeinde, onChange }: Props) {
  const [baujahrMin, setBaujahrMin] = useState(filters.baujahr_min?.toString() ?? "");
  const [baujahrMax, setBaujahrMax] = useState(filters.baujahr_max?.toString() ?? "");

  // Sync local inputs when filters are reset externally (e.g. new Gemeinde selected)
  useEffect(() => { setBaujahrMin(filters.baujahr_min?.toString() ?? ""); }, [filters.baujahr_min]);
  useEffect(() => { setBaujahrMax(filters.baujahr_max?.toString() ?? ""); }, [filters.baujahr_max]);

  // Debounce year inputs → API call
  useEffect(() => {
    const timer = setTimeout(() => {
      const min = baujahrMin ? parseInt(baujahrMin, 10) : null;
      const max = baujahrMax ? parseInt(baujahrMax, 10) : null;
      if (min !== filters.baujahr_min || max !== filters.baujahr_max) {
        onChange({ ...filters, baujahr_min: min, baujahr_max: max });
      }
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baujahrMin, baujahrMax]);

  const toggle = (field: "gkat" | "gklas" | "genh1" | "sb_objektart", code: number) => {
    const cur = filters[field];
    onChange({
      ...filters,
      [field]: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code],
    });
  };

  const hasActive =
    filters.gkat.length > 0 ||
    filters.gklas.length > 0 ||
    filters.genh1.length > 0 ||
    filters.sb_objektart.length > 0 ||
    filters.baujahr_min != null ||
    filters.baujahr_max != null ||
    filters.ggesh_min != null ||
    filters.ggesh_max != null;

  const clearAll = () => {
    onChange({ gkat: [], gklas: [], genh1: [], sb_objektart: [], baujahr_min: null, baujahr_max: null, ggesh_min: null, ggesh_max: null });
    setBaujahrMin("");
    setBaujahrMax("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
        </h3>
        {hasActive && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {!hasGemeinde ? (
        <p className="text-xs text-muted-foreground/60 italic">Select a Gemeinde to load filters.</p>
      ) : !filterOptions ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-5 rounded bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Energy source — most important for renovation targeting */}
          {filterOptions.genh1.length > 0 && (
            <Section title="Heizung" badge={filters.genh1.length || undefined}>
              {filterOptions.genh1.map((item) => (
                <FilterItem
                  key={item.code}
                  code={item.code}
                  label={item.label}
                  count={item.buildings}
                  checked={filters.genh1.includes(item.code)}
                  onToggle={() => toggle("genh1", item.code)}
                />
              ))}
            </Section>
          )}

          {/* Building category */}
          {filterOptions.gkat.length > 0 && (
            <Section title="Gebäudekategorie" badge={filters.gkat.length || undefined}>
              {filterOptions.gkat.map((item) => (
                <FilterItem
                  key={item.code}
                  code={item.code}
                  label={item.label}
                  count={item.buildings}
                  checked={filters.gkat.includes(item.code)}
                  onToggle={() => toggle("gkat", item.code)}
                />
              ))}
            </Section>
          )}

          {/* Construction year range */}
          <Section title="Baujahr">
            <div className="flex items-center gap-2 pt-0.5">
              <input
                type="number"
                placeholder={filterOptions.baujahr_range.min?.toString() ?? "von"}
                value={baujahrMin}
                onChange={(e) => setBaujahrMin(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <span className="text-xs text-muted-foreground shrink-0">–</span>
              <input
                type="number"
                placeholder={filterOptions.baujahr_range.max?.toString() ?? "bis"}
                value={baujahrMax}
                onChange={(e) => setBaujahrMax(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </Section>

          {/* Building class — collapsed by default, more granular */}
          {filterOptions.gklas.length > 0 && (
            <Section title="Gebäudeklasse" badge={filters.gklas.length || undefined} defaultOpen={false}>
              {filterOptions.gklas.map((item) => (
                <FilterItem
                  key={item.code}
                  code={item.code}
                  label={item.label}
                  count={item.buildings}
                  checked={filters.gklas.includes(item.code)}
                  onToggle={() => toggle("gklas", item.code)}
                />
              ))}
            </Section>
          )}

          {/* Roof type — collapsed by default, useful for exclusions */}
          {filterOptions.sb_objektart.length > 0 && (
            <Section title="Dachtyp" badge={filters.sb_objektart.length || undefined} defaultOpen={false}>
              {filterOptions.sb_objektart.map((item) => (
                <FilterItem
                  key={item.code}
                  code={item.code}
                  label={item.label}
                  count={item.buildings}
                  checked={filters.sb_objektart.includes(item.code)}
                  onToggle={() => toggle("sb_objektart", item.code)}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </motion.div>
  );
}
