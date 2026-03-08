/**
 * Utilities for parsing raw backend log messages into structured UI-friendly objects.
 */

export interface ParsedRequestLog {
  kind: "request";
  method: string;
  path: string;
  status: number | null;
  duration: string | null;
  ip: string | null;
  forwarded: string | null;
  extra: string | null;
}

export interface ParsedGenericLog {
  kind: "generic";
  text: string;
}

export type ParsedLog = ParsedRequestLog | ParsedGenericLog;

// Match lines like: GET /api/health 200 0.7ms ip=1.2.3.4 req_id=abc fwd=5.6.7.8
const REQUEST_RE =
  /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\/\S*)\s+(\d{3})(?:\s+([\d.]+\s*m?s))?(.*)$/i;

const REQ_ID_RE = /\breq_id=\S+/g;
const IP_RE = /\bip=([\d.]+)/;
const FWD_RE = /\bfwd=([\S]+)/;

export function parseLogMessage(raw: string): ParsedLog {
  const match = raw.match(REQUEST_RE);
  if (!match) {
    // Strip req_id from generic messages too
    const cleaned = raw.replace(REQ_ID_RE, "").replace(/\s{2,}/g, " ").trim();
    return { kind: "generic", text: cleaned };
  }

  const [, method, path, statusStr, duration, rest] = match;
  const cleanRest = rest.replace(REQ_ID_RE, "").trim();

  const ipMatch = cleanRest.match(IP_RE);
  const fwdMatch = cleanRest.match(FWD_RE);

  // Build remaining extra after removing known fields
  let extra = cleanRest
    .replace(IP_RE, "")
    .replace(FWD_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!extra) extra = null;

  return {
    kind: "request",
    method: method.toUpperCase(),
    path,
    status: statusStr ? parseInt(statusStr, 10) : null,
    duration: duration?.trim() ?? null,
    ip: ipMatch?.[1] ?? null,
    forwarded: fwdMatch?.[1] ?? null,
    extra,
  };
}

// ── HTTP Method color mapping ──────────────────────────────────────────
export function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/25";
    case "POST":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25";
    case "PUT":
    case "PATCH":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25";
    case "DELETE":
      return "bg-destructive/15 text-destructive border-destructive/25";
    case "OPTIONS":
    case "HEAD":
      return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

// ── Status code color ──────────────────────────────────────────────────
export function statusColor(status: number): string {
  if (status < 300) return "text-emerald-600 dark:text-emerald-400";
  if (status < 400) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

// ── Log level color ────────────────────────────────────────────────────
export function levelColor(level: string): string {
  switch (level.toUpperCase()) {
    case "ERROR":
    case "CRITICAL":
      return "bg-destructive/15 text-destructive border-destructive/20";
    case "WARNING":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20";
    case "INFO":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    case "DEBUG":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
