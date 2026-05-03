# Roof Detail Panel — Design Spec
Date: 2026-05-03

## Summary

When a user clicks a building card in the bottom grid, a slide-over panel appears from the right side of the screen. The map remains fully visible on the left. The panel has a sports-car spec-card aesthetic: bold address headline, accent stripe, big energy numbers, and an interactive Three.js 3D viewer showing the extruded roof polygon.

---

## Visual Design

**Layout:** Slide-over, ~400px wide, fixed to the right edge, full viewport height. Map shrinks to fill the remaining width — it does not get overlaid.

**Structure (top to bottom):**

1. **Hero** — dark background, green-to-amber gradient accent stripe at top, 3D viewer filling the area, EGID + "drag to rotate" hint overlaid.
2. **Model header** — roof type + year as small caps "model code", address as large bold headline (like a car model name), commune + canton as subtitle.
3. **Performance bar** — three equal columns: ☀ Summer kWh / ❄ Winter kWh / 📐 Area m². Large bold numbers, coloured (amber / sky / slate).
4. **Spec grid** — all GWR building fields in a 2-column key/value grid: Baujahr, Geschosse, Gebäudekategorie, Gebäudeklasse, Heizenergie, Wärmeverteilung, Dachtyp, number of parts.
5. **Roof parts list** — one row per roof part from `buildingRoofs.parts`, coloured dot matching the 3D model, part index + area estimate, summer + winter kWh per part.

**Colour palette:** matches existing app dark theme (slate-900 base). Accent: `#10b981` (emerald) → `#34d399` → `#fbbf24` (amber) gradient stripe. Text hierarchy: `#f8fafc` → `#e2e8f0` → `#94a3b8` → `#475569`.

**Animation:** panel slides in from right using Framer Motion (`x: 400 → 0`). Close button dismisses with reverse animation.

---

## 3D Viewer

**Library:** Three.js (loaded via npm, not CDN).

**Approach:**
- Parse each `buildingRoofs.parts[].geojson` polygon (WGS84 coordinates).
- Project coordinates to a local flat plane (subtract centroid, scale to metres).
- Triangulate each polygon using `earcut` (already a Three.js dep).
- Extrude to height: `building.ggesh ?? 3` floors × 3 m per floor.
- Each part gets a distinct shade of emerald (part 1 brightest, parts darker by index).
- OrbitControls: drag to rotate, scroll to zoom, auto-rotate slowly on load then stop on first interaction.
- Lighting: ambient (`#1a1a2e`) + directional from top-right (`#ffffff`, intensity 0.8).
- Camera: isometric-ish perspective, positioned to fit all parts in view on load.

**Coordinate handling:** GeoJSON uses WGS84 lon/lat. Subtract the centroid lon/lat, multiply by `cos(lat) * 111320` (lon) and `111320` (lat) to get approximate metres. Scale so the longest dimension fits ~200 units in scene space.

**Fallback:** if `buildingRoofs` has no valid geometries, show a "No 3D data available" placeholder in the hero area.

---

## Data Flow

No new API calls needed. Everything re-uses existing state:

```
user clicks BuildingCard
  → onSelect(egid) [already exists]
    → state.selectBuilding(egid)
      → sets selectedEgid
      → fetches buildingRoofs (parts + union GeoJSON)  [already exists]

RoofDetailPanel reads:
  - selectedBuilding  (from buildings.find(b => b.bdg_egid === selectedEgid))
  - buildingRoofs     (from state.buildingRoofs)
  - buildingLoading   (for skeleton state)
  - state.selectBuilding(null)  (close button)
```

---

## Components

| File | Purpose |
|------|---------|
| `frontend/src/components/map/RoofDetailPanel.tsx` | Main slide-over panel shell + all sections |
| `frontend/src/components/map/RoofViewer3D.tsx` | Three.js canvas component (isolated) |
| `frontend/src/pages/app/MapPage.tsx` | Mount panel, pass props, adjust layout when panel open |

`RoofViewer3D` is isolated so Three.js never loads until a building is selected (dynamic import or conditional render).

---

## Layout Change in MapPage

When panel is open, the top section (map + sidebar) shrinks to `calc(100vw - 400px)` width. The panel is positioned as a flex sibling, not an overlay, so the map is never covered. The buildings grid below remains visible and scrollable.

---

## Error & Loading States

- **Loading** (buildingRoofs null, buildingLoading true): skeleton pulse in hero + spec area.
- **No geometry**: 3D viewer shows placeholder message; rest of panel shows all Building fields normally.
- **Panel closed**: `selectedEgid === null` — panel unmounts entirely (Three.js context released).
