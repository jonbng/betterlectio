import { Loader2 } from "lucide-react";
import { useEffect, useState } from "preact/hooks";
import type { Member } from "@/lib/members-fetch";
import {
  getStudentFromLookupId,
  getPreferredStudentPictureUrl,
  getPreferredStudentDisplayName,
  type StudentsMap,
} from "@/lib/supabase/student-lookup";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface MembersPanelProps {
  members: Member[] | null;
  loading: boolean;
  error: string | null;
  studentsMap: StudentsMap | null;
  schoolId: string | null;
  accentHue: number;
}

export function MembersPanel({
  members,
  loading,
  error,
  studentsMap,
  schoolId,
}: MembersPanelProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-[color-mix(in_oklch,var(--muted)_35%,transparent)] px-4 py-5">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t('activityModal.loadingParticipants')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-xl border border-[oklch(0.83_0.07_25)] bg-[oklch(0.97_0.02_25)] px-4 py-3 text-sm text-[oklch(0.45_0.1_25)] dark:border-[oklch(0.4_0.05_25)] dark:bg-[oklch(0.2_0.02_25)] dark:text-[oklch(0.75_0.07_25)]">
        {error}
      </div>
    );
  }

  if (!members || members.length === 0) return null;

  const sorted = [...members].sort((a, b) => {
    if (a.type !== b.type) return a.type === "T" ? -1 : 1;
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "da");
  });

  const teachers = sorted.filter((m) => m.type === "T");
  const students = sorted.filter((m) => m.type === "S");

  return (
    <div className="mt-4 rounded-xl border border-border bg-[color-mix(in_oklch,var(--muted)_35%,transparent)] overflow-hidden">
      {teachers.length > 0 ? (
        <div className="px-3.5 pt-3 pb-2">
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
            {teachers.length === 1 ? t('activityModal.teacherLabel') : t('activityModal.teachersLabel')}
          </p>
          <div className="flex flex-wrap items-start gap-1">
            {teachers.map((m) => (
              <MemberChip key={m.id} member={m} studentsMap={studentsMap} schoolId={schoolId} />
            ))}
          </div>
        </div>
      ) : null}
      {students.length > 0 ? (
        <div className={cn("px-3.5 pb-3", teachers.length > 0 ? "pt-2" : "pt-3")}>
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
            {t('activityModal.studentsLabel')}
            <span className="ml-1 font-normal opacity-70">{students.length}</span>
          </p>
          <div className="flex flex-wrap items-start gap-1">
            {students.map((m) => (
              <MemberChip key={m.id} member={m} studentsMap={studentsMap} schoolId={schoolId} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MemberChip({
  member,
  studentsMap,
  schoolId,
}: {
  member: Member;
  studentsMap: StudentsMap | null;
  schoolId: string | null;
}) {
  const student = member.type === "S" ? getStudentFromLookupId(studentsMap, member.id) : null;
  const pictureUrl = member.type === "S"
    ? getPreferredStudentPictureUrl(student, member.pictureUrl)
    : member.pictureUrl;
  const fullName = member.type === "S"
    ? getPreferredStudentDisplayName(student, `${member.firstName} ${member.lastName}`)
    : `${member.firstName} ${member.lastName}`;

  const nameParts = fullName.trim().split(/\s+/);
  const displayName = nameParts.length <= 2
    ? fullName
    : `${nameParts[0]} ${nameParts[nameParts.length - 1]}`;

  const scheduleUrl = schoolId
    ? `/lectio/${schoolId}/SkemaNy.aspx?type=${member.type === "T" ? "laerer" : "elev"}&${member.type === "T" ? "laererid" : "elevid"}=${member.id.slice(1)}`
    : null;

  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-base leading-snug",
        scheduleUrl
          ? "transition-[background-color] duration-150 hover:bg-[color-mix(in_oklch,var(--muted)_80%,transparent)] cursor-pointer"
          : "",
      )}
    >
      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
        <MemberAvatar
          primaryUrl={pictureUrl ?? null}
          fallbackUrl={member.pictureUrl ?? null}
          displayName={displayName}
        />
      </span>
      <span className="truncate max-w-[140px]">{displayName}</span>
    </span>
  );

  if (scheduleUrl) {
    return (
      <a
        href={scheduleUrl}
        data-no-activity-modal="true"
        className="no-underline text-foreground"
        target="_blank"
      >
        {chip}
      </a>
    );
  }

  return chip;
}

function MemberAvatar({
  primaryUrl,
  fallbackUrl,
  displayName,
}: {
  primaryUrl: string | null;
  fallbackUrl: string | null;
  displayName: string;
}) {
  const [url, setUrl] = useState(primaryUrl);

  useEffect(() => setUrl(primaryUrl), [primaryUrl, fallbackUrl]);

  if (!url) {
    return (
      <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
        {displayName.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className="h-full w-full object-cover object-top"
      loading="lazy"
      onError={() => setUrl(fallbackUrl && fallbackUrl !== url ? fallbackUrl : null)}
    />
  );
}
