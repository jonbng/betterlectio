import { getStudents } from "@/lib/supabase/queries";
import { StudentsTable } from "@/components/students-table";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const students = await getStudents();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
        <p className="text-sm text-muted-foreground">
          {students.length} total students
        </p>
      </div>
      <StudentsTable students={students} />
    </div>
  );
}
