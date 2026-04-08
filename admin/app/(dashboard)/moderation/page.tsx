import { getStudentsWithProfiles } from "@/lib/supabase/queries";
import { ModerationList } from "@/components/moderation-list";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const students = await getStudentsWithProfiles();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Profile Moderation
        </h1>
        <p className="text-sm text-muted-foreground">
          {students.length} students with profile content
        </p>
      </div>
      <ModerationList students={students} />
    </div>
  );
}
