import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Star,
  Mail,
  Cake,
  Instagram,
  GraduationCap,
  Users,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { addRecentPerson, getScheduleUrl, isPersonStarred, toggleStarred } from '@/lib/findskema-storage';
import type { ScheduleEntityType } from '@/lib/profile-cache';
import { fetchMembersFromUrls, getMembersFetchUrlsFromDocument, type Member } from '@/lib/members-fetch';
import { fetchAvanceretSkemaDropdownItems } from '@/lib/findskema-cache';
import { getFindSkemaTypeKeyFromId } from '@/lib/findskema-types';
import { PersonCard } from './PersonCard';
import { getHoldHue, getFullHoldDisplayName } from '@/lib/hold-mapping';
import { cn } from '@/lib/utils';

interface ProfilePageProps {
  name: string;
  subtitle?: string;
  pictureUrl: string | null;
  type: ScheduleEntityType;
  schoolId: string;
  entityId: string;
}

// ── Example profile data (hardcoded for specific users) ─────────────────

interface ExampleProfileData {
  displayName: string;
  description: string;
  birthdate: string;
  instagram: string;
  studieretning: string;
}

const EXAMPLE_PROFILES: Record<string, ExampleProfileData> = {
  '72721770937': {
    // Elliott Friedrich
    displayName: 'Elliott Friedrich',
    description: 'BetterLectio Founder & Programmør',
    birthdate: '28. feb 2008',
    instagram: '@elliottinnz',
    studieretning: 'Mat/Fys',
  },
  '72721772841': {
    // Jonathan Bangert
    displayName: 'Jonathan Bangert',
    description: 'BetterLectio Founder & Programmør',
    birthdate: '9. jan 2008',
    instagram: '@jonathan.bangert',
    studieretning: 'Mat/Fys',
  },
};

function getExampleProfile(entityId: string): ExampleProfileData | null {
  return EXAMPLE_PROFILES[entityId] || null;
}

// ── Hold extraction helpers ─────────────────────────────────────────────

/** Extract unique hold codes from schedule bricks in a document/element */
function extractHoldCodesFromDOM(root: Document | Element): Set<string> {
  const holds = new Set<string>();
  root.querySelectorAll('[data-tooltip]').forEach(el => {
    const tooltip = el.getAttribute('data-tooltip') || '';
    const holdLine = tooltip.match(/^Hold:\s*(.+)$/m);
    if (holdLine) {
      holdLine[1].split(',').map(h => h.trim()).filter(Boolean).forEach(h => holds.add(h));
    }
  });
  return holds;
}

/** Fetch a schedule page and extract hold codes from it */
async function fetchHoldCodesFromUrl(url: string): Promise<Set<string>> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return new Set();
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractHoldCodesFromDOM(doc);
}

/** Get the current user's hold codes by fetching their schedule (current + prev + next week) */
async function fetchMyHoldCodes(schoolId: string): Promise<Set<string>> {
  const base = new URL(`/lectio/${schoolId}/SkemaNy.aspx`, window.location.origin).href;

  // Fetch current week first (most important), then prev/next in parallel
  const currentHolds = await fetchHoldCodesFromUrl(base);

  // Extract prev/next week URLs from the fetched page's nav links
  // Use week param based on current date
  const now = new Date();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const prevDate = new Date(now.getTime() - oneWeek);
  const nextDate = new Date(now.getTime() + oneWeek);

  // Lectio week format: WWYYYY (ISO week number + year)
  function getWeekParam(d: Date): string {
    // ISO week calculation
    const tmp = new Date(d.getTime());
    tmp.setHours(0, 0, 0, 0);
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
    const week1 = new Date(tmp.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${weekNum}${tmp.getFullYear()}`;
  }

  const [prevHolds, nextHolds] = await Promise.all([
    fetchHoldCodesFromUrl(`${base}?week=${getWeekParam(prevDate)}`).catch(() => new Set<string>()),
    fetchHoldCodesFromUrl(`${base}?week=${getWeekParam(nextDate)}`).catch(() => new Set<string>()),
  ]);

  const all = new Set(currentHolds);
  prevHolds.forEach(h => all.add(h));
  nextHolds.forEach(h => all.add(h));
  return all;
}

// ── Week navigation helpers ─────────────────────────────────────────────

interface WeekNav {
  prevHref: string | null;
  nextHref: string | null;
  weekLabel: string;
  isCurrentWeek: boolean;
  todayHref: string | null;
}

function extractWeekNav(): WeekNav {
  const prevLink = document.getElementById('s_m_Content_Content_SkemaMedNavigation_datePicker_prevLnk') as HTMLAnchorElement | null;
  const nextLink = document.getElementById('s_m_Content_Content_SkemaMedNavigation_datePicker_nextLnk') as HTMLAnchorElement | null;
  const weekInput = document.getElementById('s_m_Content_Content_SkemaMedNavigation_datePicker_tb') as HTMLInputElement | null;
  const todayBtn = document.querySelector('.il-today-btn a') as HTMLAnchorElement | null;

  // Parse "Uge 12 (16/3-22/3) 2026" → "Uge 12"
  const rawLabel = weekInput?.value || '';
  const weekMatch = rawLabel.match(/^(Uge\s+\d+)/);
  const weekLabel = weekMatch ? weekMatch[1] : rawLabel;

  // Lectio's "I dag" link: when on current week it has disabled + no href attr.
  // When not on current week it has href attr + no disabled.
  const hasHref = todayBtn?.hasAttribute('href') === true;
  const todayHref = hasHref ? todayBtn!.getAttribute('href') : null;
  const isCurrentWeek = !hasHref;

  return {
    prevHref: prevLink?.href || null,
    nextHref: nextLink?.href || null,
    weekLabel,
    isCurrentWeek,
    todayHref: isCurrentWeek ? null : todayHref,
  };
}

// ── Badge config ────────────────────────────────────────────────────────

const ENTITY_CONFIG: Record<string, {
  label: string;
  storagePrefix: string;
}> = {
  student: { label: 'Elev', storagePrefix: 'S' },
  teacher: { label: 'Lærer', storagePrefix: 'T' },
};

// ── Main component ──────────────────────────────────────────────────────

export function ProfilePage({
  name,
  subtitle,
  pictureUrl,
  type,
  schoolId,
  entityId,
}: ProfilePageProps) {
  const [imageEnlarged, setImageEnlarged] = useState(false);
  const [starred, setStarred] = useState(() => isPersonStarred(entityId));
  const [activeTab, setActiveTab] = useState<'skema' | 'klassekammerater'>('skema');
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [, setMembersRerenderNonce] = useState(0);
  const membersFetchedRef = useRef(false);

  const config = ENTITY_CONFIG[type] || ENTITY_CONFIG.student;
  const exampleProfile = getExampleProfile(entityId);
  const hasBetterLectio = exampleProfile !== null;
  const displayName = exampleProfile?.displayName || name;
  const firstName = displayName.split(' ')[0];

  // Navigation context
  const urlParams = new URLSearchParams(window.location.search);
  const fromFindSkema = urlParams.get('from') === 'findskema';
  const searchQuery = urlParams.get('q') || '';
  const backUrl = fromFindSkema
    ? `/lectio/${schoolId}/FindSkema.aspx${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ''}`
    : `/lectio/${schoolId}/SkemaNy.aspx`;
  const backText = fromFindSkema ? 'Tilbage til søgning' : 'Tilbage til dit skema';

  // Members panel support
  const membersFetchUrls = getMembersFetchUrlsFromDocument();
  const hasSubnavMembers = membersFetchUrls.length > 0;
  const isStudentWithClass = type === 'student' && !!subtitle;
  const supportsMembersPanel = hasSubnavMembers || isStudentWithClass;

  // Mutual holds — compare viewed person's schedule with our own
  const [mutualHolds, setMutualHolds] = useState<string[]>([]);
  const [theirTotalHolds, setTheirTotalHolds] = useState(0);
  const mutualFetchedRef = useRef(false);
  useEffect(() => {
    if (mutualFetchedRef.current) return;
    mutualFetchedRef.current = true;

    (async () => {
      try {
        // Extract viewed person's holds from the current page DOM
        const originalContent = document.getElementById('il-original-content');
        if (!originalContent) return;

        // Wait a tick for DOM to be populated
        await new Promise(r => setTimeout(r, 300));

        const theirHolds = extractHoldCodesFromDOM(originalContent);
        if (theirHolds.size === 0) return;
        setTheirTotalHolds(theirHolds.size);

        // Fetch our own holds
        const myHolds = await fetchMyHoldCodes(schoolId);
        if (myHolds.size === 0) return;

        // Find intersection
        const mutual = [...theirHolds].filter(h => myHolds.has(h));
        if (mutual.length > 0) setMutualHolds(mutual);
      } catch {
        // Silent fail — mutual holds are a nice-to-have
      }
    })();
  }, [schoolId]);

  // If most of their holds are mutual, they're in the same class
  const isSameClass = theirTotalHolds > 0 && mutualHolds.length >= theirTotalHolds * 0.6;

  // Week navigation — extracted from Lectio DOM (deferred to let DOM settle)
  const [weekNav, setWeekNav] = useState<WeekNav>({ prevHref: null, nextHref: null, weekLabel: '', isCurrentWeek: true, todayHref: null });
  const weekNavExtracted = useRef(false);
  useEffect(() => {
    if (weekNavExtracted.current) return;
    // Try immediately, then retry after a short delay for late DOM
    const extract = () => {
      const nav = extractWeekNav();
      if (nav.weekLabel) {
        setWeekNav(nav);
        weekNavExtracted.current = true;
        return true;
      }
      return false;
    };
    if (!extract()) {
      const timer = setTimeout(extract, 200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Hide/show original content based on active tab
  useEffect(() => {
    const originalContent = document.getElementById('il-original-content');
    if (!originalContent) return;
    originalContent.style.display = activeTab === 'skema' ? '' : 'none';
  }, [activeTab]);

  // Fetch members when switching to klassekammerater tab
  useEffect(() => {
    if (activeTab !== 'klassekammerater' || !supportsMembersPanel || membersFetchedRef.current) return;
    membersFetchedRef.current = true;

    setMembersLoading(true);
    setMembersError(null);

    (async () => {
      try {
        let urls = membersFetchUrls;

        if (urls.length === 0 && isStudentWithClass) {
          const items = await fetchAvanceretSkemaDropdownItems(schoolId);
          const classItem = items.find(([itemName, itemId]) => {
            if (!itemId.startsWith('SC')) return false;
            if (getFindSkemaTypeKeyFromId(itemId) !== 'K') return false;
            const raw = itemName.trim();
            const yearMatch = raw.match(/^(\d{4})([a-zA-Z](?:\s+\d+)?)$/);
            if (yearMatch) {
              const startYear = parseInt(yearMatch[1], 10);
              const now = new Date();
              const currentYear = now.getFullYear();
              const schoolStartYear = now.getMonth() >= 7 ? currentYear : currentYear - 1;
              const grade = schoolStartYear - startYear + 1;
              if (grade >= 1 && grade <= 3) return `${grade}${yearMatch[2]}` === subtitle!.trim();
            }
            return raw === subtitle!.trim();
          });
          if (classItem) {
            const klasseId = classItem[1].replace(/^SC/, '');
            const membersUrl = new URL(`/lectio/${schoolId}/subnav/members.aspx`, window.location.origin);
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
      } catch {
        setMembersError('Kunne ikke hente medlemmer lige nu.');
      } finally {
        setMembersLoading(false);
      }
    })();
  }, [activeTab, supportsMembersPanel]);

  const handleToggleStar = () => {
    const newStarred = toggleStarred({
      id: entityId,
      name,
      classCode: subtitle || '',
      type: config.storagePrefix,
    });
    setStarred(newStarred);
  };

  const handleMemberStarToggle = (memberId: string) => {
    if (!members) return;
    const member = members.find(entry => entry.id === memberId);
    if (!member) return;
    const fullName = `${member.firstName} ${member.lastName}`.trim();
    toggleStarred({ id: member.id, name: fullName, classCode: member.classCode, type: member.type });
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

  // Close enlarged image on Escape
  useEffect(() => {
    if (!imageEnlarged) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setImageEnlarged(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [imageEnlarged]);

  const messageHref = `/lectio/${schoolId}/beskeder2.aspx?mappeid=-70`;
  const membersLabel = isStudentWithClass && !hasSubnavMembers ? 'Klassekammerater' : 'Medlemmer';

  return (
    <div className="bg-card">
      {/* Back navigation */}
      <div className="px-6 pt-3 pb-0">
        <a
          href={backUrl}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          <span>{backText}</span>
        </a>
      </div>

      {/* Profile hero */}
      <div className="px-6 pt-3 pb-4">
        <div className="flex gap-6 items-start">
          {/* Picture — larger for BL users, smaller for non-BL */}
          <div
            className={cn(
              'shrink-0 rounded-2xl overflow-hidden',
              hasBetterLectio
                ? 'w-[90px] h-[120px] ring-2 ring-border shadow-lg'
                : 'w-[60px] h-[80px] ring-1 ring-border/60',
              pictureUrl && hasBetterLectio ? 'cursor-pointer hover:ring-primary/40 transition-all' : '',
              !pictureUrl ? 'bg-muted flex items-center justify-center' : '',
            )}
            onClick={() => pictureUrl && hasBetterLectio && setImageEnlarged(true)}
          >
            {pictureUrl ? (
              <img src={pictureUrl} alt={displayName} className="w-full h-full object-cover object-top" />
            ) : (
              <span className={cn(
                'font-semibold text-muted-foreground',
                hasBetterLectio ? 'text-4xl' : 'text-2xl',
              )}>
                {firstName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* Name + actions */}
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h1 className={cn(
                  'font-bold tracking-tight text-foreground leading-tight truncate',
                  hasBetterLectio ? 'text-3xl' : 'text-2xl',
                )}>
                  {displayName}
                </h1>
                <div className="flex items-center gap-2.5 mt-1">
                  {subtitle && (
                    <span className="text-base font-medium text-muted-foreground">{subtitle}</span>
                  )}
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-primary/10 text-primary">
                    {config.label}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {hasBetterLectio && (
                  <button
                    type="button"
                    onClick={handleToggleStar}
                    className="p-2.5 rounded-xl hover:bg-accent transition-colors"
                    title={starred ? 'Fjern fra favoritter' : 'Tilføj til favoritter'}
                  >
                    <Star
                      className={cn(
                        'size-5 transition-colors',
                        starred
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground hover:text-yellow-400',
                      )}
                    />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const contextId = config.storagePrefix + entityId;
                    sessionStorage.setItem('bl-compose-to', JSON.stringify({ contextId, name }));
                    window.location.href = messageHref;
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                  title={`Send besked til ${firstName}`}
                >
                  <Mail className="size-4" />
                  <span>Skriv besked</span>
                </button>
              </div>
            </div>

            {hasBetterLectio && exampleProfile ? (
              <>
                {/* Description */}
                <p className="text-base text-muted-foreground leading-relaxed max-w-xl">
                  {exampleProfile.description}
                </p>

                {/* Info chips + mutual holds */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <InfoChip icon={Cake} label={exampleProfile.birthdate} />
                  <InfoChip icon={Instagram} label={exampleProfile.instagram} href={`https://instagram.com/${exampleProfile.instagram.replace('@', '')}`} />
                  {subtitle && <InfoChip icon={GraduationCap} label={subtitle} />}
                  <InfoChip icon={BookOpen} label={exampleProfile.studieretning} />

                  {mutualHolds.length > 0 && (
                    <>
                      <span className="w-px h-5 bg-border" />
                      {isSameClass ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 text-primary px-3 py-1 text-sm font-medium">
                          <Users className="size-3.5" />
                          I samme klasse
                        </span>
                      ) : (
                        <>
                          <span className="text-xs font-semibold text-primary">
                            Fælles hold
                          </span>
                          {mutualHolds.map(hold => (
                            <MutualHoldPill key={hold} hold={hold} />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3 mt-1 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <UserPlus className="size-5 text-muted-foreground/70 shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground leading-relaxed">
                  Det kommer snart at man kan ændre sin profil med navn, billede, beskrivelse og Instagram.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar with week navigation */}
      <div className="border-t border-border px-6 flex items-center">
        {/* Tabs (left) */}
        <div className="flex">
          <TabButton
            active={activeTab === 'skema'}
            onClick={() => setActiveTab('skema')}
            icon={Calendar}
            label="Skema"
          />
          {supportsMembersPanel && (
            <TabButton
              active={activeTab === 'klassekammerater'}
              onClick={() => setActiveTab('klassekammerater')}
              icon={Users}
              label={membersLabel}
              count={members?.length}
            />
          )}
        </div>

        {/* Week switcher (right) — only visible on skema tab */}
        {activeTab === 'skema' && weekNav.weekLabel && (
          <div className="ml-auto flex items-center gap-1">
            {weekNav.prevHref && (
              <a
                href={weekNav.prevHref}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Forrige uge"
              >
                <ChevronLeft className="size-4" />
              </a>
            )}

            {weekNav.isCurrentWeek ? (
              <span className="text-sm font-medium tabular-nums px-1.5 select-none text-foreground">
                {weekNav.weekLabel}
              </span>
            ) : (
              <a
                href={weekNav.todayHref || '#'}
                className="text-sm font-medium tabular-nums px-1.5 text-primary/70 hover:text-primary transition-colors"
                title="Gå til denne uge"
              >
                {weekNav.weekLabel}
              </a>
            )}

            {weekNav.nextHref && (
              <a
                href={weekNav.nextHref}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Næste uge"
              >
                <ChevronRight className="size-4" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Members content */}
      {activeTab === 'klassekammerater' && supportsMembersPanel && (
        <div className="px-6 py-5">
          {membersLoading && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Henter {membersLabel.toLowerCase()}...</span>
            </div>
          )}

          {!membersLoading && membersError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {membersError}
            </div>
          )}

          {!membersLoading && !membersError && members && members.length === 0 && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              Ingen {membersLabel.toLowerCase()} fundet.
            </div>
          )}

          {!membersLoading && !membersError && members && members.length > 0 && (
            <div className="findskema-card-grid">
              {sortedMembers.map(member => {
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
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Calendar;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
      {count != null && (
        <span className={cn(
          'text-xs tabular-nums rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center',
          active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          {count}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

function InfoChip({ icon: Icon, label, href }: { icon: typeof Cake; label: string; href?: string }) {
  const cls = "inline-flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-muted-foreground";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cn(cls, 'hover:bg-muted/70 hover:text-foreground transition-colors')}>
        <Icon className="size-4 shrink-0" />
        <span>{label}</span>
      </a>
    );
  }
  return (
    <div className={cls}>
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

function MutualHoldPill({ hold }: { hold: string }) {
  const parts = hold.split(' ');
  const holdCode = parts.length >= 2 ? parts.slice(1).join(' ') : hold;
  const hue = getHoldHue(holdCode);
  const friendlyName = getFullHoldDisplayName(hold);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl ring-1 ring-primary/30 bg-primary/10 text-primary px-2.5 py-1 text-sm font-medium">
      <span
        className="size-2 rounded-full shrink-0"
        style={{ backgroundColor: `oklch(0.65 0.15 ${hue})` }}
      />
      {friendlyName}
    </span>
  );
}
