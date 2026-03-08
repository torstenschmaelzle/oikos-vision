import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Terminal, AlertCircle, RefreshCw, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Types ───────────────────────────────────────────────────────────────

interface LogLine {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
}

interface LogResponse {
  file: string;
  lines: LogLine[];
}

type LogChannel = "app" | "auth" | "error";

const CHANNELS: { value: LogChannel; label: string }[] = [
  { value: "app", label: "App" },
  { value: "auth", label: "Auth" },
  { value: "error", label: "Error" },
];

// ── Fetch helper (reuses token from api module) ─────────────────────────

async function fetchLogs(channel: LogChannel): Promise<LogResponse> {
  const { getAccessToken } = await import("@/lib/api");
  const token = getAccessToken();
  const url = `https://data.apioikosconsulting.com/api/admin/logs/${channel}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { method: "GET", headers, credentials: "include" });
  if (!res.ok) {
    let detail = "";
    try { const b = await res.json(); detail = b?.detail ?? ""; } catch {}
    throw new Error(`API ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

// ── Level badge styling ─────────────────────────────────────────────────

function levelColor(level: string) {
  switch (level.toUpperCase()) {
    case "ERROR": return "bg-destructive/15 text-destructive border-destructive/20";
    case "WARNING": return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20";
    case "INFO": return "bg-primary/10 text-primary border-primary/20";
    case "DEBUG": return "bg-muted text-muted-foreground border-border";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

// ── Component ───────────────────────────────────────────────────────────

export default function ApiSettingsPage() {
  const { user } = useAuth();

  const [channel, setChannel] = useState<LogChannel>("app");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<LogResponse>({
    queryKey: ["admin-logs", channel],
    queryFn: () => fetchLogs(channel),
    staleTime: 15_000,
  });

  // Reverse so newest logs appear first
  const lines = useMemo(() => (data?.lines ?? []).slice().reverse(), [data]);

  if (user?.role !== "superadmin") return <Navigate to="/map" replace />;

  return (
    <div className="flex-1 bg-gradient-to-b from-secondary to-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Terminal className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">API Settings</h1>
              <p className="text-muted-foreground text-sm">View backend logs across services</p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </motion.div>

        {/* Channel tabs */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
          <Tabs value={channel} onValueChange={(v) => setChannel(v as LogChannel)}>
            <TabsList>
              {CHANNELS.map((c) => (
                <TabsTrigger key={c.value} value={c.value} className="gap-1.5 text-sm">
                  <FileText className="w-3.5 h-3.5" />
                  {c.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </motion.div>

        {/* Log content */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.1 }}>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-destructive space-y-2">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm font-medium">Failed to load logs</p>
              <p className="text-xs text-muted-foreground">{(error as Error)?.message}</p>
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
              <Terminal className="w-8 h-8" />
              <p className="text-sm font-medium">No log entries for {channel}</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="divide-y divide-border">
                {lines.map((line, i) => (
                  <div key={i} className="flex gap-3 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                    <span className="shrink-0 text-xs text-muted-foreground font-mono tabular-nums pt-0.5 min-w-[140px]">
                      {line.timestamp}
                    </span>
                    <Badge variant="outline" className={`shrink-0 text-[10px] h-5 font-semibold uppercase tracking-wider border ${levelColor(line.level)}`}>
                      {line.level}
                    </Badge>
                    <span className="shrink-0 text-xs text-muted-foreground font-mono pt-0.5 min-w-[100px]">
                      {line.logger}
                    </span>
                    <span className="text-foreground break-all font-mono text-xs leading-relaxed pt-0.5">
                      {line.message}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t text-xs text-muted-foreground">
                {lines.length} entr{lines.length !== 1 ? "ies" : "y"} · {data?.file}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
