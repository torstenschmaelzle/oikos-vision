import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  FeatureCollection,
  Geometry,
  CantonGeoProperties,
  GemeindeGeoProperties,
  CantonGeoDetail,
  GemeindeGeoDetail,
  Building,
  BuildingRoofsResponse,
} from "@/lib/types";

import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl: iconRetina, shadowUrl: iconShadow });

const SWITZERLAND_BOUNDS = L.latLngBounds([45.75, 5.9], [47.85, 10.65]);

interface Props {
  cantonsGeo: FeatureCollection<Geometry, CantonGeoProperties> | null;
  selectedCantonGeo: CantonGeoDetail | null;
  gemeindenGeo: FeatureCollection<Geometry, GemeindeGeoProperties> | null;
  selectedGemeindeGeo: GemeindeGeoDetail | null;
  buildings: Building[];
  buildingRoofs: BuildingRoofsResponse | null;
  selectedEgid: number | null;
  onSelectBuilding: (egid: number) => void;
  onSelectCanton: (id: number) => void;
  onSelectGemeinde: (bfs: number) => void;
  loading: boolean;
}

function createTooltipDiv() {
  const div = document.createElement("div");
  div.className = "map-feature-tooltip";
  div.style.cssText =
    "position:absolute;z-index:1000;pointer-events:none;opacity:0;transition:opacity 0.15s;padding:6px 12px;border-radius:6px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;line-height:1.5;white-space:nowrap;background:hsl(0 0% 100% / 0.96);border:1px solid hsl(215 12% 85%);box-shadow:0 2px 8px -2px hsl(220 14% 14% / 0.1);color:hsl(220 14% 14%)";
  document.body.appendChild(div);
  return div;
}

const featureStyle: L.PathOptions = {
  color: "hsl(160,28%,38%)", weight: 2, fillOpacity: 0.05, fillColor: "hsl(160,24%,45%)",
};
const featureHover: L.PathOptions = {
  weight: 2.5, fillOpacity: 0.18, color: "hsl(160,32%,28%)", fillColor: "hsl(160,28%,40%)",
};
const selectedCantonStyle: L.PathOptions = {
  color: "hsl(160,30%,35%)", weight: 2.5, fillOpacity: 0.08, fillColor: "hsl(160,24%,45%)",
};
const gemeindeBoundaryStyle: L.PathOptions = {
  color: "hsl(160,30%,35%)", weight: 2.5, fillOpacity: 0.06, fillColor: "hsl(160,24%,45%)",
};
const roofPartStyle: L.PathOptions = {
  color: "hsl(160,30%,32%)", weight: 2, fillOpacity: 0.2, fillColor: "hsl(160,28%,40%)",
};
const roofPartHover: L.PathOptions = {
  fillOpacity: 0.35, weight: 2.5, color: "hsl(160,35%,28%)",
};
const roofUnionStyle: L.PathOptions = {
  color: "hsl(160,32%,36%)", weight: 2, fillOpacity: 0.06, fillColor: "hsl(160,28%,45%)", dashArray: "6 4",
};

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup>(L.layerGroup());
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const prevCantonGeoRef = useRef<CantonGeoDetail | null>(null);
  const prevGemeindeGeoRef = useRef<GemeindeGeoDetail | null>(null);
  const prevEgidRef = useRef<number | null>(null);
  // Set to true when a map click already triggered a zoom — prevents the effect from double-animating
  const mapClickZoomedRef = useRef(false);

  const onSelectCantonRef = useRef(onSelectCanton);
  const onSelectGemeindeRef = useRef(onSelectGemeinde);
  useEffect(() => { onSelectCantonRef.current = onSelectCanton; }, [onSelectCanton]);
  useEffect(() => { onSelectGemeindeRef.current = onSelectGemeinde; }, [onSelectGemeinde]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([46.8, 8.2], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    layersRef.current.addTo(map);
    mapRef.current = map;
    tooltipRef.current = createTooltipDiv();
    return () => {
      map.remove();
      mapRef.current = null;
      if (tooltipRef.current) {
        document.body.removeChild(tooltipRef.current);
        tooltipRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prevCantonGeo = prevCantonGeoRef.current;
    const prevGemeindeGeo = prevGemeindeGeoRef.current;
    const prevEgid = prevEgidRef.current;
    const clickAlreadyZoomed = mapClickZoomedRef.current;

    prevCantonGeoRef.current = selectedCantonGeo;
    prevGemeindeGeoRef.current = selectedGemeindeGeo;
    prevEgidRef.current = selectedEgid;
    mapClickZoomedRef.current = false;

    const cantonJustSelected = selectedCantonGeo !== null && selectedCantonGeo !== prevCantonGeo;
    const cantonJustDeselected = prevCantonGeo !== null && selectedCantonGeo === null;
    const gemeindeJustSelected = selectedGemeindeGeo !== null && selectedGemeindeGeo !== prevGemeindeGeo;
    const gemeindeJustDeselected = prevGemeindeGeo !== null && selectedGemeindeGeo === null && selectedCantonGeo !== null;
    const isSwitchingBuildings = prevEgid !== null && prevEgid !== selectedEgid && selectedEgid !== null;

    const layers = layersRef.current;
    layers.clearLayers();
    const tip = tooltipRef.current;

    const showTip = (e: L.LeafletMouseEvent, html: string) => {
      if (!tip) return;
      tip.innerHTML = html;
      tip.style.opacity = "1";
      tip.style.left = e.originalEvent.pageX + 14 + "px";
      tip.style.top = e.originalEvent.pageY - 10 + "px";
    };
    const moveTip = (e: L.LeafletMouseEvent) => {
      if (!tip) return;
      tip.style.left = e.originalEvent.pageX + 14 + "px";
      tip.style.top = e.originalEvent.pageY - 10 + "px";
    };
    const hideTip = () => {
      if (tip) tip.style.opacity = "0";
    };

    // ── All-cantons overview ──────────────────────────────────────────────
    if (!selectedCantonGeo && cantonsGeo) {
      L.geoJSON(cantonsGeo as any, {
        style: featureStyle,
        onEachFeature: (feature, layer) => {
          const p = feature.properties as CantonGeoProperties;
          const name = (p.name ?? "").replace(/\s+CH$/i, "").replace(/\s*\([A-Z]{2}\)\s*$/, "").trim();
          layer.on({
            mouseover: (e: any) => { (e.target as L.Path).setStyle(featureHover); showTip(e, `<strong>${name}</strong>`); },
            mousemove: moveTip,
            mouseout: (e: any) => { (e.target as L.Path).setStyle(featureStyle); hideTip(); },
            click: (e: any) => {
              hideTip();
              // Zoom immediately from the clicked feature — no API wait needed
              try {
                const b = (e.target as L.GeoJSON).getBounds();
                if (b.isValid()) { map.flyToBounds(b, { padding: [30, 30], duration: 1.2 }); mapClickZoomedRef.current = true; }
              } catch {}
              onSelectCantonRef.current(p.id);
            },
          });
        },
      }).addTo(layers);

      if (cantonJustDeselected) {
        map.flyToBounds(SWITZERLAND_BOUNDS, { padding: [20, 20], duration: 1.3 });
      }
    }

    // ── Selected canton boundary ──────────────────────────────────────────
    if (selectedCantonGeo) {
      const fc = { type: "FeatureCollection", features: [{ type: "Feature", geometry: selectedCantonGeo.geojson, properties: {} }] };
      const cantonLayer = L.geoJSON(fc as any, { style: selectedCantonStyle }).addTo(layers);

      if (!selectedGemeindeGeo && (cantonJustSelected || gemeindeJustDeselected) && !clickAlreadyZoomed) {
        try {
          const b = cantonLayer.getBounds();
          if (b.isValid()) map.flyToBounds(b, { padding: [30, 30], duration: 1.3 });
        } catch {}
      }
    }

    // ── Gemeinden overview (canton selected, no gemeinde chosen) ──────────
    if (gemeindenGeo && !selectedGemeindeGeo) {
      L.geoJSON(gemeindenGeo as any, {
        style: featureStyle,
        onEachFeature: (feature, layer) => {
          const p = feature.properties as GemeindeGeoProperties;
          const name = (p.name ?? "").replace(/\s*[\(\-\|]\s*\d+\s*\)?\s*$/g, "").replace(/\s+BFS\s+\d+/i, "").trim();
          layer.on({
            mouseover: (e: any) => { (e.target as L.Path).setStyle(featureHover); showTip(e, `<strong>${name}</strong>`); },
            mousemove: moveTip,
            mouseout: (e: any) => { (e.target as L.Path).setStyle(featureStyle); hideTip(); },
            click: (e: any) => {
              hideTip();
              try {
                const b = (e.target as L.GeoJSON).getBounds();
                if (b.isValid()) { map.flyToBounds(b, { padding: [30, 30], maxZoom: 15, duration: 1.2 }); mapClickZoomedRef.current = true; }
              } catch {}
              onSelectGemeindeRef.current(p.bfs_nummer);
            },
          });
        },
      }).addTo(layers);
    }

    // ── Selected gemeinde boundary ────────────────────────────────────────
    if (selectedGemeindeGeo) {
      const fc = { type: "FeatureCollection", features: [{ type: "Feature", geometry: selectedGemeindeGeo.geojson, properties: {} }] };
      const gemeindeLayer = L.geoJSON(fc as any, { style: gemeindeBoundaryStyle }).addTo(layers);

      if (gemeindeJustSelected && !clickAlreadyZoomed) {
        try {
          const b = gemeindeLayer.getBounds();
          if (b.isValid()) map.flyToBounds(b, { padding: [30, 30], maxZoom: 15, duration: 1.3 });
        } catch {}
      }
    }

    // ── Building markers ──────────────────────────────────────────────────
    buildings.forEach((b) => {
      if (b.lat && b.lon) {
        const isSelected = b.bdg_egid === selectedEgid;
        const marker = L.circleMarker([b.lat, b.lon], {
          radius: isSelected ? 7 : 5,
          color: isSelected ? "hsl(160,30%,30%)" : "hsl(160,24%,42%)",
          fillColor: isSelected ? "hsl(160,28%,36%)" : "hsl(160,20%,48%)",
          fillOpacity: isSelected ? 0.85 : 0.65,
          weight: isSelected ? 2.5 : 1.5,
          ...(isSelected ? { className: "selected-building-marker" } : {}),
        }).addTo(layers);
        marker.on("click", () => onSelectBuilding(b.bdg_egid));
        const popup = `<div style="font-size:13px;line-height:1.5;color:hsl(220,14%,14%);background:hsl(0 0% 100% / 0.97);padding:8px 12px;border-radius:6px;border:1px solid hsl(215 12% 85%);">
          <strong>EGID ${b.bdg_egid}</strong>
          ${b.stn_label ? `<br/>${b.stn_label} ${b.adr_number ?? ""}` : ""}
          ${b.sommer_total != null ? `<br/>☀ ${Math.round(b.sommer_total).toLocaleString()} kWh` : ""}
          ${b.winter_total != null ? `<br/>❄ ${Math.round(b.winter_total).toLocaleString()} kWh` : ""}
        </div>`;
        marker.bindPopup(popup);
      }
    });

    // ── Roof visualization ────────────────────────────────────────────────
    if (buildingRoofs) {
      const roofLayerGroup = L.featureGroup();
      buildingRoofs.parts.forEach((p) => {
        if (p.geojson) {
          const partLayer = L.geoJSON({ type: "Feature", geometry: p.geojson, properties: {} } as any, { style: roofPartStyle }).addTo(roofLayerGroup);
          partLayer.on({
            mouseover: (e: any) => (e.target as L.Path).setStyle(roofPartHover),
            mouseout: (e: any) => (e.target as L.Path).setStyle(roofPartStyle),
          });
        }
      });
      if (buildingRoofs.union) {
        L.geoJSON({ type: "Feature", geometry: buildingRoofs.union, properties: {} } as any, { style: roofUnionStyle }).addTo(roofLayerGroup);
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
  }, [cantonsGeo, selectedCantonGeo, gemeindenGeo, selectedGemeindeGeo, buildings, buildingRoofs, selectedEgid, onSelectBuilding]);

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden border border-border shadow-card">
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-muted-foreground">Loading map data…</span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: "100%" }} />
    </div>
  );
}
