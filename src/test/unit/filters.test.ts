import { describe, it, expect } from "vitest";
import { defaultFilters, type FilterState, type Building } from "@/lib/types";

// Re-implement applyFilters here since it's not exported from useMapState
// This tests the filter logic independently
function applyFilters(buildings: Building[], f: FilterState): Building[] {
  return buildings.filter((b) => {
    if (f.minAreaEnabled && (b.roof_area_sum_m2 ?? 0) < f.minAreaM2) return false;
    if (f.maxAreaEnabled && (b.roof_area_sum_m2 ?? Infinity) > f.maxAreaM2) return false;
    if (f.minWinterEnabled && (b.winter_total ?? 0) < f.minWinterKwh) return false;
    if (f.maxWinterEnabled && (b.winter_total ?? Infinity) > f.maxWinterKwh) return false;
    if (f.minSummerEnabled && (b.sommer_total ?? 0) < f.minSummerKwh) return false;
    if (f.maxSummerEnabled && (b.sommer_total ?? Infinity) > f.maxSummerKwh) return false;
    if (f.onlyWithRoofsEnabled && (!b.roof_rows || b.roof_rows <= 0)) return false;
    return true;
  });
}

const mockBuildings: Building[] = [
  { bdg_egid: 1, roof_area_sum_m2: 100, winter_total: 5000, sommer_total: 12000, roof_rows: 3 },
  { bdg_egid: 2, roof_area_sum_m2: 50, winter_total: 2000, sommer_total: 6000, roof_rows: 0 },
  { bdg_egid: 3, roof_area_sum_m2: 300, winter_total: 15000, sommer_total: 30000, roof_rows: 5 },
  { bdg_egid: 4, roof_area_sum_m2: null, winter_total: null, sommer_total: null, roof_rows: null },
];

describe("applyFilters", () => {
  it("returns all buildings with default (disabled) filters", () => {
    const result = applyFilters(mockBuildings, defaultFilters);
    expect(result).toHaveLength(4);
  });

  it("filters by minArea when enabled", () => {
    const f: FilterState = { ...defaultFilters, minAreaEnabled: true, minAreaM2: 80 };
    const result = applyFilters(mockBuildings, f);
    expect(result.map((b) => b.bdg_egid)).toEqual([1, 3]);
  });

  it("filters by maxArea when enabled", () => {
    const f: FilterState = { ...defaultFilters, maxAreaEnabled: true, maxAreaM2: 100 };
    const result = applyFilters(mockBuildings, f);
    expect(result.map((b) => b.bdg_egid)).toEqual([1, 2]);
  });

  it("filters by minWinter when enabled", () => {
    const f: FilterState = { ...defaultFilters, minWinterEnabled: true, minWinterKwh: 4000 };
    const result = applyFilters(mockBuildings, f);
    expect(result.map((b) => b.bdg_egid)).toEqual([1, 3]);
  });

  it("filters by onlyWithRoofs", () => {
    const f: FilterState = { ...defaultFilters, onlyWithRoofsEnabled: true };
    const result = applyFilters(mockBuildings, f);
    expect(result.map((b) => b.bdg_egid)).toEqual([1, 3]);
  });

  it("combines multiple filters", () => {
    const f: FilterState = {
      ...defaultFilters,
      minAreaEnabled: true,
      minAreaM2: 80,
      onlyWithRoofsEnabled: true,
      minSummerEnabled: true,
      minSummerKwh: 15000,
    };
    const result = applyFilters(mockBuildings, f);
    expect(result.map((b) => b.bdg_egid)).toEqual([3]);
  });

  it("handles null values gracefully", () => {
    const f: FilterState = { ...defaultFilters, minAreaEnabled: true, minAreaM2: 1 };
    const result = applyFilters(mockBuildings, f);
    // Building 4 has null area → treated as 0, so excluded
    expect(result.find((b) => b.bdg_egid === 4)).toBeUndefined();
  });
});
