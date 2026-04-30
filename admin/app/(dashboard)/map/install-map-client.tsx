"use client";

import dynamic from "next/dynamic";

export const InstallMapClient = dynamic(
  () => import("@/components/install-map").then((m) => m.InstallMap),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[480px] w-full flex-1 rounded-xl border bg-muted" />
    ),
  },
);
