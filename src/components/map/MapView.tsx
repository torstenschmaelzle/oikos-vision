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

function createTooltipDiv() {
  const div = document.createElement("div");
  div.className = "map-feature-tooltip";
  div.style.cssText =
    "position:absolute;z-index:1000;pointer-events:none;opacity:0;transition:opacity 0.15s;padding:8px 14px;border-radius:12px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;line-height:1.5;white-space:nowrap;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);background:hsla(150,20%,8%,0.85);border:1px solid hsla(152,60%,38%,0.3);box-shadow:0 4px 20px -4px hsla(150,30%,5%,0.4);color:hsl(145,15%,90%)";
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
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
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

    // Green glass theme styles
    const cantonStyle: L.PathOptions = { color: "hsl(152,55%,45%)", weight: 1, fillOpacity: 0.08, fillColor: "hsl(152,55%,45%)" };
    const cantonHover: L.PathOptions = { weight: 2.5, fillOpacity: 0.18, color: "hsl(152,65%,55%)" };
    const selectedCantonStyle: L.PathOptions = { color: "hsl(152,65%,50%)", weight: 2.5, fillOpacity: 0.12, fillColor: "hsl(152,55%,45%)" };
    const gemeindeStyle: L.PathOptions = { color: "hsl(152,50%,40%)", weight: 1, fillOpacity: 0.05, fillColor: "hsl(152,50%,40%)", dashArray: "4 4" };
    const gemeindeHover: L.PathOptions = { weight: 2, fillOpacity: 0.15, color: "hsl(152,65%,55%)" };
    const gemeindeBoundaryStyle: L.PathOptions = { color: "hsl(152,65%,55%)", weight: 3, fillOpacity: 0.12, fillColor: "hsl(152,55%,45%)" };
    const roofPartStyle: L.PathOptions = { color: "hsl(152,70%,50%)", weight: 1.5, fillOpacity: 0.3, fillColor: "hsl(152,60%,45%)" };
    const roofPartHover: L.PathOptions = { fillOpacity: 0.5, weight: 2.5, color: "hsl(152,80%,60%)" };
    const roofUnionStyle: L.PathOptions = { color: "hsl(152,80%,60%)", weight: 2, fillOpacity: 0.1, fillColor: "hsl(152,70%,55%)", dashArray: "6 4" };

    // Canton borders
    if (!selectedCantonGeo && cantonsGeo) {
      L.geoJSON(cantonsGeo as any, {
        style: cantonStyle,
        onEachFeature: (feature, layer) => {
          const p = feature.properties as CantonGeoProperties;
          layer.on({
            mouseover: (e: any) => {
              (e.target as L.Path).setStyle(cantonHover);
              showTip(e, `<strong>${p.name}</strong>`);
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
              showTip(e, `<strong>${p.name}</strong>`);
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

    // Building markers — green circle markers
    buildings.forEach((b) => {
      if (b.lat && b.lon) {
        const isSelected = b.bdg_egid === selectedEgid;
        const marker = L.circleMarker([b.lat, b.lon], {
          radius: isSelected ? 8 : 5,
          color: isSelected ? "hsl(152,80%,65%)" : "hsl(152,60%,45%)",
          fillColor: isSelected ? "hsl(152,80%,65%)" : "hsl(152,55%,40%)",
          fillOpacity: isSelected ? 0.9 : 0.7,
          weight: isSelected ? 3 : 1.5,
          ...(isSelected ? { className: "selected-building-marker" } : {}),
        }).addTo(layers);
        marker.on("click", () => onSelectBuilding(b.bdg_egid));
        const popup = `<div style="font-size:13px;line-height:1.5;color:hsl(145,15%,90%);background:hsla(150,20%,8%,0.95);padding:10px 14px;border-radius:10px;border:1px solid hsla(152,60%,38%,0.3);">
          <strong>EGID ${b.bdg_egid}</strong>
          ${b.stn_label ? `<br/>${b.stn_label} ${b.adr_number ?? ""}` : ""}
          ${b.sommer_total != null ? `<br/>☀ ${Math.round(b.sommer_total).toLocaleString()} kWh` : ""}
          ${b.winter_total != null ? `<br/>❄ ${Math.round(b.winter_total).toLocaleString()} kWh` : ""}
        </div>`;
        marker.bindPopup(popup, { className: "dark-popup" });
      }
    });

    // Roof polygons + auto-zoom
    if (buildingRoofs) {
      const roofLayerGroup = L.featureGroup();

      buildingRoofs.parts.forEach((p) => {
        if (p.geojson) {
          const partLayer = L.geoJSON({ type: "Feature", geometry: p.geojson, properties: {} } as any, {
            style: roofPartStyle,
          }).addTo(roofLayerGroup);
          partLayer.on({
            mouseover: (e: any) => (e.target as L.Path).setStyle(roofPartHover),
            mouseout: (e: any) => (e.target as L.Path).setStyle(roofPartStyle),
          });
        }
      });
      if (buildingRoofs.union) {
        L.geoJSON({ type: "Feature", geometry: buildingRoofs.union, properties: {} } as any, {
          style: roofUnionStyle,
        }).addTo(roofLayerGroup);
      }

      roofLayerGroup.addTo(layers);

      // Auto-zoom to roof polygons
      try {
        const roofBounds = roofLayerGroup.getBounds();
        if (roofBounds.isValid()) {
          map.fitBounds(roofBounds, { padding: [40, 40], animate: true, duration: 0.8, maxZoom: 19 });
        }
      } catch {}
    }
  }, [cantonsGeo, selectedCantonGeo, gemeindenGeo, selectedGemeindeGeo, buildings, buildingRoofs, selectedEgid, onSelectBuilding]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-primary/20 shadow-[0_0_30px_-5px_hsla(152,60%,38%,0.15)]">
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-[hsla(150,20%,6%,0.7)] backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-[hsl(145,15%,70%)]">Loading map data…</span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: "100%" }} />
    </div>
  );
}
