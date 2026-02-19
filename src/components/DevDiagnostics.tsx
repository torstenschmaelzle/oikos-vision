import { useState } from "react";
import { Activity, Server, ChevronDown, ChevronUp } from "lucide-react";

const API = "https://data.apioikosconsulting.com";

interface Result {
  url: string;
  status: number;
  duration: number;
  body: unknown;
}

export default function DevDiagnostics() {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Result | null>(null);
  const [cantons, setCantons] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (import.meta.env.PROD) return null;

  const run = async (path: string, setter: (r: Result) => void) => {
    const url = `${API}${path}`;
    const start = performance.now();
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.json();
    setter({ url, status: res.status, duration: performance.now() - start, body });
  };

  const runAll = async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([run("/api/health", setHealth), run("/api/cantons", setCantons)]);
    } catch (e: any) {
      setError(e.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:opacity-90 transition-opacity"
      >
        <Activity className="w-3.5 h-3.5" />
        Diagnostics
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 bg-card border border-border rounded-xl shadow-elevated p-4 space-y-3 text-foreground text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">API Diagnostics</span>
            <button
              onClick={runAll}
              disabled={loading}
              className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Running…" : "Run Tests"}
            </button>
          </div>

          <p className="text-muted-foreground break-all">
            <Server className="w-3 h-3 inline mr-1" />
            {API}
          </p>

          {error && <p className="text-destructive font-medium">Error: {error}</p>}

          {[{ label: "/api/health", data: health }, { label: "/api/cantons", data: cantons }].map(
            ({ label, data }) =>
              data && (
                <div key={label} className="border border-border rounded-lg p-3 space-y-1">
                  <p className="font-semibold">{label}</p>
                  <p>URL: <span className="text-muted-foreground break-all">{data.url}</span></p>
                  <p>
                    Status:{" "}
                    <span className={data.status < 400 ? "text-primary" : "text-destructive"}>
                      {data.status}
                    </span>
                  </p>
                  <p>Duration: {data.duration.toFixed(0)}ms</p>
                  <pre className="mt-1 p-2 rounded-md bg-muted text-[10px] overflow-auto max-h-32 whitespace-pre-wrap">
                    {JSON.stringify(data.body, null, 2)}
                  </pre>
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}
