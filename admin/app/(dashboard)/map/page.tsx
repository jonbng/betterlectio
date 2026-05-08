import { getSchoolMapData } from "@/lib/supabase/queries";
import { InstallMapClient } from "./install-map-client";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const schools = await getSchoolMapData();

  const totalActive = schools.reduce((n, s) => n + s.stats.active, 0);
  const topSchool = [...schools].sort(
    (a, b) => b.stats.active - a.stats.active,
  )[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
          <p className="text-sm text-muted-foreground">
            {schools.length} schools with active users · {totalActive} active
            BetterLectio users
            {topSchool
              ? ` · top: ${topSchool.display_name ?? topSchool.name} (${topSchool.stats.active})`
              : ""}
          </p>
        </div>
      </div>
      <InstallMapClient schools={schools} />
    </div>
  );
}
