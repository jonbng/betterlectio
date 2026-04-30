"use client";

import dynamic from "next/dynamic";

export const InstallMapClient = dynamic(
  () => import("@/components/install-map").then((m) => m.InstallMap),
  { ssr: false, loading: () => <div className="h-[640px] w-full rounded-lg border bg-muted" /> },
);
