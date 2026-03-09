import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import RoleGuard from "@/components/auth/RoleGuard";
import { renderWithProviders } from "@/test/helpers/render";
import { createSuperadmin, createCantonViewer, createCantonAdmin } from "@/test/helpers/auth";

// We need to mock useAuth for each scenario
const mockUser = { current: createSuperadmin() as any };

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: mockUser.current,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    setupAccount: vi.fn(),
  }),
}));

describe("RoleGuard", () => {
  it("renders children when user has allowed role", () => {
    mockUser.current = createSuperadmin();
    renderWithProviders(
      <RoleGuard allowed={["superadmin"]}>
        <div>Protected Content</div>
      </RoleGuard>,
      { route: "/settings" }
    );
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects when user lacks required role", () => {
    mockUser.current = createCantonViewer();
    renderWithProviders(
      <RoleGuard allowed={["superadmin"]}>
        <div>Protected Content</div>
      </RoleGuard>,
      { route: "/api-settings" }
    );
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("allows canton_admin when in allowed list", () => {
    mockUser.current = createCantonAdmin();
    renderWithProviders(
      <RoleGuard allowed={["superadmin", "canton_admin"]}>
        <div>Settings Content</div>
      </RoleGuard>,
      { route: "/settings" }
    );
    expect(screen.getByText("Settings Content")).toBeInTheDocument();
  });

  it("redirects when user is null", () => {
    mockUser.current = null;
    renderWithProviders(
      <RoleGuard allowed={["superadmin"]}>
        <div>Protected Content</div>
      </RoleGuard>,
      { route: "/settings" }
    );
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });
});
