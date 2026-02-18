import { useState, useRef, useEffect, useMemo } from "react";
import { Canton, Gemeinde } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Building2, Hash, Search, X, ChevronDown } from "lucide-react";

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

function SearchableSelect<T extends { label: string; value: number }>({
  items,
  value,
  onChange,
  placeholder,
  disabled,
  icon: Icon,
}: {
  items: T[];
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  disabled?: boolean;
  icon: React.ElementType;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  const selectedLabel = value != null ? items.find((i) => i.value === value)?.label ?? "" : "";

  useEffect(() => { setHighlightIndex(0); }, [filtered]);
  useEffect(() => { if (!open) setQuery(""); }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((p) => Math.min(p + 1, filtered.length - 1));
      setTimeout(() => {
        listRef.current?.querySelector(`[data-idx="${Math.min(highlightIndex + 1, filtered.length - 1)}"]`)?.scrollIntoView({ block: "nearest" });
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter" && filtered[highlightIndex]) {
      onChange(filtered[highlightIndex].value);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-sm transition-all cursor-pointer ${
          open
            ? "border-primary/50 ring-2 ring-primary/20 bg-[hsl(150,15%,12%)]"
            : "border-primary/15 hover:border-primary/30 bg-[hsl(150,15%,10%)]"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        onClick={() => {
          if (!disabled) { setOpen(true); setTimeout(() => inputRef.current?.focus()); }
        }}
      >
        <Icon className="w-3.5 h-3.5 text-[hsl(145,10%,50%)] shrink-0" />
        {open ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-sm text-[hsl(145,15%,90%)] placeholder:text-[hsl(145,10%,40%)]"
            placeholder={`Search ${placeholder.toLowerCase()}…`}
            autoFocus
          />
        ) : (
          <span className={`flex-1 truncate ${value ? "text-[hsl(145,15%,90%)]" : "text-[hsl(145,10%,45%)]"}`}>
            {selectedLabel || placeholder}
          </span>
        )}
        {value && !open ? (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="p-0.5 hover:bg-[hsl(150,15%,15%)] rounded transition-colors"
          >
            <X className="w-3.5 h-3.5 text-[hsl(145,10%,50%)]" />
          </button>
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 text-[hsl(145,10%,50%)] transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            ref={listRef}
            className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-primary/15 bg-[hsl(150,15%,10%)] shadow-[0_8px_30px_-8px_hsla(150,30%,5%,0.6)] backdrop-blur-xl"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[hsl(145,10%,40%)] text-center">No results found</div>
            ) : (
              filtered.map((item, idx) => (
                <button
                  key={item.value}
                  data-idx={idx}
                  onClick={() => { onChange(item.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    idx === highlightIndex
                      ? "bg-primary/15 text-[hsl(145,15%,90%)]"
                      : "hover:bg-[hsl(150,15%,14%)] text-[hsl(145,15%,80%)]"
                  } ${item.value === value ? "font-semibold" : ""}`}
                >
                  {item.label}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  const cantonItems = useMemo(
    () => cantons.map((c) => ({ label: c.name, value: c.id })),
    [cantons]
  );
  const gemeindeItems = useMemo(
    () => gemeinden.map((g) => ({ label: g.name, value: g.bfs_nummer })),
    [gemeinden]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(145,10%,50%)] flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5" /> Selection
      </h3>

      <div className="space-y-2">
        <label className="text-xs font-medium text-[hsl(145,10%,45%)]">Canton</label>
        <SearchableSelect
          items={cantonItems}
          value={selectedCantonId}
          onChange={onSelectCanton}
          placeholder="All Cantons"
          disabled={disabled}
          icon={Search}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-[hsl(145,10%,45%)] flex items-center gap-1">
          <Building2 className="w-3 h-3" /> Gemeinde
        </label>
        <SearchableSelect
          items={gemeindeItems}
          value={selectedBfs}
          onChange={onSelectGemeinde}
          placeholder="Select Gemeinde"
          disabled={disabled || !selectedCantonId}
          icon={Search}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-[hsl(145,10%,45%)] flex items-center gap-1">
          <Hash className="w-3 h-3" /> Limit
        </label>
        <select
          className="w-full rounded-lg border border-primary/15 bg-[hsl(150,15%,10%)] px-3 py-2 text-sm text-[hsl(145,15%,90%)] focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow disabled:opacity-50"
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
