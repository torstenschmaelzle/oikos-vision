/**
 * API helpers for the Test API runner (superadmin-only).
 * All endpoints under /api/admin/tests/runs.
 */

import { getAccessToken } from "./api";

const BASE = "https://data.apioikosconsulting.com";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const token = getAccessToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// ── Types ───────────────────────────────────────────────────────────────

export interface TestRun {
  run_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  total_tests: number | null;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  duration_seconds: number | null;
  summary: string | null;
  triggered_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  output_available: boolean;
  failing_tests: string[] | null;
}

export interface StartRunResponse {
  run_id: string;
  status: string;
  message: string;
}

export interface RunListResponse {
  runs: TestRun[];
  total: number;
}

// ── Fetch helpers ───────────────────────────────────────────────────────

async function handleRes<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const b = await res.json();
      detail = b?.detail ?? b?.message ?? "";
    } catch {}
    throw Object.assign(
      new Error(`API ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`),
      { status: res.status }
    );
  }
  return res.json();
}

export async function startTestRun(): Promise<StartRunResponse> {
  const res = await fetch(`${BASE}/api/admin/tests/runs`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
  });
  // 409 = run already in progress — we still parse the body
  if (res.status === 409) {
    const body = await res.json();
    throw Object.assign(new Error(body?.detail ?? body?.message ?? "Run already in progress"), {
      status: 409,
      body,
    });
  }
  return handleRes<StartRunResponse>(res);
}

export async function fetchRun(runId: string): Promise<TestRun> {
  const res = await fetch(`${BASE}/api/admin/tests/runs/${runId}`, {
    headers: authHeaders(),
    credentials: "include",
  });
  return handleRes<TestRun>(res);
}

export async function fetchLatestRun(): Promise<TestRun> {
  const res = await fetch(`${BASE}/api/admin/tests/runs/latest`, {
    headers: authHeaders(),
    credentials: "include",
  });
  return handleRes<TestRun>(res);
}

export async function fetchRunOutput(runId: string): Promise<string> {
  const res = await fetch(`${BASE}/api/admin/tests/runs/${runId}/output`, {
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body?.output ?? body ?? "";
}

export async function fetchRunHistory(
  limit = 20,
  offset = 0
): Promise<RunListResponse> {
  const res = await fetch(
    `${BASE}/api/admin/tests/runs?limit=${limit}&offset=${offset}`,
    { headers: authHeaders(), credentials: "include" }
  );
  return handleRes<RunListResponse>(res);
}
