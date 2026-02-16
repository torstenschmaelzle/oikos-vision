import { useEffect, useRef, useMemo } from "react";
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

// Fix default marker icons
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";

L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
});

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

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([46.8, 8.2], 8);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);
    layersRef.current.addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update layers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layers = layersRef.current;
    layers.clearLayers();

    const cantonStyle: L.PathOptions = { color: "#3b9c6b", weight: 1, fillOpacity: 0.05, fillColor: "#3b9c6b" };
    const selectedCantonStyle: L.PathOptions = { color: "#2d7d56", weight: 2.5, fillOpacity: 0.08, fillColor: "#2d7d56" };
    const gemeindeStyle: L.PathOptions = { color: "#5cb88a", weight: 1, fillOpacity: 0.03, fillColor: "#5cb88a", dashArray: "4 4" };
    const gemeindeBoundaryStyle: L.PathOptions = { color: "#2d7d56", weight: 3, fillOpacity: 0.1, fillColor: "#2d7d56" };
    const roofPartStyle: L.PathOptions = { color: "#f59e0b", weight: 1.5, fillOpacity: 0.35, fillColor: "#fbbf24" };
    const roofUnionStyle: L.PathOptions = { color: "#ef4444", weight: 2, fillOpacity: 0.15, fillColor: "#ef4444", dashArray: "6 4" };

    // Canton borders (when no canton selected)
    if (!selectedCantonGeo && cantonsGeo) {
      L.geoJSON(cantonsGeo as any, { style: cantonStyle }).addTo(layers);
    }

    // Selected canton
    if (selectedCantonGeo) {
      const fc = {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: selectedCantonGeo.geojson, properties: {} }],
      };
      const layer = L.geoJSON(fc as any, { style: selectedCantonStyle }).addTo(layers);
      if (!selectedGemeindeGeo) {
        try {
          const bounds = layer.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
        } catch {}
      }
    }

    // Gemeinden overlay
    if (gemeindenGeo && !selectedGemeindeGeo) {
      L.geoJSON(gemeindenGeo as any, { style: gemeindeStyle }).addTo(layers);
    }

    // Selected gemeinde boundary
    if (selectedGemeindeGeo) {
      const fc = {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: selectedGemeindeGeo.geojson, properties: {} }],
      };
      const layer = L.geoJSON(fc as any, { style: gemeindeBoundaryStyle }).addTo(layers);
      try {
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch {}
    }

    // Building markers
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

    // Roof parts
    if (buildingRoofs) {
      buildingRoofs.parts.forEach((p) => {
        if (p.geojson) {
          L.geoJSON({ type: "Feature", geometry: p.geojson, properties: {} } as any, {
            style: roofPartStyle,
          }).addTo(layers);
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
