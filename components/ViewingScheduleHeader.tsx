import { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Star, School, DoorOpen, Box, UsersRound, LayoutGrid, GraduationCap, Users, ChevronDown, Loader2 } from 'lucide-react';
import { addRecentPerson, getScheduleUrl, isPersonStarred, toggleStarred } from '@/lib/findskema-storage';
import type { ScheduleEntityType } from '@/lib/profile-cache';
import { fetchMembersFromUrls, getMembersFetchUrlsFromDocument, type Member } from '@/lib/members-fetch';
import { PersonCard } from './PersonCard';

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
    bgClass: 'bg-blue-100 dark:bg-blue-900',
    textClass: 'text-blue-700 dark:text-blue-300',
    icon: Users,
    storagePrefix: 'S',
  },
  teacher: {
    label: 'Lærer',
    bgClass: 'bg-emerald-100 dark:bg-emerald-900',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    icon: GraduationCap,
    storagePrefix: 'T',
  },
  class: {
    label: 'Klasse',
    bgClass: 'bg-purple-100 dark:bg-purple-900',
    textClass: 'text-purple-700 dark:text-purple-300',
    icon: School,
    storagePrefix: 'K',
  },
  room: {
    label: 'Lokale',
    bgClass: 'bg-amber-100 dark:bg-amber-900',
    textClass: 'text-amber-700 dark:text-amber-300',
    icon: DoorOpen,
    storagePrefix: 'L',
  },
  resource: {
    label: 'Ressource',
    bgClass: 'bg-slate-100 dark:bg-slate-800',
    textClass: 'text-slate-700 dark:text-slate-300',
    icon: Box,
    storagePrefix: 'R',
  },
  hold: {
    label: 'Hold',
    bgClass: 'bg-cyan-100 dark:bg-cyan-900',
    textClass: 'text-cyan-700 dark:text-cyan-300',
    icon: UsersRound,
    storagePrefix: 'H',
  },
  group: {
    label: 'Gruppe',
    bgClass: 'bg-pink-100 dark:bg-pink-900',
    textClass: 'text-pink-700 dark:text-pink-300',
    icon: LayoutGrid,
    storagePrefix: 'G',
  },
  holdelement: {
    label: 'Hold',
    bgClass: 'bg-indigo-100 dark:bg-indigo-900',
    textClass: 'text-indigo-700 dark:text-indigo-300',
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
  const firstName = name.split(' ')[0];

  const config = ENTITY_CONFIG[type];
  const TypeIcon = config.icon;
  const hasPicture = type === 'student' || type === 'teacher';
  const membersFetchUrls = getMembersFetchUrlsFromDocument();
  const supportsMembersPanel = membersFetchUrls.length > 0;

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
      const fetchedMembers = await fetchMembersFromUrls(membersFetchUrls);
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
    <div className="bg-muted/50 border-b border-border px-4 py-3">
      <div className="flex items-center gap-4">
        <a
          href={backUrl}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
            <button
              type="button"
              onClick={handleToggleStar}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              title={starred ? 'Fjern fra favoritter' : 'Tilføj til favoritter'}
            >
              <Star
                className={`size-5 transition-colors ${
                  starred
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-muted-foreground hover:text-yellow-400'
                }`}
              />
            </button>

            {supportsMembersPanel && (
              <button
                type="button"
                onClick={handleToggleMembers}
                className="il-viewing-members-toggle"
                aria-expanded={membersOpen}
                title="Vis medlemmer"
              >
                <Users className="size-4" />
                <span>Medlemmer</span>
                <ChevronDown className={`size-4 transition-transform ${membersOpen ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {supportsMembersPanel && membersOpen && (
        <div className="il-viewing-members-panel">
          {membersLoading && (
            <div className="il-viewing-members-status">
              <Loader2 className="size-4 animate-spin" />
              <span>Henter medlemmer...</span>
            </div>
          )}

          {!membersLoading && membersError && (
            <div className="il-viewing-members-status il-viewing-members-error">
              {membersError}
            </div>
          )}

          {!membersLoading && !membersError && members && members.length === 0 && (
            <div className="il-viewing-members-status">Ingen medlemmer fundet.</div>
          )}

          {!membersLoading && !membersError && members && members.length > 0 && (
            <div className="findskema-card-grid il-viewing-members-grid">
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
                    onClick={() => handleMemberClick(member)}
                    schoolId={schoolId}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Enlarged profile picture overlay */}
      {imageEnlarged && pictureUrl && (
        <div
          className="fixed inset-0 bg-black/60 z-100 flex items-center justify-center cursor-pointer backdrop-blur-sm"
          onClick={() => setImageEnlarged(false)}
        >
          <img
            src={pictureUrl}
            alt={name}
            className="max-w-[80vw] max-h-[80vh] rounded-xl shadow-2xl object-contain animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
