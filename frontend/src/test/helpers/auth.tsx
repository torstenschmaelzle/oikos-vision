/**
 * Auth test helpers — mock AuthProvider with controllable user state.
 */
import React from "react";
import type { AuthUser } from "@/lib/api";

// ── Factory functions for test users ────────────────────────────────────

export function createSuperadmin(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: 1,
    email: "admin@example.com",
    role: "superadmin",
    canton_code: null,
    ...overrides,
  };
}

export function createCantonAdmin(
  cantonCode = "ZH",
  overrides?: Partial<AuthUser>
): AuthUser {
  return {
    id: 2,
    email: "canton-admin@example.com",
    role: "canton_admin",
    canton_code: cantonCode,
    ...overrides,
  };
}

export function createCantonViewer(
  cantonCode = "ZH",
  overrides?: Partial<AuthUser>
): AuthUser {
  return {
    id: 3,
    email: "viewer@example.com",
    role: "canton_viewer",
    canton_code: cantonCode,
    ...overrides,
  };
}

// ── Mock AuthContext value ──────────────────────────────────────────────

export interface MockAuthValue {
  user: AuthUser | null;
  loading: boolean;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  setupAccount: ReturnType<typeof vi.fn>;
}

export function createMockAuth(user: AuthUser | null = null): MockAuthValue {
  return {
    user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    setupAccount: vi.fn(),
  };
}

/**
 * Mock the auth-context module.
 * Call this at the top of test files that need auth:
 *
 *   const mockAuth = createMockAuth(createSuperadmin());
 *   vi.mock("@/lib/auth-context", () => ({
 *     useAuth: () => mockAuth,
 *     AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
 *   }));
 */
