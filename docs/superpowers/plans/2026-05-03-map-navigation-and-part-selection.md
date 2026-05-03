# Map Navigation & Part Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the buildings grid with left/right arrow navigation, auto-select the best roof on Gemeinde load, fix the 3D viewer background to white, make the Dachflächen list independently scrollable and clickable, and highlight the selected part in both the 3D viewer and on the map.

**Architecture:** All selection state lives in `MapPage` and flows down as props. The buildings array is sorted by `sommer_total` descending in `useMapState` and the best is auto-selected after each `topRoofs` fetch. `selectedPartIndex` is new page-level state; it resets whenever `selectedEgid` changes, and propagates to `RoofViewer3D` (material highlight + raycaster click), `RoofDetailPanel` (row highlight + click), and `MapView` (polygon style + click).

**Tech Stack:** React 18, TypeScript, Three.js 0.184, Leaflet 1.9, Framer Motion, Tailwind CSS, Vite.

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/hooks/useMapState.ts` | Sort buildings, auto-select best after topRoofs |
| `frontend/src/pages/app/MapPage.tsx` | Remove buildings grid, add arrows overlay, add `selectedPartIndex` state + reset |
| `frontend/src/components/map/RoofViewer3D.tsx` | Light background, meshesRef, selectedPartIndex prop, raycaster click, material update effect |
| `frontend/src/components/map/RoofDetailPanel.tsx` | selectedPartIndex prop, independently scrollable parts list, clickable part rows |
| `frontend/src/components/map/MapView.tsx` | selectedPartIndex + onSelectPart props, highlighted part polygon style, click handler on parts |

---

## Task 1: Remove Buildings Grid, Fix Layout

**Files:**
- Modify: `frontend/src/pages/app/MapPage.tsx`

- [ ] **Step 1: Replace MapPage.tsx top section**

Open `frontend/src/pages/app/MapPage.tsx`. Replace the entire file with this content (removes the `<section>` buildings block, removes `ResultsList` import, changes top section from `flex-1 min-h-0` to `flex h-full`):

```tsx
import { useMapState } from "@/hooks/useMapState";
import MapView from "@/components/map/MapView";
import SelectionToolbar from "@/components/map/SelectionToolbar";
import FiltersPanel from "@/components/map/FiltersPanel";
import RoofDetailPanel from "@/components/map/RoofDetailPanel";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

export default function MapPage() {
  const state = useMapState();
  const anyLoading = state.initialLoading || state.cantonLoading || state.gemeindeLoading;

  const selectedBuilding = state.selectedEgid
    ? state.buildings.find((b) => b.bdg_egid === state.selectedEgid)
    : null;

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden bg-background flex">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-[320px] border-r border-border bg-card overflow-y-auto shrink-0 flex flex-col"
      >
        <div className="p-4 space-y-5">
          <AnimatePresence>
            {state.error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-xs border border-destructive/20"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{state.error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {state.initialLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <SelectionToolbar
                cantons={state.cantons}
                gemeinden={state.gemeinden}
                selectedCantonId={state.selectedCantonId}
                selectedBfs={state.selectedBfs}
                limit={state.limit}
                onSelectCanton={state.selectCanton}
                onSelectGemeinde={state.selectGemeinde}
                onSetLimit={state.setLimit}
                disabled={state.cantonLoading || state.gemeindeLoading}
              />

              <div className="h-px bg-border" />

              <FiltersPanel
                filters={state.filters}
                filterOptions={state.filterOptions}
                hasGemeinde={state.selectedBfs != null}
                onChange={state.setFilters}
              />
            </>
          )}
        </div>
      </motion.aside>

      {/* Map */}
      <div className="flex-1 min-w-0 p-3 relative z-0">
        <MapView
          cantonsGeo={state.cantonsGeo}
          selectedCantonGeo={state.selectedCantonGeo}
          gemeindenGeo={state.gemeindenGeo}
          selectedGemeindeGeo={state.selectedGemeindeGeo}
          buildings={state.buildings}
          buildingRoofs={state.buildingRoofs}
          selectedEgid={state.selectedEgid}
          onSelectBuilding={state.selectBuilding}
          onSelectCanton={state.selectCanton}
          onSelectGemeinde={state.selectGemeinde}
          loading={anyLoading || state.buildingLoading}
        />
      </div>

      {/* Roof detail panel */}
      <AnimatePresence>
        {state.selectedEgid && (
          <RoofDetailPanel
            building={selectedBuilding}
            buildingRoofs={state.buildingRoofs}
            buildingLoading={state.buildingLoading}
            onClose={() => state.selectBuilding(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/torstenschmaelzle/oikos-vision/frontend && npx tsc --noEmit 2>&1
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/app/MapPage.tsx
git commit -m "feat(frontend): remove buildings grid, layout is now full-height flex row"
```

---

## Task 2: Sort Buildings by Solar Yield + Auto-Select Best

**Files:**
- Modify: `frontend/src/hooks/useMapState.ts` (lines 97–115, the topRoofs effect)

Buildings come from `api.topRoofs` which may or may not return them sorted. We sort client-side so the order is guaranteed. After sorting, we immediately call `selectBuilding` with the top EGID.

Note: `selectBuilding` is defined with `useCallback` and has no dependencies that change, so it is safe to call inside this effect without adding it to the dep array.

- [ ] **Step 1: Update the topRoofs effect in useMapState.ts**

Replace the effect at lines 97–115:

```typescript
// OLD (lines 97-115):
  useEffect(() => {
    if (!selectedBfs) {
      setOverview(null);
      return;
    }
    setGemeindeLoading(true);
    api
      .topRoofs(selectedBfs, limit, filters)
      .then((r) => {
        setOverview(r);
        setError(null);
      })
      .catch((e) => setError(showError(e)))
      .finally(() => setGemeindeLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBfs, limit, gwrKey]);
```

Replace with:

```typescript
  useEffect(() => {
    if (!selectedBfs) {
      setOverview(null);
      return;
    }
    setGemeindeLoading(true);
    api
      .topRoofs(selectedBfs, limit, filters)
      .then((r) => {
        // Sort by summer solar yield descending so best roof is always first
        const sorted = [...(r.buildings ?? [])].sort(
          (a, b) => (b.sommer_total ?? 0) - (a.sommer_total ?? 0)
        );
        const sortedResponse = { ...r, buildings: sorted };
        setOverview(sortedResponse);
        setError(null);
        // Auto-select the best building so the detail panel opens immediately
        if (sorted.length > 0) {
          selectBuilding(sorted[0].bdg_egid);
        }
      })
      .catch((e) => setError(showError(e)))
      .finally(() => setGemeindeLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBfs, limit, gwrKey]);
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/torstenschmaelzle/oikos-vision/frontend && npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useMapState.ts
git commit -m "feat(frontend): sort buildings by sommer_total, auto-select best roof on Gemeinde load"
```

---

## Task 3: Prev / Next Arrow Navigation

**Files:**
- Modify: `frontend/src/pages/app/MapPage.tsx`

The arrows overlay the map at the bottom-center. They show `currentIndex + 1 / total` and disable at the boundaries. Clicking navigates by calling `state.selectBuilding(nextEgid)`.

- [ ] **Step 1: Replace MapPage.tsx with arrows added**

Replace the full file (adds ChevronLeft/ChevronRight import, currentIndex computation, goToPrev/goToNext, and arrow overlay inside the map div):

```tsx
import { useMapState } from "@/hooks/useMapState";
import MapView from "@/components/map/MapView";
import SelectionToolbar from "@/components/map/SelectionToolbar";
import FiltersPanel from "@/components/map/FiltersPanel";
import RoofDetailPanel from "@/components/map/RoofDetailPanel";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

export default function MapPage() {
  const state = useMapState();
  const anyLoading = state.initialLoading || state.cantonLoading || state.gemeindeLoading;

  const selectedBuilding = state.selectedEgid
    ? state.buildings.find((b) => b.bdg_egid === state.selectedEgid)
    : null;

  // Arrow navigation — buildings are already sorted by sommer_total desc
  const currentIndex = state.selectedEgid
    ? state.buildings.findIndex((b) => b.bdg_egid === state.selectedEgid)
    : -1;

  const goToPrev = () => {
    if (currentIndex > 0) state.selectBuilding(state.buildings[currentIndex - 1].bdg_egid);
  };
  const goToNext = () => {
    if (currentIndex < state.buildings.length - 1)
      state.selectBuilding(state.buildings[currentIndex + 1].bdg_egid);
  };

  const showArrows = state.buildings.length > 1 && state.selectedBfs !== null;

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden bg-background flex">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-[320px] border-r border-border bg-card overflow-y-auto shrink-0 flex flex-col"
      >
        <div className="p-4 space-y-5">
          <AnimatePresence>
            {state.error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-xs border border-destructive/20"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{state.error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {state.initialLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <SelectionToolbar
                cantons={state.cantons}
                gemeinden={state.gemeinden}
                selectedCantonId={state.selectedCantonId}
                selectedBfs={state.selectedBfs}
                limit={state.limit}
                onSelectCanton={state.selectCanton}
                onSelectGemeinde={state.selectGemeinde}
                onSetLimit={state.setLimit}
                disabled={state.cantonLoading || state.gemeindeLoading}
              />

              <div className="h-px bg-border" />

              <FiltersPanel
                filters={state.filters}
                filterOptions={state.filterOptions}
                hasGemeinde={state.selectedBfs != null}
                onChange={state.setFilters}
              />
            </>
          )}
        </div>
      </motion.aside>

      {/* Map + arrow overlay */}
      <div className="flex-1 min-w-0 p-3 relative z-0">
        <MapView
          cantonsGeo={state.cantonsGeo}
          selectedCantonGeo={state.selectedCantonGeo}
          gemeindenGeo={state.gemeindenGeo}
          selectedGemeindeGeo={state.selectedGemeindeGeo}
          buildings={state.buildings}
          buildingRoofs={state.buildingRoofs}
          selectedEgid={state.selectedEgid}
          onSelectBuilding={state.selectBuilding}
          onSelectCanton={state.selectCanton}
          onSelectGemeinde={state.selectGemeinde}
          loading={anyLoading || state.buildingLoading}
        />

        {/* Prev / Next arrows */}
        <AnimatePresence>
          {showArrows && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2"
            >
              <button
                onClick={goToPrev}
                disabled={currentIndex <= 0 || state.buildingLoading}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border shadow-md text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 rounded-full bg-card border border-border shadow-md text-xs font-medium text-foreground tabular-nums">
                {currentIndex >= 0 ? currentIndex + 1 : "—"} / {state.buildings.length}
              </span>
              <button
                onClick={goToNext}
                disabled={currentIndex >= state.buildings.length - 1 || state.buildingLoading}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border shadow-md text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Roof detail panel */}
      <AnimatePresence>
        {state.selectedEgid && (
          <RoofDetailPanel
            building={selectedBuilding}
            buildingRoofs={state.buildingRoofs}
            buildingLoading={state.buildingLoading}
            onClose={() => state.selectBuilding(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/torstenschmaelzle/oikos-vision/frontend && npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/app/MapPage.tsx
git commit -m "feat(frontend): add prev/next arrow navigation between buildings on map"
```

---

## Task 4: RoofViewer3D — Light Background + Part Click/Highlight

**Files:**
- Modify: `frontend/src/components/map/RoofViewer3D.tsx`

Key changes:
- `scene.background = new THREE.Color(0xf1f5f1)` (matches `--card` in light theme)
- Remove dark fog, add brighter ambient + directional light for light bg
- Edge colour changed to `0x059669` (visible on light)
- New props: `selectedPartIndex: number | null`, `onSelectPart: (index: number | null) => void`
- `meshesRef` stores all part meshes for material updates without rebuilding scene
- Second `useEffect` (dep: `[selectedPartIndex]`) updates materials without touching the Three.js scene
- Raycaster `click` listener on canvas; toggles selectedPartIndex

- [ ] **Step 1: Replace RoofViewer3D.tsx**

```tsx
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoofPart } from "@/lib/types";

interface Props {
  parts: RoofPart[];
  floors: number;
  selectedPartIndex: number | null;
  onSelectPart: (index: number | null) => void;
}

const PART_COLORS = [0x10b981, 0x059669, 0x047857, 0x065f46, 0x064e3b];
const PART_COLOR_HIGHLIGHT = 0x34d399;
const M_PER_FLOOR = 3;

function projectCoords(
  ring: number[][],
  centroidLon: number,
  centroidLat: number
): [number, number][] {
  const cosLat = Math.cos((centroidLat * Math.PI) / 180);
  return ring.map(([lon, lat]) => [
    (lon - centroidLon) * cosLat * 111320,
    (lat - centroidLat) * 111320,
  ]);
}

function computeCentroid(parts: RoofPart[]): [number, number] {
  let sumLon = 0, sumLat = 0, count = 0;
  for (const p of parts) {
    if (!p.geojson) continue;
    const coords: number[][] = (p.geojson.coordinates as number[][][])[0];
    for (const [lon, lat] of coords) {
      sumLon += lon; sumLat += lat; count++;
    }
  }
  return count > 0 ? [sumLon / count, sumLat / count] : [0, 0];
}

export default function RoofViewer3D({ parts, floors, selectedPartIndex, onSelectPart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);

  // Keep stable refs so the click handler and material-update effect always
  // see the current values without being stale closures.
  const selectedPartIndexRef = useRef(selectedPartIndex);
  const onSelectPartRef = useRef(onSelectPart);
  useEffect(() => { selectedPartIndexRef.current = selectedPartIndex; }, [selectedPartIndex]);
  useEffect(() => { onSelectPartRef.current = onSelectPart; }, [onSelectPart]);

  // ── Material highlight effect ───────────────────────────────────────────
  // Runs whenever selectedPartIndex changes WITHOUT rebuilding the scene.
  useEffect(() => {
    meshesRef.current.forEach((mesh, i) => {
      const mat = mesh.material as THREE.MeshLambertMaterial;
      if (selectedPartIndex === null) {
        mat.color.setHex(PART_COLORS[i % PART_COLORS.length]);
        mat.opacity = 0.88;
        mat.emissive.setHex(0x000000);
      } else if (i === selectedPartIndex) {
        mat.color.setHex(PART_COLOR_HIGHLIGHT);
        mat.opacity = 1.0;
        mat.emissive.setHex(0x0a5e3a);
      } else {
        mat.color.setHex(PART_COLORS[i % PART_COLORS.length]);
        mat.opacity = 0.28;
        mat.emissive.setHex(0x000000);
      }
    });
  }, [selectedPartIndex]);

  // ── Scene setup (rebuilds only when parts/floors change) ───────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f1); // light, matches app card background

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = "pointer";

    // Lighting tuned for light background
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0x334155, 1.4);
    dirLight.position.set(2, 3, 2);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x86efac, 0.4);
    fillLight.position.set(-1, 0, -1);
    scene.add(fillLight);

    const extrudeHeight = (floors > 0 ? floors : 3) * M_PER_FLOOR;
    const [centLon, centLat] = computeCentroid(parts);
    const group = new THREE.Group();
    meshesRef.current = [];

    parts.forEach((part, i) => {
      if (!part.geojson) return;
      const rings = part.geojson.coordinates as number[][][];
      const exterior = projectCoords(rings[0], centLon, centLat);

      const shape = new THREE.Shape();
      shape.moveTo(exterior[0][0], exterior[0][1]);
      for (let j = 1; j < exterior.length; j++) shape.lineTo(exterior[j][0], exterior[j][1]);
      shape.closePath();

      for (let r = 1; r < rings.length; r++) {
        const hole = new THREE.Path();
        const hCoords = projectCoords(rings[r], centLon, centLat);
        hole.moveTo(hCoords[0][0], hCoords[0][1]);
        for (let j = 1; j < hCoords.length; j++) hole.lineTo(hCoords[j][0], hCoords[j][1]);
        hole.closePath();
        shape.holes.push(hole);
      }

      const geometry = new THREE.ExtrudeGeometry(shape, { depth: extrudeHeight, bevelEnabled: false });
      const material = new THREE.MeshLambertMaterial({
        color: PART_COLORS[i % PART_COLORS.length],
        transparent: true,
        opacity: 0.88,
      });
      const mesh = new THREE.Mesh(geometry, material);
      meshesRef.current.push(mesh);
      group.add(mesh);

      const edges = new THREE.EdgesGeometry(geometry);
      group.add(
        new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x059669, opacity: 0.5, transparent: true })
        )
      );
    });

    group.rotation.x = -Math.PI / 2;
    scene.add(group);

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.2;
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.8, center.z + dist * 0.7);
    camera.lookAt(center);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = maxDim * 0.5;
    controls.maxDistance = maxDim * 6;
    controls.addEventListener("start", () => { controls.autoRotate = false; });
    controls.update();

    // Apply initial selectedPartIndex highlight (may be non-null if panel already had a selection)
    const currentIdx = selectedPartIndexRef.current;
    meshesRef.current.forEach((mesh, i) => {
      const mat = mesh.material as THREE.MeshLambertMaterial;
      if (currentIdx !== null && i !== currentIdx) {
        mat.opacity = 0.28;
      }
    });

    // Raycaster for part clicks
    const raycaster = new THREE.Raycaster();
    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(meshesRef.current);
      if (hits.length > 0) {
        const clickedIdx = meshesRef.current.indexOf(hits[0].object as THREE.Mesh);
        if (clickedIdx !== -1) {
          const next = clickedIdx === selectedPartIndexRef.current ? null : clickedIdx;
          onSelectPartRef.current(next);
        }
      }
    };
    renderer.domElement.addEventListener("click", onClick);

    let rafId: number;
    function animate() {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    function onResize() {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("click", onClick);
      renderer.dispose();
      meshesRef.current = [];
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [parts, floors]);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/torstenschmaelzle/oikos-vision/frontend && npx tsc --noEmit 2>&1
```

Expected: errors about missing props on `RoofViewer3D` (used inside `RoofDetailPanel` which hasn't been updated yet). That is expected — we fix it in Task 5.

- [ ] **Step 3: Note the errors and move directly to Task 5 without committing**

The type errors are expected because `RoofDetailPanel` still calls `RoofViewer3D` without the new required props. Fix this in Task 5 before committing.

---

## Task 5: RoofDetailPanel — Scrollable Parts List + Clickable Rows

**Files:**
- Modify: `frontend/src/components/map/RoofDetailPanel.tsx`

Key changes:
- New props: `selectedPartIndex: number | null`, `onSelectPart: (index: number | null) => void`
- These are passed into `RoofViewer3D`
- Spec body restructured: GWR section is a fixed-height `shrink-0` block; parts section is a `flex-col flex-1 min-h-0` with its own `overflow-y-auto` list
- Part rows become `<button>` elements with ring highlight when selected

- [ ] **Step 1: Replace RoofDetailPanel.tsx**

```tsx
import { motion } from "framer-motion";
import { X, Sun, Snowflake, Maximize2, Layers } from "lucide-react";
import { Building, BuildingRoofsResponse } from "@/lib/types";
import RoofViewer3D from "./RoofViewer3D";

interface Props {
  building: Building | null;
  buildingRoofs: BuildingRoofsResponse | null;
  buildingLoading: boolean;
  onClose: () => void;
  selectedPartIndex: number | null;
  onSelectPart: (index: number | null) => void;
}

const PART_COLORS = ["#10b981", "#059669", "#047857", "#065f46", "#064e3b"];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("de-CH");
}

function SpecRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between items-baseline px-2 py-[5px] rounded bg-muted">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[10px] text-foreground font-semibold text-right truncate max-w-[55%]">
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function RoofDetailPanel({
  building,
  buildingRoofs,
  buildingLoading,
  onClose,
  selectedPartIndex,
  onSelectPart,
}: Props) {
  const parts = buildingRoofs?.parts ?? [];
  const hasGeometry = parts.some((p) => p.geojson != null);
  const floors = building?.ggesh ?? 3;

  const address = [building?.stn_label, building?.adr_number].filter(Boolean).join(" ");
  const modelCode = [building?.gkat_label, building?.sb_objektart_label, building?.gbauj]
    .filter(Boolean)
    .join(" · ");
  const subtitle = [
    building?.zip_label,
    building?.com_name,
    building?.com_canton ? `(${building.com_canton})` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 35 }}
      className="w-[400px] shrink-0 flex flex-col h-full bg-card border-l border-border overflow-hidden"
    >
      {/* Accent stripe */}
      <div className="h-[3px] bg-gradient-to-r from-primary via-emerald-400 to-amber-400 shrink-0" />

      {/* Hero */}
      <div className="relative h-[220px] bg-muted shrink-0 overflow-hidden">
        <span className="absolute top-3 left-4 text-[9px] font-bold tracking-[0.15em] text-primary uppercase z-10">
          ☀ Solar Potential · EGID {building?.bdg_egid ?? "…"}
        </span>
        <button
          onClick={onClose}
          className="absolute top-2.5 right-3 z-10 w-[22px] h-[22px] flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
        </button>

        {buildingLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-32 rounded bg-background animate-pulse" />
          </div>
        ) : hasGeometry ? (
          <div className="absolute inset-0 pt-8">
            <RoofViewer3D
              parts={parts}
              floors={floors}
              selectedPartIndex={selectedPartIndex}
              onSelectPart={onSelectPart}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">No 3D data available</span>
          </div>
        )}

        {hasGeometry && !buildingLoading && (
          <span className="absolute bottom-2 right-3 text-[8px] tracking-wide text-muted-foreground/50 z-10 pointer-events-none">
            DRAG TO ROTATE · CLICK PART TO SELECT
          </span>
        )}
      </div>

      {/* Model header */}
      {buildingLoading ? (
        <div className="px-4 py-3.5 border-b border-border space-y-2 shrink-0">
          <div className="h-2.5 w-28 rounded bg-muted animate-pulse" />
          <div className="h-5 w-44 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-32 rounded bg-muted animate-pulse" />
        </div>
      ) : (
        <div className="px-4 py-3.5 border-b border-border shrink-0">
          <div className="text-[9px] font-bold tracking-[0.2em] text-primary uppercase mb-[3px]">
            {modelCode || "—"}
          </div>
          <div className="font-display text-xl font-bold text-foreground tracking-tight leading-tight">
            {address || `EGID ${building?.bdg_egid}`}
          </div>
          <div className="text-xs text-muted-foreground mt-[3px]">{subtitle || "—"}</div>
        </div>
      )}

      {/* Performance bar */}
      {buildingLoading ? (
        <div className="grid grid-cols-3 gap-px bg-border border-b border-border shrink-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-card p-2.5 space-y-2">
              <div className="h-2 w-10 rounded bg-muted animate-pulse" />
              <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-border border-b border-border shrink-0">
          <div className="bg-card p-[10px]">
            <div className="flex items-center gap-1 mb-1">
              <Sun className="w-3 h-3 text-amber-500" />
              <span className="text-[8px] text-muted-foreground uppercase tracking-wide">Sommer</span>
            </div>
            <div className="text-lg font-bold leading-none text-amber-500">{fmt(building?.sommer_total)}</div>
            <div className="text-[8px] text-muted-foreground mt-[2px]">kWh / Jahr</div>
          </div>
          <div className="bg-card p-[10px]">
            <div className="flex items-center gap-1 mb-1">
              <Snowflake className="w-3 h-3 text-sky-500" />
              <span className="text-[8px] text-muted-foreground uppercase tracking-wide">Winter</span>
            </div>
            <div className="text-lg font-bold leading-none text-sky-500">{fmt(building?.winter_total)}</div>
            <div className="text-[8px] text-muted-foreground mt-[2px]">kWh / Jahr</div>
          </div>
          <div className="bg-card p-[10px]">
            <div className="flex items-center gap-1 mb-1">
              <Maximize2 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[8px] text-muted-foreground uppercase tracking-wide">Fläche</span>
            </div>
            <div className="text-lg font-bold leading-none text-foreground">{fmt(building?.roof_area_union_m2)}</div>
            <div className="text-[8px] text-muted-foreground mt-[2px]">m² gesamt</div>
          </div>
        </div>
      )}

      {/* Spec body — GWR fixed, parts independently scrollable */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {buildingLoading ? (
          <div className="p-4 space-y-[3px] overflow-y-auto">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-7 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* GWR spec — always visible, not independently scrollable */}
            <div className="p-3 border-b border-border shrink-0">
              <div className="flex items-center gap-1.5 mb-2">
                <Layers className="w-3 h-3 text-muted-foreground" />
                <span className="text-[9px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
                  Gebäude · GWR
                </span>
              </div>
              <div className="grid grid-cols-2 gap-[3px]">
                <SpecRow label="Baujahr" value={building?.gbauj} />
                <SpecRow label="Geschosse" value={building?.ggesh} />
                <SpecRow label="Kategorie" value={building?.gkat_label} />
                <SpecRow label="Klasse" value={building?.gklas_label} />
                <SpecRow label="Heizenergie" value={building?.genh1_label} />
                <SpecRow label="Wärmeverteilung" value={building?.gwaerzh1_label} />
                <SpecRow label="Dachtyp" value={building?.sb_objektart_label} />
                <SpecRow
                  label="Dachflächen"
                  value={
                    buildingRoofs
                      ? `${buildingRoofs.parts_count} Teil${buildingRoofs.parts_count !== 1 ? "e" : ""}`
                      : undefined
                  }
                />
              </div>
            </div>

            {/* Parts list — independently scrollable */}
            {parts.length > 0 && (
              <div className="flex flex-col flex-1 min-h-0 p-3">
                <div className="text-[9px] font-bold tracking-[0.18em] text-muted-foreground uppercase mb-2 shrink-0">
                  Dachflächen · Einzelübersicht
                </div>
                <div className="flex-1 overflow-y-auto space-y-[3px] pr-0.5">
                  {parts.map((part, i) => {
                    const isSelected = selectedPartIndex === i;
                    return (
                      <button
                        key={part.objectid}
                        onClick={() => onSelectPart(isSelected ? null : i)}
                        className={`flex items-center gap-2.5 px-2 py-[7px] rounded w-full text-left transition-colors ${
                          isSelected
                            ? "bg-primary/10 ring-1 ring-primary/30"
                            : "bg-muted hover:bg-accent"
                        }`}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: PART_COLORS[i % PART_COLORS.length] }}
                        />
                        <span className="text-xs text-muted-foreground flex-1">Teil {i + 1}</span>
                        <div className="text-right">
                          <div className="text-[10px] text-amber-500 flex items-center gap-1 justify-end">
                            <Sun className="w-2.5 h-2.5" /> {fmt(part.summer)} kWh
                          </div>
                          <div className="text-[10px] text-sky-500 flex items-center gap-1 justify-end">
                            <Snowflake className="w-2.5 h-2.5" /> {fmt(part.winter)} kWh
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/torstenschmaelzle/oikos-vision/frontend && npx tsc --noEmit 2>&1
```

Expected: errors about `RoofDetailPanel` missing `selectedPartIndex`/`onSelectPart` at its call site in `MapPage.tsx`. That is expected — we wire MapPage in Task 6.

- [ ] **Step 3: Do not commit yet — proceed to Task 6**

---

## Task 6: MapView Part Highlight + MapPage Wiring

**Files:**
- Modify: `frontend/src/components/map/MapView.tsx`
- Modify: `frontend/src/pages/app/MapPage.tsx`

### 6a — MapView: add selectedPartIndex + part click + highlight style

- [ ] **Step 1: Add new props and style to MapView.tsx**

At the top of `MapView.tsx`, after the existing style constants (around line 58–66), add a new style for the highlighted part:

```typescript
const roofPartSelectedStyle: L.PathOptions = {
  color: "hsl(158,40%,28%)", weight: 3, fillOpacity: 0.55, fillColor: "hsl(158,32%,40%)",
};
```

- [ ] **Step 2: Update the Props interface in MapView.tsx**

Replace the existing `interface Props` block:

```typescript
interface Props {
  cantonsGeo: FeatureCollection<Geometry, CantonGeoProperties> | null;
  selectedCantonGeo: CantonGeoDetail | null;
  gemeindenGeo: FeatureCollection<Geometry, GemeindeGeoProperties> | null;
  selectedGemeindeGeo: GemeindeGeoDetail | null;
  buildings: Building[];
  buildingRoofs: BuildingRoofsResponse | null;
  selectedEgid: number | null;
  selectedPartIndex: number | null;
  onSelectBuilding: (egid: number) => void;
  onSelectCanton: (id: number) => void;
  onSelectGemeinde: (bfs: number) => void;
  onSelectPart: (index: number | null) => void;
  loading: boolean;
}
```

- [ ] **Step 3: Update the destructured props in the function signature**

Replace:
```typescript
export default function MapView({
  cantonsGeo,
  selectedCantonGeo,
  gemeindenGeo,
  selectedGemeindeGeo,
  buildings,
  buildingRoofs,
  selectedEgid,
  onSelectBuilding,
  onSelectCanton,
  onSelectGemeinde,
  loading,
}: Props) {
```

With:
```typescript
export default function MapView({
  cantonsGeo,
  selectedCantonGeo,
  gemeindenGeo,
  selectedGemeindeGeo,
  buildings,
  buildingRoofs,
  selectedEgid,
  selectedPartIndex,
  onSelectBuilding,
  onSelectCanton,
  onSelectGemeinde,
  onSelectPart,
  loading,
}: Props) {
```

- [ ] **Step 4: Update the roof visualization block to highlight selected part**

Find the roof visualization section (around line 259–285). Replace it entirely:

```typescript
    // ── Roof visualization ────────────────────────────────────────────────
    if (buildingRoofs) {
      const roofLayerGroup = L.featureGroup();
      buildingRoofs.parts.forEach((p, partIdx) => {
        if (p.geojson) {
          const isPartSelected = partIdx === selectedPartIndex;
          const style = isPartSelected ? roofPartSelectedStyle : roofPartStyle;
          const partLayer = L.geoJSON(
            { type: "Feature", geometry: p.geojson, properties: {} } as any,
            { style }
          ).addTo(roofLayerGroup);
          partLayer.on({
            mouseover: (e: any) => {
              if (!isPartSelected) (e.target as L.Path).setStyle(roofPartHover);
            },
            mouseout: (e: any) => {
              (e.target as L.Path).setStyle(isPartSelected ? roofPartSelectedStyle : roofPartStyle);
            },
            click: () => {
              onSelectPart(isPartSelected ? null : partIdx);
            },
          });
        }
      });
      if (buildingRoofs.union) {
        L.geoJSON(
          { type: "Feature", geometry: buildingRoofs.union, properties: {} } as any,
          { style: roofUnionStyle }
        ).addTo(roofLayerGroup);
      }
      roofLayerGroup.addTo(layers);
      try {
        const roofBounds = roofLayerGroup.getBounds();
        if (roofBounds.isValid()) {
          if (isSwitchingBuildings) {
            map.flyTo(roofBounds.getCenter(), Math.max(map.getZoom(), 17), { duration: 1.4, easeLinearity: 0.4 });
          } else {
            map.flyToBounds(roofBounds, { padding: [40, 40], duration: 1.8, maxZoom: 19 });
          }
        }
      } catch {}
    }
```

- [ ] **Step 5: Add `selectedPartIndex` and `onSelectPart` to the useEffect dependency array**

Find the closing of the large useEffect (around line 286):

```typescript
  }, [cantonsGeo, selectedCantonGeo, gemeindenGeo, selectedGemeindeGeo, buildings, buildingRoofs, selectedEgid, onSelectBuilding]);
```

Replace with:

```typescript
  }, [cantonsGeo, selectedCantonGeo, gemeindenGeo, selectedGemeindeGeo, buildings, buildingRoofs, selectedEgid, selectedPartIndex, onSelectBuilding, onSelectPart]);
```

### 6b — MapPage: add selectedPartIndex state + wire all new props

- [ ] **Step 6: Replace MapPage.tsx with the fully wired version**

```tsx
import { useState, useEffect } from "react";
import { useMapState } from "@/hooks/useMapState";
import MapView from "@/components/map/MapView";
import SelectionToolbar from "@/components/map/SelectionToolbar";
import FiltersPanel from "@/components/map/FiltersPanel";
import RoofDetailPanel from "@/components/map/RoofDetailPanel";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

export default function MapPage() {
  const state = useMapState();
  const anyLoading = state.initialLoading || state.cantonLoading || state.gemeindeLoading;

  const selectedBuilding = state.selectedEgid
    ? state.buildings.find((b) => b.bdg_egid === state.selectedEgid)
    : null;

  // Arrow navigation — buildings are sorted by sommer_total desc in useMapState
  const currentIndex = state.selectedEgid
    ? state.buildings.findIndex((b) => b.bdg_egid === state.selectedEgid)
    : -1;

  const goToPrev = () => {
    if (currentIndex > 0) state.selectBuilding(state.buildings[currentIndex - 1].bdg_egid);
  };
  const goToNext = () => {
    if (currentIndex < state.buildings.length - 1)
      state.selectBuilding(state.buildings[currentIndex + 1].bdg_egid);
  };

  const showArrows = state.buildings.length > 1 && state.selectedBfs !== null;

  // Part selection — resets whenever the selected building changes
  const [selectedPartIndex, setSelectedPartIndex] = useState<number | null>(null);
  useEffect(() => {
    setSelectedPartIndex(null);
  }, [state.selectedEgid]);

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden bg-background flex">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-[320px] border-r border-border bg-card overflow-y-auto shrink-0 flex flex-col"
      >
        <div className="p-4 space-y-5">
          <AnimatePresence>
            {state.error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-xs border border-destructive/20"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{state.error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {state.initialLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <SelectionToolbar
                cantons={state.cantons}
                gemeinden={state.gemeinden}
                selectedCantonId={state.selectedCantonId}
                selectedBfs={state.selectedBfs}
                limit={state.limit}
                onSelectCanton={state.selectCanton}
                onSelectGemeinde={state.selectGemeinde}
                onSetLimit={state.setLimit}
                disabled={state.cantonLoading || state.gemeindeLoading}
              />

              <div className="h-px bg-border" />

              <FiltersPanel
                filters={state.filters}
                filterOptions={state.filterOptions}
                hasGemeinde={state.selectedBfs != null}
                onChange={state.setFilters}
              />
            </>
          )}
        </div>
      </motion.aside>

      {/* Map + arrow overlay */}
      <div className="flex-1 min-w-0 p-3 relative z-0">
        <MapView
          cantonsGeo={state.cantonsGeo}
          selectedCantonGeo={state.selectedCantonGeo}
          gemeindenGeo={state.gemeindenGeo}
          selectedGemeindeGeo={state.selectedGemeindeGeo}
          buildings={state.buildings}
          buildingRoofs={state.buildingRoofs}
          selectedEgid={state.selectedEgid}
          selectedPartIndex={selectedPartIndex}
          onSelectBuilding={state.selectBuilding}
          onSelectCanton={state.selectCanton}
          onSelectGemeinde={state.selectGemeinde}
          onSelectPart={setSelectedPartIndex}
          loading={anyLoading || state.buildingLoading}
        />

        {/* Prev / Next navigation */}
        <AnimatePresence>
          {showArrows && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2"
            >
              <button
                onClick={goToPrev}
                disabled={currentIndex <= 0 || state.buildingLoading}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border shadow-md text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 rounded-full bg-card border border-border shadow-md text-xs font-medium text-foreground tabular-nums">
                {currentIndex >= 0 ? currentIndex + 1 : "—"} / {state.buildings.length}
              </span>
              <button
                onClick={goToNext}
                disabled={currentIndex >= state.buildings.length - 1 || state.buildingLoading}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border shadow-md text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Roof detail panel */}
      <AnimatePresence>
        {state.selectedEgid && (
          <RoofDetailPanel
            building={selectedBuilding}
            buildingRoofs={state.buildingRoofs}
            buildingLoading={state.buildingLoading}
            onClose={() => state.selectBuilding(null)}
            selectedPartIndex={selectedPartIndex}
            onSelectPart={setSelectedPartIndex}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 7: Type-check everything**

```bash
cd /Users/torstenschmaelzle/oikos-vision/frontend && npx tsc --noEmit 2>&1
```

Expected: no output (clean).

- [ ] **Step 8: Full build**

```bash
cd /Users/torstenschmaelzle/oikos-vision/frontend && npm run build 2>&1 | tail -10
```

Expected: `✓ built in Xs` with no errors (only the pre-existing chunk size warning is acceptable).

- [ ] **Step 9: Commit all changes**

```bash
cd /Users/torstenschmaelzle/oikos-vision && \
git add \
  frontend/src/components/map/RoofViewer3D.tsx \
  frontend/src/components/map/RoofDetailPanel.tsx \
  frontend/src/components/map/MapView.tsx \
  frontend/src/pages/app/MapPage.tsx && \
git commit -m "feat(frontend): clickable roof parts with 3D + map highlight, selectedPartIndex wired"
```

- [ ] **Step 10: Push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Buildings grid removed (Task 1)
- ✅ Sort by best stats (sommer_total desc) (Task 2)
- ✅ Auto-select best roof on Gemeinde load (Task 2)
- ✅ Left/right arrow navigation (Task 3)
- ✅ Counter shows current position (Task 3)
- ✅ 3D viewer background white/light (Task 4)
- ✅ Dachflächen list independently scrollable (Task 5)
- ✅ Dachflächen clickable with highlight in 3D (Task 4 raycaster + Task 5 material update)
- ✅ Dachflächen clickable with highlight on map (Task 6)
- ✅ Selecting same part again deselects it (toggle in all three click handlers)
- ✅ selectedPartIndex resets on building change (Task 6, MapPage useEffect)

**Type consistency:**
- `selectedPartIndex: number | null` — used consistently across RoofViewer3D, RoofDetailPanel, MapView, MapPage
- `onSelectPart: (index: number | null) => void` — consistent signature in all interfaces
- `setSelectedPartIndex` (React dispatch) is passed directly as `onSelectPart` everywhere — callers pass the already-toggled value
