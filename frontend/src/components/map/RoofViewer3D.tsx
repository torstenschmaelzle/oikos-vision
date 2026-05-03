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

  // Stable refs so click handler and material-update effect always see current values
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

    // Apply initial selectedPartIndex highlight (may be non-null when scene rebuilds)
    const currentIdx = selectedPartIndexRef.current;
    if (currentIdx !== null) {
      meshesRef.current.forEach((mesh, i) => {
        const mat = mesh.material as THREE.MeshLambertMaterial;
        if (i === currentIdx) {
          mat.color.setHex(PART_COLOR_HIGHLIGHT);
          mat.opacity = 1.0;
          mat.emissive.setHex(0x0a5e3a);
        } else {
          mat.opacity = 0.28;
        }
      });
    }

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
