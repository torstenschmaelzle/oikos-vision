import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Cpu,
  AlertCircle,
  RefreshCw,
  AppWindow,
  ShieldCheck,
  AlertTriangle,
  Terminal,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Navigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import LogEntry from "@/components/settings/LogEntry";

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

const CHANNELS: {
  value: LogChannel;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "app", label: "App Logs", description: "General backend activity", icon: AppWindow },
  { value: "auth", label: "Authentication Logs", description: "Login, refresh, logout & invite events", icon: ShieldCheck },
  { value: "error", label: "Error Logs", description: "Backend failures and problems", icon: AlertTriangle },
];

const DEFAULT_VISIBLE = 10;

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

export default function ApiSettingsPage() {
  const { user } = useAuth();
  const [channel, setChannel] = useState<LogChannel>("app");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<LogResponse>({
    queryKey: ["admin-logs", channel],
    queryFn: () => fetchLogs(channel),
    staleTime: 15_000,
  });

  const lines = useMemo(
    () => (data?.lines ?? []).slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, DEFAULT_VISIBLE),
    [data],
  );

  if (user?.role !== "superadmin") return <Navigate to="/map" replace />;

  const activeChannel = CHANNELS.find((c) => c.value === channel)!;

  return (
    <div className="flex-1 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
              <Cpu className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">API Settings</h1>
              <p className="text-muted-foreground text-sm">
                Inspect backend application, authentication, and error logs
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </motion.div>

        {/* Channel selectors */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          {CHANNELS.map((c) => {
            const isActive = channel === c.value;
            const Icon = c.icon;
            return (
              <button
                key={c.value}
                onClick={() => setChannel(c.value)}
                className={`
                  relative flex items-start gap-3 rounded-lg border p-4 text-left transition-all duration-150
                  ${
                    isActive
                      ? "border-primary bg-accent shadow-soft ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"
                  }
                `}
              >
                <div
                  className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${isActive ? "text-primary" : "text-foreground"}`}>
                    {c.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {c.description}
                  </p>
                </div>
              </button>
            );
          })}
        </motion.div>

        {/* Log viewer */}
        <motion.div
          key={channel}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-lg border bg-card shadow-soft overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <activeChannel.icon className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">{activeChannel.label}</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              Showing {lines.length} of {data?.lines?.length ?? 0} entries
            </span>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-5 w-3/4 rounded" />
                  <Skeleton className="h-3.5 w-1/2 rounded" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-destructive space-y-2">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm font-medium">Failed to load logs</p>
              <p className="text-xs text-muted-foreground max-w-md text-center">
                {(error as Error)?.message}
              </p>
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
              <Terminal className="w-8 h-8" />
              <p className="text-sm font-medium">No entries in {activeChannel.label}</p>
            </div>
          ) : (
            <ScrollArea className="h-[520px]">
              <div className="divide-y divide-border">
                {lines.map((line, i) => (
                  <LogEntry key={i} line={line} />
                ))}
              </div>
            </ScrollArea>
          )}

          {!isLoading && !isError && lines.length > 0 && (
            <div className="px-4 py-2.5 border-t bg-muted/20 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground font-mono">{data?.file}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {lines.length} entr{lines.length !== 1 ? "ies" : "y"} · newest first
              </span>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
