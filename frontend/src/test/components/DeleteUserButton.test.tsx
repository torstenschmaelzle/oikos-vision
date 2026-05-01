import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteUserButton from "@/components/settings/DeleteUserButton";
import { renderWithProviders } from "@/test/helpers/render";

// Mock the API
const mockDeleteUser = vi.fn();
vi.mock("@/lib/api", () => ({
  authApi: {
    deleteUser: (...args: any[]) => mockDeleteUser(...args),
  },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("DeleteUserButton", () => {
  beforeEach(() => {
    mockDeleteUser.mockReset();
  });

  it("renders a delete button", () => {
    renderWithProviders(
      <DeleteUserButton userId={1} userEmail="test@example.com" queryKey="admin-users" />
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("shows confirmation dialog on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DeleteUserButton userId={1} userEmail="test@example.com" queryKey="admin-users" />
    );

    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Delete user")).toBeInTheDocument();
    expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it("has Cancel button that closes dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DeleteUserButton userId={1} userEmail="test@example.com" queryKey="admin-users" />
    );

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.queryByText("Delete user")).not.toBeInTheDocument();
    });
  });

  it("calls deleteUser API on confirm", async () => {
    mockDeleteUser.mockResolvedValue({ ok: true, message: "Deleted" });
    const user = userEvent.setup();
    renderWithProviders(
      <DeleteUserButton userId={42} userEmail="victim@example.com" queryKey="admin-users" />
    );

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(mockDeleteUser).toHaveBeenCalledWith(42);
    });
  });
});
