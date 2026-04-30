import { getSchoolMapData } from "@/lib/supabase/queries";
import { InstallMapClient } from "./install-map-client";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const schools = await getSchoolMapData();

  const totalInstalls = schools.reduce((n, s) => n + s.stats.extension, 0);
  const topSchool = [...schools].sort(
    (a, b) => b.stats.extension - a.stats.extension,
  )[0];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
          <p className="text-sm text-muted-foreground">
            {schools.length} schools with installs · {totalInstalls} extension
            installs
            {topSchool
              ? ` · top: ${topSchool.display_name ?? topSchool.name} (${topSchool.stats.extension})`
              : ""}
          </p>
        </div>
      </div>
      <InstallMapClient schools={schools} />
    </div>
  );
}
