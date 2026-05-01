import { describe, it, expect } from "vitest";
import { defaultFilters, type FilterState } from "@/lib/types";

describe("defaultFilters", () => {
  it("has empty arrays for all multi-select fields", () => {
    expect(defaultFilters.gkat).toEqual([]);
    expect(defaultFilters.gklas).toEqual([]);
    expect(defaultFilters.genh1).toEqual([]);
    expect(defaultFilters.sb_objektart).toEqual([]);
  });

  it("has null for all range fields", () => {
    expect(defaultFilters.baujahr_min).toBeNull();
    expect(defaultFilters.baujahr_max).toBeNull();
    expect(defaultFilters.ggesh_min).toBeNull();
    expect(defaultFilters.ggesh_max).toBeNull();
  });
});

describe("FilterState toggle logic", () => {
  function toggleCode(codes: number[], code: number): number[] {
    return codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
  }

  it("adds a code when not present", () => {
    expect(toggleCode([], 7520)).toEqual([7520]);
    expect(toggleCode([7511], 7520)).toEqual([7511, 7520]);
  });

  it("removes a code when already present", () => {
    expect(toggleCode([7520], 7520)).toEqual([]);
    expect(toggleCode([7511, 7520], 7520)).toEqual([7511]);
  });

  it("spread preserves other filter fields", () => {
    const base: FilterState = { ...defaultFilters, gkat: [1020] };
    const updated: FilterState = { ...base, genh1: toggleCode(base.genh1, 7520) };
    expect(updated.gkat).toEqual([1020]);
    expect(updated.genh1).toEqual([7520]);
  });
});
