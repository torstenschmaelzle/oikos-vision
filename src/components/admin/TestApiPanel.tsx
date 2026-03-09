import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FlaskConical,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  Info,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  startTestRun,
  fetchRun,
  fetchLatestRun,
  fetchRunHistory,
  fetchRunOutput,
  type TestRun,
} from "@/lib/test-api";
import { toast } from "@/hooks/use-toast";

// ── Status helpers ──────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "succeeded":
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 gap-1">
          <CheckCircle2 className="w-3 h-3" /> Passed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
          <XCircle className="w-3 h-3" /> Failed
        </Badge>
      );
    case "running":
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Running
        </Badge>
      );
    case "queued":
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1">
          <Clock className="w-3 h-3" /> Queued
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatTimestamp(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

// ── Stat card ───────────────────────────────────────────────────────────

function StatCard({ label, value, colorClass }: { label: string; value: string | number; colorClass?: string }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3 text-center">
      <p className={`font-display text-xl font-bold tabular-nums ${colorClass ?? "text-foreground"}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ── Run summary card ────────────────────────────────────────────────────

function RunSummary({ run }: { run: TestRun }) {
  return (
    <div className="rounded-lg border bg-card shadow-soft overflow-hidden">
      <div className="px-5 py-3.5 border-b bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-foreground">Run Summary</span>
          <span className="font-mono text-xs text-muted-foreground">{shortId(run.run_id)}</span>
        </div>
        {statusBadge(run.status)}
      </div>

      <div className="p-5 space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total" value={run.total_tests ?? "—"} />
          <StatCard label="Passed" value={run.passed ?? "—"} colorClass="text-emerald-600 dark:text-emerald-400" />
          <StatCard label="Failed" value={run.failed ?? "—"} colorClass={run.failed ? "text-destructive" : undefined} />
          <StatCard label="Skipped" value={run.skipped ?? "—"} colorClass="text-amber-600 dark:text-amber-400" />
        </div>

        {/* Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-mono tabular-nums">{formatDuration(run.duration_seconds)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Triggered by</span>
            <span className="font-mono text-xs">{run.triggered_by ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span className="text-xs tabular-nums">{formatTimestamp(run.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Finished</span>
            <span className="text-xs tabular-nums">{formatTimestamp(run.finished_at)}</span>
          </div>
        </div>

        {/* Summary text */}
        {run.summary && (
          <div className="rounded-md bg-muted/40 border px-4 py-3">
            <p className="text-sm text-foreground leading-relaxed">{run.summary}</p>
          </div>
        )}

        {/* Failing tests */}
        {run.failing_tests && run.failing_tests.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Failing Tests</p>
            <div className="rounded-md bg-destructive/5 border border-destructive/15 p-3 space-y-1">
              {run.failing_tests.map((t, i) => (
                <p key={i} className="font-mono text-xs text-destructive break-all">{t}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main TestApiPanel ───────────────────────────────────────────────────

export default function TestApiPanel() {
  const queryClient = useQueryClient();
  const [pollingRunId, setPollingRunId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Latest run
  const latestQuery = useQuery({
    queryKey: ["test-run-latest"],
    queryFn: fetchLatestRun,
    staleTime: 10_000,
    retry: false,
  });

  // Run history
  const historyQuery = useQuery({
    queryKey: ["test-run-history"],
    queryFn: () => fetchRunHistory(20, 0),
    staleTime: 10_000,
    retry: false,
  });

  // Polling for active run
  const pollingQuery = useQuery({
    queryKey: ["test-run-poll", pollingRunId],
    queryFn: () => fetchRun(pollingRunId!),
    enabled: !!pollingRunId,
    refetchInterval: 2000,
  });

  // Stop polling when terminal
  useEffect(() => {
    if (pollingQuery.data && (pollingQuery.data.status === "succeeded" || pollingQuery.data.status === "failed")) {
      setPollingRunId(null);
      queryClient.invalidateQueries({ queryKey: ["test-run-latest"] });
      queryClient.invalidateQueries({ queryKey: ["test-run-history"] });
    }
  }, [pollingQuery.data, queryClient]);

  // Start run mutation
  const startMutation = useMutation({
    mutationFn: startTestRun,
    onSuccess: (data) => {
      toast({ title: "Test run started", description: `Run ${shortId(data.run_id)} queued.` });
      setPollingRunId(data.run_id);
    },
    onError: (err: any) => {
      if (err.status === 409) {
        toast({ title: "Run already in progress", description: err.message, variant: "destructive" });
        // Try to poll the active run from the error body
        if (err.body?.run_id) setPollingRunId(err.body.run_id);
      } else {
        toast({ title: "Failed to start run", description: err.message, variant: "destructive" });
      }
    },
  });

  // Detail view
  const detailQuery = useQuery({
    queryKey: ["test-run-detail", selectedRunId],
    queryFn: () => fetchRun(selectedRunId!),
    enabled: !!selectedRunId,
  });

  const [output, setOutput] = useState<string | null>(null);
  const [outputLoading, setOutputLoading] = useState(false);

  const loadOutput = useCallback(async (runId: string) => {
    setOutputLoading(true);
    try {
      const text = await fetchRunOutput(runId);
      setOutput(typeof text === "string" ? text : JSON.stringify(text, null, 2));
    } catch {
      setOutput("Failed to load output.");
    } finally {
      setOutputLoading(false);
    }
  }, []);

  useEffect(() => {
    if (detailQuery.data?.output_available && selectedRunId) {
      loadOutput(selectedRunId);
    } else {
      setOutput(null);
    }
  }, [detailQuery.data, selectedRunId, loadOutput]);

  // Determine the "current" run to display in the summary hero
  const activeRun = pollingQuery.data ?? latestQuery.data;
  const isRunning = pollingRunId !== null || activeRun?.status === "running" || activeRun?.status === "queued";

  // ── Detail view ─────────────────────────────────────────────────────
  if (selectedRunId) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4 border-b bg-card/40 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedRunId(null); setOutput(null); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <span className="text-sm font-semibold text-foreground">
            Run {selectedRunId ? shortId(selectedRunId) : ""}
          </span>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            {detailQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : detailQuery.data ? (
              <>
                <RunSummary run={detailQuery.data} />

                {output !== null && (
                  <div className="rounded-lg border bg-card shadow-soft overflow-hidden">
                    <div className="px-5 py-3 border-b bg-muted/20">
                      <span className="text-sm font-semibold text-foreground">Raw Output</span>
                    </div>
                    <ScrollArea className="max-h-[500px]">
                      <pre className="p-4 text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                        {outputLoading ? "Loading output…" : output}
                      </pre>
                    </ScrollArea>
                  </div>
                )}

                {detailQuery.data && !detailQuery.data.output_available && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                    <Info className="w-3.5 h-3.5" />
                    Output not available for this run.
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center py-12 text-muted-foreground">
                <AlertCircle className="w-6 h-6 mb-2" />
                <p className="text-sm">Could not load run details.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b bg-card/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <FlaskConical className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Test API</h2>
            <p className="text-xs text-muted-foreground">Run backend API tests and inspect the results.</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-6">
          {/* Trigger section */}
          <div className="rounded-lg border bg-card shadow-soft p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                  <Play className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Trigger Test Run</p>
                  <p className="text-xs text-muted-foreground">Execute the full backend API test suite.</p>
                </div>
              </div>

              <Button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending || isRunning}
                className="gap-2"
              >
                {startMutation.isPending || isRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isRunning ? "Running…" : "Run Tests"}
              </Button>
            </div>
          </div>

          {/* Skipped test note */}
          <div className="flex items-start gap-2.5 rounded-md border bg-muted/30 px-4 py-3">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Some tests may be skipped when no historical runs exist yet. Those tests will pass on later runs once run history is available.
            </p>
          </div>

          {/* Current / latest run summary */}
          {latestQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : activeRun ? (
            <RunSummary run={activeRun} />
          ) : (
            <div className="rounded-lg border bg-card p-8 text-center">
              <FlaskConical className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No test runs yet. Trigger one above.</p>
            </div>
          )}

          {/* Run history */}
          <div className="rounded-lg border bg-card shadow-soft overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-muted/20">
              <span className="text-sm font-semibold text-foreground">Run History</span>
            </div>

            {historyQuery.isLoading ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : historyQuery.isError ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Failed to load run history.
              </div>
            ) : !historyQuery.data?.runs?.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No previous runs.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {historyQuery.data.runs.map((run) => (
                  <button
                    key={run.run_id}
                    onClick={() => setSelectedRunId(run.run_id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors text-left"
                  >
                    <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                      {shortId(run.run_id)}
                    </span>
                    {statusBadge(run.status)}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatTimestamp(run.created_at)}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {formatDuration(run.duration_seconds)}
                    </span>
                    <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
                      {run.passed != null && <span className="text-emerald-600 dark:text-emerald-400">{run.passed}✓</span>}
                      {run.failed != null && run.failed > 0 && <span className="text-destructive">{run.failed}✗</span>}
                      {run.skipped != null && run.skipped > 0 && <span className="text-amber-600 dark:text-amber-400">{run.skipped}⊘</span>}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
