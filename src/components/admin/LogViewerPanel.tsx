import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, AlertCircle, Terminal } from "lucide-react";
import { getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import LogEntry from "@/components/settings/LogEntry";

type LogChannel = "app" | "auth" | "error";

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

const CHANNEL_LABELS: Record<LogChannel, string> = {
  app: "App Logs",
  auth: "Authentication Logs",
  error: "Error Logs",
};

const DEFAULT_VISIBLE = 10;

async function fetchLogs(channel: LogChannel): Promise<LogResponse> {
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

export default function LogViewerPanel({ channel }: { channel: LogChannel }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<LogResponse>({
    queryKey: ["admin-logs", channel],
    queryFn: () => fetchLogs(channel),
    staleTime: 15_000,
  });

  const lines = useMemo(
    () =>
      (data?.lines ?? [])
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, DEFAULT_VISIBLE),
    [data],
  );

  const label = CHANNEL_LABELS[channel];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b bg-card/40">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">{label}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Showing {lines.length} of {data?.lines?.length ?? 0} entries · newest first
          </p>
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
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-5 w-3/4 rounded" />
                <Skeleton className="h-3.5 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-destructive space-y-2">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm font-medium">Failed to load logs</p>
            <p className="text-xs text-muted-foreground max-w-md text-center">
              {(error as Error)?.message}
            </p>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
            <Terminal className="w-8 h-8" />
            <p className="text-sm font-medium">No entries in {label}</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="divide-y divide-border">
              {lines.map((line, i) => (
                <LogEntry key={i} line={line} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Footer */}
      {!isLoading && !isError && lines.length > 0 && (
        <div className="px-5 py-2.5 border-t bg-muted/20 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground font-mono">{data?.file}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {lines.length} entr{lines.length !== 1 ? "ies" : "y"}
          </span>
        </div>
      )}
    </div>
  );
}
