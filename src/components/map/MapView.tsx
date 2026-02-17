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

interface Props {
  cantonsGeo: FeatureCollection<Geometry, CantonGeoProperties> | null;
  selectedCantonGeo: CantonGeoDetail | null;
  gemeindenGeo: FeatureCollection<Geometry, GemeindeGeoProperties> | null;
  selectedGemeindeGeo: GemeindeGeoDetail | null;
  buildings: Building[];
  buildingRoofs: BuildingRoofsResponse | null;
  selectedEgid: number | null;
  onSelectBuilding: (egid: number) => void;
  loading: boolean;
}

// Tooltip div for custom hover
function createTooltipDiv() {
  const div = document.createElement("div");
  div.className = "map-feature-tooltip";
  div.style.cssText =
    "position:absolute;z-index:1000;pointer-events:none;opacity:0;transition:opacity 0.15s;padding:8px 14px;border-radius:12px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;line-height:1.5;white-space:nowrap;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:hsla(150,20%,98%,0.85);border:1px solid hsl(145,15%,85%);box-shadow:0 4px 20px -4px hsla(150,30%,20%,0.15);color:hsl(150,10%,12%)";
  document.body.appendChild(div);
  return div;
}

export default function MapView({
  cantonsGeo,
  selectedCantonGeo,
  gemeindenGeo,
  selectedGemeindeGeo,
  buildings,
  buildingRoofs,
  selectedEgid,
  onSelectBuilding,
  loading,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup>(L.layerGroup());
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([46.8, 8.2], 8);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
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

    const cantonStyle: L.PathOptions = { color: "#3b9c6b", weight: 1, fillOpacity: 0.05, fillColor: "#3b9c6b" };
    const cantonHover: L.PathOptions = { weight: 2.5, fillOpacity: 0.12, color: "#2d7d56" };
    const selectedCantonStyle: L.PathOptions = { color: "#2d7d56", weight: 2.5, fillOpacity: 0.08, fillColor: "#2d7d56" };
    const gemeindeStyle: L.PathOptions = { color: "#5cb88a", weight: 1, fillOpacity: 0.03, fillColor: "#5cb88a", dashArray: "4 4" };
    const gemeindeHover: L.PathOptions = { weight: 2, fillOpacity: 0.1, color: "#2d7d56" };
    const gemeindeBoundaryStyle: L.PathOptions = { color: "#2d7d56", weight: 3, fillOpacity: 0.1, fillColor: "#2d7d56" };
    const roofPartStyle: L.PathOptions = { color: "#f59e0b", weight: 1.5, fillOpacity: 0.35, fillColor: "#fbbf24" };
    const roofPartHover: L.PathOptions = { fillOpacity: 0.55, weight: 2.5 };
    const roofUnionStyle: L.PathOptions = { color: "#ef4444", weight: 2, fillOpacity: 0.15, fillColor: "#ef4444", dashArray: "6 4" };

    // Canton borders
    if (!selectedCantonGeo && cantonsGeo) {
      L.geoJSON(cantonsGeo as any, {
        style: cantonStyle,
        onEachFeature: (feature, layer) => {
          const p = feature.properties as CantonGeoProperties;
          layer.on({
            mouseover: (e: any) => {
              (e.target as L.Path).setStyle(cantonHover);
              showTip(e, `<strong>${p.name}</strong> <span style="opacity:0.6;margin-left:4px">${p.code}</span>`);
            },
            mousemove: moveTip,
            mouseout: (e: any) => {
              (e.target as L.Path).setStyle(cantonStyle);
              hideTip();
            },
          });
        },
      }).addTo(layers);
    }

    if (selectedCantonGeo) {
      const fc = { type: "FeatureCollection", features: [{ type: "Feature", geometry: selectedCantonGeo.geojson, properties: {} }] };
      const layer = L.geoJSON(fc as any, { style: selectedCantonStyle }).addTo(layers);
      if (!selectedGemeindeGeo) {
        try {
          const bounds = layer.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
        } catch {}
      }
    }

    if (gemeindenGeo && !selectedGemeindeGeo) {
      L.geoJSON(gemeindenGeo as any, {
        style: gemeindeStyle,
        onEachFeature: (feature, layer) => {
          const p = feature.properties as GemeindeGeoProperties;
          layer.on({
            mouseover: (e: any) => {
              (e.target as L.Path).setStyle(gemeindeHover);
              showTip(e, `<strong>${p.name}</strong> <span style="opacity:0.6;margin-left:4px">BFS ${p.bfs_nummer}</span>`);
            },
            mousemove: moveTip,
            mouseout: (e: any) => {
              (e.target as L.Path).setStyle(gemeindeStyle);
              hideTip();
            },
          });
        },
      }).addTo(layers);
    }

    if (selectedGemeindeGeo) {
      const fc = { type: "FeatureCollection", features: [{ type: "Feature", geometry: selectedGemeindeGeo.geojson, properties: {} }] };
      const layer = L.geoJSON(fc as any, { style: gemeindeBoundaryStyle }).addTo(layers);
      try {
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch {}
    }

    buildings.forEach((b) => {
      if (b.lat && b.lon) {
        const marker = L.marker([b.lat, b.lon]).addTo(layers);
        marker.on("click", () => onSelectBuilding(b.bdg_egid));
        const popup = `<div style="font-size:13px;line-height:1.5">
          <strong>EGID ${b.bdg_egid}</strong>
          ${b.stn_label ? `<br/>${b.stn_label} ${b.adr_number ?? ""}` : ""}
          ${b.sommer_total != null ? `<br/>☀ ${Math.round(b.sommer_total).toLocaleString()} kWh` : ""}
          ${b.winter_total != null ? `<br/>❄ ${Math.round(b.winter_total).toLocaleString()} kWh` : ""}
        </div>`;
        marker.bindPopup(popup);
      }
    });

    if (buildingRoofs) {
      buildingRoofs.parts.forEach((p) => {
        if (p.geojson) {
          const partLayer = L.geoJSON({ type: "Feature", geometry: p.geojson, properties: {} } as any, {
            style: roofPartStyle,
          }).addTo(layers);
          partLayer.on({
            mouseover: (e: any) => (e.target as L.Path).setStyle(roofPartHover),
            mouseout: (e: any) => (e.target as L.Path).setStyle(roofPartStyle),
          });
        }
      });
      if (buildingRoofs.union) {
        L.geoJSON({ type: "Feature", geometry: buildingRoofs.union, properties: {} } as any, {
          style: roofUnionStyle,
        }).addTo(layers);
      }
    }
  }, [cantonsGeo, selectedCantonGeo, gemeindenGeo, selectedGemeindeGeo, buildings, buildingRoofs, onSelectBuilding]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-card border border-border/50">
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/60 backdrop-blur-sm">
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
