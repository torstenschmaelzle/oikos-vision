import { describe, it, expect } from "vitest";
import { parseLogMessage, methodColor, statusColor, levelColor } from "@/lib/log-parser";

describe("parseLogMessage", () => {
  it("parses a standard request log line (without req_id prefix)", () => {
    // The regex expects method at the start; req_id is stripped before matching
    const result = parseLogMessage(
      "GET /api/cantons 200 31.9ms ip=172.31.38.143 fwd=31.165.218.45, 172.31.38.143 real_ip=172.31.38.143"
    );
    expect(result.kind).toBe("request");
    if (result.kind === "request") {
      expect(result.method).toBe("GET");
      expect(result.path).toBe("/api/cantons");
      expect(result.status).toBe(200);
      expect(result.duration).toBe("31.9ms");
      expect(result.ip).toBe("172.31.38.143");
    }
  });

  it("parses a POST request", () => {
    const result = parseLogMessage("POST /api/auth/login 200 11.4ms ip=127.0.0.1");
    expect(result.kind).toBe("request");
    if (result.kind === "request") {
      expect(result.method).toBe("POST");
      expect(result.path).toBe("/api/auth/login");
      expect(result.status).toBe(200);
    }
  });

  it("handles non-request lines as generic", () => {
    const result = parseLogMessage("LOGIN success email=admin@example.com user_id=1 role=superadmin");
    expect(result.kind).toBe("generic");
    if (result.kind === "generic") {
      expect(result.text).toContain("LOGIN success");
    }
  });

  it("strips req_id from generic messages", () => {
    const result = parseLogMessage("req_id=xyz Some generic message");
    expect(result.kind).toBe("generic");
    if (result.kind === "generic") {
      expect(result.text).not.toContain("req_id");
      expect(result.text).toContain("Some generic message");
    }
  });

  it("parses DELETE requests", () => {
    const result = parseLogMessage("DELETE /api/auth/users/5 200 8ms ip=127.0.0.1");
    expect(result.kind).toBe("request");
    if (result.kind === "request") {
      expect(result.method).toBe("DELETE");
      expect(result.status).toBe(200);
    }
  });

  it("handles 401/403 status codes", () => {
    const result = parseLogMessage("POST /api/auth/refresh 401 1.2ms ip=172.31.38.143");
    if (result.kind === "request") {
      expect(result.status).toBe(401);
    }
  });
});

describe("methodColor", () => {
  it("returns distinct classes for GET, POST, DELETE", () => {
    const get = methodColor("GET");
    const post = methodColor("POST");
    const del = methodColor("DELETE");
    expect(get).not.toBe(post);
    expect(get).not.toBe(del);
  });
});

describe("statusColor", () => {
  it("returns success color for 2xx", () => {
    expect(statusColor(200)).toContain("emerald");
  });

  it("returns warning color for 3xx", () => {
    expect(statusColor(301)).toContain("amber");
  });

  it("returns error color for 4xx/5xx", () => {
    expect(statusColor(401)).toContain("destructive");
    expect(statusColor(500)).toContain("destructive");
  });
});

describe("levelColor", () => {
  it("returns appropriate colors for all levels", () => {
    expect(levelColor("ERROR")).toContain("destructive");
    expect(levelColor("WARNING")).toContain("amber");
    expect(levelColor("INFO")).toContain("emerald");
    expect(levelColor("DEBUG")).toContain("muted");
  });
});
