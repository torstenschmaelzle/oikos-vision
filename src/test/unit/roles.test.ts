import { describe, it, expect } from "vitest";
import { getNavItemsForRole, hasAccess, navItems } from "@/lib/roles";

describe("getNavItemsForRole", () => {
  it("superadmin sees all nav items", () => {
    const items = getNavItemsForRole("superadmin");
    expect(items).toHaveLength(navItems.length);
    expect(items.map((i) => i.to)).toContain("/api-settings");
    expect(items.map((i) => i.to)).toContain("/settings");
    expect(items.map((i) => i.to)).toContain("/map");
  });

  it("canton_admin sees Map and Settings but NOT API Settings", () => {
    const items = getNavItemsForRole("canton_admin");
    expect(items.map((i) => i.to)).toContain("/map");
    expect(items.map((i) => i.to)).toContain("/settings");
    expect(items.map((i) => i.to)).not.toContain("/api-settings");
  });

  it("canton_viewer sees only Map", () => {
    const items = getNavItemsForRole("canton_viewer");
    expect(items.map((i) => i.to)).toEqual(["/map"]);
  });
});

describe("hasAccess", () => {
  it("returns true when role is in allowed list", () => {
    expect(hasAccess("superadmin", ["superadmin", "canton_admin"])).toBe(true);
  });

  it("returns false when role is not in allowed list", () => {
    expect(hasAccess("canton_viewer", ["superadmin", "canton_admin"])).toBe(false);
  });
});
