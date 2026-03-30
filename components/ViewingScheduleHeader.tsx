import { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Pin, School, DoorOpen, Box, UsersRound, LayoutGrid, GraduationCap, Users, ChevronDown, Loader2, Mail } from 'lucide-react';
import { addRecentPerson, getScheduleUrl, isPersonStarred, toggleStarred } from '@/lib/findskema-storage';
import type { ScheduleEntityType } from '@/lib/profile-cache';
import { fetchMembersFromUrls, getMembersFetchUrlsFromDocument, type Member } from '@/lib/members-fetch';
import { resolveClassId } from '@/lib/resolve-class-id';
import { buildViewedEntityTitle, setCustomPageTitle } from '@/lib/page-titles';
import { getSettings } from '@/lib/settings-storage';
import { PersonCard } from './PersonCard';
import { useSchoolStudents } from '@/lib/supabase/student-lookup';

interface ViewingScheduleHeaderProps {
  name: string;
  subtitle?: string;
  pictureUrl: string | null;
  type: ScheduleEntityType;
  schoolId: string;
  entityId: string;
}

// Badge configuration for each entity type
const ENTITY_CONFIG: Record<ScheduleEntityType, {
  label: string;
  bgClass: string;
  textClass: string;
  icon: typeof Users;
  storagePrefix: string;
}> = {
  student: {
    label: 'Elev',
    bgClass: 'bg-[oklch(0.93_0.04_250)] dark:bg-[oklch(0.25_0.04_250)]',
    textClass: 'text-[oklch(0.45_0.15_250)] dark:text-[oklch(0.78_0.1_250)]',
    icon: Users,
    storagePrefix: 'S',
  },
  teacher: {
    label: 'Lærer',
    bgClass: 'bg-[oklch(0.93_0.04_160)] dark:bg-[oklch(0.25_0.04_160)]',
    textClass: 'text-[oklch(0.45_0.15_160)] dark:text-[oklch(0.78_0.1_160)]',
    icon: GraduationCap,
    storagePrefix: 'T',
  },
  class: {
    label: 'Klasse',
    bgClass: 'bg-[oklch(0.93_0.04_300)] dark:bg-[oklch(0.25_0.04_300)]',
    textClass: 'text-[oklch(0.45_0.15_300)] dark:text-[oklch(0.78_0.1_300)]',
    icon: School,
    storagePrefix: 'K',
  },
  room: {
    label: 'Lokale',
    bgClass: 'bg-[oklch(0.93_0.04_80)] dark:bg-[oklch(0.25_0.04_80)]',
    textClass: 'text-[oklch(0.45_0.15_80)] dark:text-[oklch(0.78_0.1_80)]',
    icon: DoorOpen,
    storagePrefix: 'L',
  },
  resource: {
    label: 'Ressource',
    bgClass: 'bg-muted dark:bg-muted',
    textClass: 'text-muted-foreground dark:text-muted-foreground',
    icon: Box,
    storagePrefix: 'R',
  },
  hold: {
    label: 'Hold',
    bgClass: 'bg-[oklch(0.93_0.04_200)] dark:bg-[oklch(0.25_0.04_200)]',
    textClass: 'text-[oklch(0.45_0.15_200)] dark:text-[oklch(0.78_0.1_200)]',
    icon: UsersRound,
    storagePrefix: 'H',
  },
  group: {
    label: 'Gruppe',
    bgClass: 'bg-[oklch(0.93_0.04_350)] dark:bg-[oklch(0.25_0.04_350)]',
    textClass: 'text-[oklch(0.45_0.15_350)] dark:text-[oklch(0.78_0.1_350)]',
    icon: LayoutGrid,
    storagePrefix: 'G',
  },
  holdelement: {
    label: 'Hold',
    bgClass: 'bg-[oklch(0.93_0.04_265)] dark:bg-[oklch(0.25_0.04_265)]',
    textClass: 'text-[oklch(0.45_0.15_265)] dark:text-[oklch(0.78_0.1_265)]',
    icon: UsersRound,
    storagePrefix: 'H', // Use H for storage since it's a type of hold
  },
};

export function ViewingScheduleHeader({
  name,
  subtitle,
  pictureUrl,
  type,
  schoolId,
  entityId,
}: ViewingScheduleHeaderProps) {
  const [imageEnlarged, setImageEnlarged] = useState(false);
  const [starred, setStarred] = useState(() => isPersonStarred(entityId));
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [, setMembersRerenderNonce] = useState(0);
  const { studentsMap } = useSchoolStudents(schoolId);
  const firstName = name.split(' ')[0];
  const titleSubject = subtitle ? `${name} (${subtitle})` : name;

  const config = ENTITY_CONFIG[type];
  const TypeIcon = config.icon;
  const hasPicture = type === 'student' || type === 'teacher';
  const canMessage = type === 'teacher';
  const messageHref = `/lectio/${schoolId}/beskeder2.aspx?mappeid=-70`;
  const membersFetchUrls = getMembersFetchUrlsFromDocument();
  const hasSubnavMembers = membersFetchUrls.length > 0;
  // Students with a class code can show classmates even without subnav members links
  const isStudentWithClass = type === 'student' && !!subtitle;
  const supportsMembersPanel = hasSubnavMembers || isStudentWithClass;
  const pinningEnabled = getSettings().data?.starredPeople ?? false;

  // Parse navigation context from URL params (set by FindSkemaPage)
  const urlParams = new URLSearchParams(window.location.search);
  const fromFindSkema = urlParams.get('from') === 'findskema';
  const searchQuery = urlParams.get('q') || '';

  // Build back URL based on where user came from
  const backUrl = fromFindSkema
    ? `/lectio/${schoolId}/FindSkema.aspx${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ''}`
    : `/lectio/${schoolId}/SkemaNy.aspx`;
  const backText = fromFindSkema ? 'Tilbage til søgning' : 'Tilbage til dit skema';

  const handleToggleStar = () => {
    const newStarred = toggleStarred({
      id: entityId,
      name,
      classCode: subtitle || '',
      type: config.storagePrefix,
    });
    setStarred(newStarred);
  };

  const handleToggleMembers = async () => {
    const nextOpen = !membersOpen;
    setMembersOpen(nextOpen);

    if (!nextOpen || !supportsMembersPanel || members || membersLoading) {
      return;
    }

    setMembersLoading(true);
    setMembersError(null);

    try {
      let urls = membersFetchUrls;

      // For students without subnav members links, resolve class code → klasseid
      if (urls.length === 0 && isStudentWithClass) {
        const klasseId = await resolveClassId(schoolId, subtitle);
        if (klasseId) {
          const membersUrl = new URL(
            `/lectio/${schoolId}/subnav/members.aspx`,
            window.location.origin,
          );
          membersUrl.searchParams.set('klasseid', klasseId);
          membersUrl.searchParams.set('showstudents', '1');
          membersUrl.searchParams.set('reporttype', 'withpics');
          urls = [membersUrl.href];
        } else {
          setMembersError('Kunne ikke finde klassen.');
          setMembersLoading(false);
          return;
        }
      }

      const fetchedMembers = await fetchMembersFromUrls(urls);
      setMembers(fetchedMembers);
    } catch (error) {
      console.error('[BetterLectio] Failed to fetch members', {
        entityId,
        type,
        error,
        membersFetchUrls,
      });
      setMembersError('Kunne ikke hente medlemmer lige nu.');
    } finally {
      setMembersLoading(false);
    }
  };

  const handleMemberStarToggle = (memberId: string) => {
    if (!members) return;
    const member = members.find(entry => entry.id === memberId);
    if (!member) return;

    const fullName = `${member.firstName} ${member.lastName}`.trim();
    toggleStarred({
      id: member.id,
      name: fullName,
      classCode: member.classCode,
      type: member.type,
    });
    setMembersRerenderNonce(prev => prev + 1);
  };

  const handleMemberClick = (member: Member) => {
    const fullName = `${member.firstName} ${member.lastName}`.trim();
    addRecentPerson({
      id: member.id,
      name: fullName,
      classCode: member.classCode,
      type: member.type,
      url: getScheduleUrl(member.id, schoolId, { name: fullName }),
    });
  };

  useEffect(() => {
    setCustomPageTitle(buildViewedEntityTitle(titleSubject, 'skema'));

    return () => {
      setCustomPageTitle(null);
    };
  }, [titleSubject]);

  const sortedMembers = members
    ? [...members].sort((a, b) => {
        if (a.type === 'T' && b.type !== 'T') return -1;
        if (a.type !== 'T' && b.type === 'T') return 1;
        return 0;
      })
    : [];

  // Close enlarged image on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setImageEnlarged(false);
      }
    }
    if (imageEnlarged) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [imageEnlarged]);

  return (
    <div className="border-b border-border bg-muted/50 px-4 py-3">
      <div className="flex items-center gap-4">
        <a
          href={backUrl}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150"
        >
          <ArrowLeft className="size-4" />
          <span>{backText}</span>
        </a>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-3">
          {hasPicture ? (
            <Avatar
              className={`h-10 w-10 rounded-lg ${pictureUrl ? 'cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all' : ''}`}
              onClick={() => pictureUrl && setImageEnlarged(true)}
            >
              {pictureUrl ? (
                <AvatarImage src={pictureUrl} alt={name} className="object-cover object-top" />
              ) : null}
              <AvatarFallback className="rounded-lg">
                {firstName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${config.bgClass}`}>
              <TypeIcon className={`size-5 ${config.textClass}`} />
            </div>
          )}

          <div className="flex flex-col">
            <span className="font-medium text-base">{name}</span>
            <div className="flex items-center gap-2">
              {subtitle && (
                <span className="text-sm text-muted-foreground">{subtitle}</span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${config.bgClass} ${config.textClass}`}>
                {config.label}
              </span>
            </div>
          </div>

          <div className="ml-2 flex items-center gap-1">
            {pinningEnabled && (
              <button
                type="button"
                onClick={handleToggleStar}
                className="p-2 rounded-lg hover:bg-accent transition-[color,background-color] duration-150"
                title={starred ? 'Fjern fra fastgjorte' : 'Fastgør person'}
              >
                <Pin
                  className={`size-5 transition-[color,background-color] duration-150 ${
                    starred
                      ? 'fill-primary text-primary'
                      : 'text-muted-foreground hover:text-primary'
                  }`}
                />
              </button>
            )}

            {supportsMembersPanel && (
              <button
                type="button"
                onClick={handleToggleMembers}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-[color,background-color] duration-150 hover:bg-accent aria-expanded:bg-primary/10 aria-expanded:border-primary/40"
                aria-expanded={membersOpen}
                title={isStudentWithClass && !hasSubnavMembers ? 'Vis klassekammerater' : 'Vis medlemmer'}
              >
                <Users className="size-4" />
                <span>{isStudentWithClass && !hasSubnavMembers ? 'Klassekammerater' : 'Medlemmer'}</span>
                <ChevronDown className={`size-4 transition-transform ${membersOpen ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {canMessage && (
          <button
            type="button"
            onClick={() => {
              const contextId = config.storagePrefix + entityId;
              sessionStorage.setItem('bl-compose-to', JSON.stringify({ contextId, name }));
              window.location.href = messageHref;
            }}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-[color,background-color] duration-150 shadow-sm"
            title={`Send besked til ${firstName}`}
          >
            <Mail className="size-4" />
            <span>Skriv besked</span>
          </button>
        )}
      </div>

      {supportsMembersPanel && membersOpen && (
        <div className="mt-3.5 border-t border-border pt-3.5">
          {membersLoading && (
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Henter medlemmer...</span>
            </div>
          )}

          {!membersLoading && membersError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {membersError}
            </div>
          )}

          {!membersLoading && !membersError && members && members.length === 0 && (
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">Ingen medlemmer fundet.</div>
          )}

          {!membersLoading && !membersError && members && members.length > 0 && (
            <div className="findskema-card-grid mt-2">
              {sortedMembers.map((member) => {
                const fullName = `${member.firstName} ${member.lastName}`.trim();
                return (
                  <PersonCard
                    key={member.id}
                    id={member.id}
                    name={fullName}
                    classCode={member.classCode}
                    type={member.type}
                    href={getScheduleUrl(member.id, schoolId, { name: fullName })}
                    isStarred={isPersonStarred(member.id)}
                    onStarToggle={handleMemberStarToggle}
                    showPinButton={pinningEnabled}
                    onClick={() => handleMemberClick(member)}
                    schoolId={schoolId}
                    studentsMap={studentsMap}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Enlarged profile picture overlay */}
      {imageEnlarged && pictureUrl && (
        <button
          type="button"
          className="fixed inset-0 z-100 flex cursor-pointer items-center justify-center border-0 bg-black/60 p-0 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setImageEnlarged(false);
            }
          }}
        >
          <img
            src={pictureUrl}
            alt={name}
            className="max-w-[80vw] max-h-[80vh] rounded-xl shadow-2xl object-contain animate-in zoom-in-95 duration-200"
          />
        </button>
      )}
    </div>
  );
}
