"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type SchoolPoint = {
  id: number;
  name: string;
  display_name: string | null;
  lat: number;
  lon: number;
  stats: { total: number; extension: number; app: number };
};

export function InstallMap({ schools }: { schools: SchoolPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const maxInstalls = useMemo(
    () =>
      schools.reduce((m, s) => Math.max(m, s.stats.extension), 1),
    [schools],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [56.05, 11.0],
      zoom: 7,
      minZoom: 6,
      maxZoom: 12,
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      },
    ).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layer = L.layerGroup().addTo(map);

    for (const s of schools) {
      const installs = s.stats.extension;
      const t = Math.sqrt(installs / maxInstalls);
      const radius = 4 + t * 22;

      const marker = L.circleMarker([s.lat, s.lon], {
        radius,
        color: "oklch(0.54 0.2 265)",
        weight: 1.5,
        fillColor: "oklch(0.65 0.16 265)",
        fillOpacity: 0.55,
      }).addTo(layer);

      const label = s.display_name ?? s.name;
      marker.bindTooltip(
        `<div style="font-weight:600">${escapeHtml(label)}</div>` +
          `<div>${installs} install${installs === 1 ? "" : "s"}</div>` +
          `<div style="opacity:0.7">${s.stats.total} total students</div>`,
        { direction: "top", offset: [0, -radius] },
      );
    }

    return () => {
      layer.remove();
    };
  }, [schools, maxInstalls]);

  return (
    <div
      ref={containerRef}
      className="h-[640px] w-full overflow-hidden rounded-lg border bg-muted"
    />
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
