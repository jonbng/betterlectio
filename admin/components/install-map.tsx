"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type SchoolPoint = {
  id: number;
  name: string;
  display_name: string | null;
  lat: number;
  lon: number;
  student_count: number | null;
  stats: {
    total: number;
    extension: number;
    app: number;
    adoptionPct: number | null;
  };
};

// One dot per install. Big schools shrink dot radius and spacing so clusters
// don't blow up geographically.
const DOT_RADIUS_BASE = 600; // small schools
const DOT_RADIUS_MIN = 180; // very large schools
const SPACING_FACTOR_BASE = 2.2; // strict non-overlap
const SPACING_FACTOR_MIN = 1.35; // big schools, dots may visually kiss

export function InstallMap({ schools }: { schools: SchoolPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const labelsRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [56.05, 11.0],
      zoom: 7,
      minZoom: 6,
      maxZoom: 14,
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true,
      preferCanvas: true,
    });
    mapRef.current = map;

    const labelsPane = map.createPane("labels");
    labelsPane.style.zIndex = "650";
    labelsPane.style.pointerEvents = "none";

    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileRef.current) {
      tileRef.current.remove();
      tileRef.current = null;
    }
    if (labelsRef.current) {
      labelsRef.current.remove();
      labelsRef.current = null;
    }

    const url = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";

    const labelsUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png";

    tileRef.current = L.tileLayer(url, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    labelsRef.current = L.tileLayer(labelsUrl, {
      attribution: "",
      subdomains: "abcd",
      maxZoom: 19,
      pane: "labels",
    }).addTo(map);
  }, [isDark]);

  const points = useMemo(() => buildClusterPoints(schools), [schools]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markersRef.current) {
      markersRef.current.remove();
      markersRef.current = null;
    }

    const layer = L.layerGroup().addTo(map);
    markersRef.current = layer;

    const fill = isDark ? "oklch(0.72 0.18 265)" : "oklch(0.55 0.22 265)";
    const stroke = isDark ? "oklch(0.92 0.05 265)" : "oklch(0.35 0.18 265)";

    for (const p of points) {
      const marker = L.circle([p.lat, p.lon], {
        radius: p.dotRadius,
        color: stroke,
        weight: 1,
        opacity: 0.9,
        fillColor: fill,
        fillOpacity: 0.6,
      }).addTo(layer);

      marker.bindTooltip(
        `<div style="font-weight:600">${escapeHtml(p.label)}</div>` +
          `<div>${p.totalInstalls} install${p.totalInstalls === 1 ? "" : "s"}</div>` +
          (p.schoolStudentCount != null
            ? `<div style="opacity:0.7">${p.schoolStudentCount.toLocaleString()} students total · ${p.adoptionPct!.toFixed(1)}% adoption</div>`
            : `<div style="opacity:0.7">${p.totalBlStudents} BL students · enrollment unknown</div>`),
        { direction: "top" },
      );
    }

    return () => {
      layer.remove();
      markersRef.current = null;
    };
  }, [points, isDark]);

  return (
    <div
      ref={containerRef}
      className="install-map-shell min-h-[480px] w-full flex-1 overflow-hidden rounded-xl border bg-muted shadow-sm"
    />
  );
}

type ClusterPoint = {
  lat: number;
  lon: number;
  dotRadius: number;
  label: string;
  totalInstalls: number;
  totalBlStudents: number;
  schoolStudentCount: number | null;
  adoptionPct: number | null;
};

function buildClusterPoints(schools: SchoolPoint[]): ClusterPoint[] {
  const out: ClusterPoint[] = [];
  for (const s of schools) {
    const installs = s.stats.extension;
    if (installs <= 0) continue;
    const label = s.display_name ?? s.name;

    // Smoothly interpolate dot size + spacing toward tighter values as a
    // school grows, so big schools stay geographically compact.
    const t = Math.min(1, Math.log10(Math.max(1, installs)) / 3); // 0 at 1, 1 at 1000+
    const dotRadius = lerp(DOT_RADIUS_BASE, DOT_RADIUS_MIN, t);
    const spacing = lerp(SPACING_FACTOR_BASE, SPACING_FACTOR_MIN, t);

    const clusterRadius =
      installs <= 1 ? 0 : spacing * dotRadius * Math.sqrt(installs);
    const positions = sunflowerOffsets(installs, clusterRadius);

    for (let i = 0; i < installs; i++) {
      const [dx, dy] = positions[i];
      const [lat, lon] = offsetMeters(s.lat, s.lon, dx, dy);
      out.push({
        lat,
        lon,
        dotRadius,
        label,
        totalInstalls: installs,
        totalBlStudents: s.stats.total,
        schoolStudentCount: s.student_count,
        adoptionPct: s.stats.adoptionPct,
      });
    }
  }
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sunflowerOffsets(n: number, radiusMeters: number): [number, number][] {
  if (n <= 1) return [[0, 0]];
  const phi = (1 + Math.sqrt(5)) / 2;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = radiusMeters * Math.sqrt((i + 0.5) / n);
    const theta = 2 * Math.PI * i * (1 / (phi * phi));
    out.push([r * Math.cos(theta), r * Math.sin(theta)]);
  }
  return out;
}

function offsetMeters(
  lat: number,
  lon: number,
  dxMeters: number,
  dyMeters: number,
): [number, number] {
  const earthR = 6378137;
  const dLat = (dyMeters / earthR) * (180 / Math.PI);
  const dLon =
    ((dxMeters / earthR) * (180 / Math.PI)) /
    Math.cos((lat * Math.PI) / 180);
  return [lat + dLat, lon + dLon];
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
