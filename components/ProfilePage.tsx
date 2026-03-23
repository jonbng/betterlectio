import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Star,
  Mail,
  Cake,
  FileText,
  Instagram,
  GraduationCap,
  LayoutGrid,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UserPlus,
  Pencil,
} from 'lucide-react';
import { addRecentPerson, getScheduleUrl, isPersonStarred, toggleStarred } from '@/lib/findskema-storage';
import type { ScheduleEntityType } from '@/lib/profile-cache';
import { getLoggedInUserId } from '@/lib/profile-cache';
import { fetchMembersFromUrls, getMembersFetchUrlsFromDocument, type Member } from '@/lib/members-fetch';
import { fetchAvanceretSkemaDropdownItems } from '@/lib/findskema-cache';
import { getFindSkemaTypeKeyFromId } from '@/lib/findskema-types';
import { classGroupsMatch, transformYearBasedClassName } from '@/lib/class-name';
import { PersonCard } from './PersonCard';
import { getHoldHue, getFullHoldDisplayName } from '@/lib/hold-mapping';
import { cn } from '@/lib/utils';
import type { Tables } from '@/database.types';
import { useQuery, useMutation } from '@/lib/supabase/hooks';
import { useSchoolStudents, getStudentIdFromPersonId, formatDanishBirthdate } from '@/lib/supabase/student-lookup';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { Label } from './ui/label';

interface ProfilePageProps {
  name: string;
  subtitle?: string;
  pictureUrl: string | null;
  type: ScheduleEntityType;
  schoolId: string;
  entityId: string;
}

type MembersTab = 'klassekammerater' | 'laerere' | 'holdgrupper' | 'dokumenter';

interface MembersTabState {
  loading: boolean;
  error: string | null;
  items: Member[] | null;
}

interface HoldGroupItem {
  id: string;
  name: string;
  href: string;
}

type Student = Tables<'students'>;

// ── Hold extraction helpers ─────────────────────────────────────────────

/** Fetch the logged-in user's hold group items from their schedule page */
async function fetchMyHoldGroupItems(schoolId: string): Promise<Map<string, HoldGroupItem>> {
  const url = new URL(`/lectio/${schoolId}/SkemaNy.aspx`, window.location.origin).href;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return new Map();
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = parseHoldGroupItemsFromDOM(doc);
  return new Map(items.map(item => [item.id, item]));
}

function parseHoldGroupItemsFromDOM(doc: Document = document): HoldGroupItem[] {
  const container = doc.querySelector('#s_m_Content_Content_holdElementLinkList, #m_Content_Content_holdElementLinkList');
  if (!container) {
    return [];
  }

  const items = new Map<string, HoldGroupItem>();
  container.querySelectorAll<HTMLAnchorElement>('a[href*="type=holdelement"]').forEach((link) => {
    const name = link.textContent?.trim() || '';
    const href = new URL(link.getAttribute('href') || '', window.location.origin).toString();
    const url = new URL(href);
    const holdElementId = url.searchParams.get('holdelementid') || name;
    if (!name || items.has(holdElementId)) {
      return;
    }

    items.set(holdElementId, {
      id: holdElementId,
      name,
      href,
    });
  });

  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name, 'da'));
}

function getSubnavUrlByLabel(label: string, doc: Document = document): string | null {
  const link = [...doc.querySelectorAll<HTMLAnchorElement>('#s_m_HeaderContent_subnavigator_navigatortbl a, #m_HeaderContent_subnavigator_navigatortbl a')]
    .find(anchor => anchor.textContent?.trim() === label);

  if (!link) {
    return null;
  }

  return new URL(link.getAttribute('href') || '', window.location.origin).toString();
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
  const isDocumentsPage = /\/dokumentoversigt\.aspx$/i.test(window.location.pathname);
  const requestedTab = new URLSearchParams(window.location.search).get('bl-profile-tab');
  const initialTab = (() => {
    if (isDocumentsPage) return 'dokumenter' as const;
    if (requestedTab === 'klassekammerater' || requestedTab === 'laerere' || requestedTab === 'holdgrupper') {
      return requestedTab;
    }
    return 'skema' as const;
  })();
  const [activeTab, setActiveTab] = useState<'skema' | MembersTab>(initialTab);
  const [membersByTab, setMembersByTab] = useState<Record<MembersTab, MembersTabState>>({
    klassekammerater: { loading: false, error: null, items: null },
    laerere: { loading: false, error: null, items: null },
    holdgrupper: { loading: false, error: null, items: null },
    dokumenter: { loading: false, error: null, items: null },
  });
  const [, setMembersRerenderNonce] = useState(0);
  const classIdRef = useRef<string | null>(null);
  const [holdGroups, setHoldGroups] = useState<HoldGroupItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editInstagram, setEditInstagram] = useState('');
  const [editShowBirthday, setEditShowBirthday] = useState(false);

  // Supabase student data
  const { data: student, refetch: refetchStudent } = useQuery<Student>({
    schoolId,
    table: 'students',
    filters: [{ column: 'id', op: 'eq', value: entityId }],
    single: true,
  });
  const { studentsMap } = useSchoolStudents(schoolId);
  const loggedInId = getLoggedInUserId();
  const isOwnProfile = loggedInId === entityId;

  const { mutate: updateProfile, isLoading: saving } = useMutation({
    table: 'students',
    method: 'update',
    schoolId,
    onSuccess: () => {
      setEditing(false);
      refetchStudent();
    },
  });

  const config = ENTITY_CONFIG[type] || ENTITY_CONFIG.student;
  const hasBetterLectio = !!(student?.has_extension || student?.has_app);
  const displayName = student?.name || name;
  const firstName = displayName.split(' ')[0];
  const effectivePictureUrl = student?.custom_pfp_url || student?.lectio_pfp_url || pictureUrl;
  const canEnlargePicture = Boolean(effectivePictureUrl && hasBetterLectio);

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
  const supportsTeacherTab = isStudentWithClass;
  const supportsHoldGroupsTab = type === 'student';
  const documentsUrl = getSubnavUrlByLabel('Dokumenter');
  const scheduleUrl = getSubnavUrlByLabel('Skema') || getScheduleUrl(entityId, schoolId, { name: displayName });
  const supportsDocumentsTab = Boolean(documentsUrl);

  function buildProfileTabUrl(tab: 'skema' | MembersTab): string | undefined {
    if (!scheduleUrl) {
      return undefined;
    }

    const url = new URL(scheduleUrl, window.location.origin);
    if (tab === 'skema') {
      url.searchParams.delete('bl-profile-tab');
    } else {
      url.searchParams.set('bl-profile-tab', tab);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }

  useEffect(() => {
    if (!supportsHoldGroupsTab) {
      return;
    }

    const parse = () => {
      setHoldGroups(parseHoldGroupItemsFromDOM());
    };

    parse();
    const timer = window.setTimeout(parse, 250);
    return () => window.clearTimeout(timer);
  }, [supportsHoldGroupsTab]);

  // Mutual holds — compare viewed person's holdElementLinkList with our own
  const [mutualHolds, setMutualHolds] = useState<HoldGroupItem[]>([]);
  const [theirTotalHolds, setTheirTotalHolds] = useState(0);
  const mutualFetchedRef = useRef(false);
  useEffect(() => {
    if (mutualFetchedRef.current) return;
    mutualFetchedRef.current = true;

    (async () => {
      try {
        // Extract viewed person's holds from the holdElementLinkList in the current page DOM
        const theirItems = parseHoldGroupItemsFromDOM(document);
        if (theirItems.length === 0) return;
        setTheirTotalHolds(theirItems.length);

        // Fetch our own holds from our schedule page
        const myHoldsMap = await fetchMyHoldGroupItems(schoolId);
        if (myHoldsMap.size === 0) return;

        // Find intersection by holdelementid
        const mutual = theirItems.filter(item => myHoldsMap.has(item.id));
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
    const shouldShowOriginalContent = activeTab === 'skema' || (isDocumentsPage && activeTab === 'dokumenter');
    originalContent.style.display = shouldShowOriginalContent ? '' : 'none';
  }, [activeTab, isDocumentsPage]);

  useEffect(() => {
    if (!isDocumentsPage) {
      return;
    }

    const hideNewestDocumentsNode = () => {
      document.querySelectorAll<HTMLElement>('#il-original-content .TreeNode-title').forEach(title => {
        if (title.textContent?.trim() !== 'Nyeste dokumenter') {
          return;
        }

        const node = title.closest('[lec-role="treeviewnodecontainer"]') as HTMLElement | null;
        if (node) {
          node.style.display = 'none';
        }
      });
    };

    hideNewestDocumentsNode();
    const timer = window.setTimeout(hideNewestDocumentsNode, 250);
    return () => window.clearTimeout(timer);
  }, [isDocumentsPage]);

  async function resolveClassId(): Promise<string | null> {
    if (classIdRef.current) {
      return classIdRef.current;
    }

    const items = await fetchAvanceretSkemaDropdownItems(schoolId);
    const classItem = items.find(([itemName, itemId]) => {
      if (!itemId.startsWith('SC')) return false;
      if (getFindSkemaTypeKeyFromId(itemId) !== 'K') return false;
      const raw = itemName.trim();
      const transformed = transformYearBasedClassName(raw);
      if (transformed) {
        return classGroupsMatch(transformed.displayName, subtitle!.trim());
      }
      return classGroupsMatch(raw, subtitle!.trim()) || raw === subtitle!.trim();
    });

    if (!classItem) {
      return null;
    }

    classIdRef.current = classItem[1].replace(/^SC/, '');
    return classIdRef.current;
  }

  function setMembersTabState(tab: MembersTab, next: Partial<MembersTabState>) {
    setMembersByTab(prev => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        ...next,
      },
    }));
  }

  async function fetchMembersForTab(tab: MembersTab) {
    const currentState = membersByTab[tab];
    if (tab === 'holdgrupper' || tab === 'dokumenter') {
      return;
    }

    if (currentState.loading || currentState.items || (!supportsMembersPanel && tab === 'klassekammerater') || (!supportsTeacherTab && tab === 'laerere')) {
      return;
    }

    setMembersTabState(tab, { loading: true, error: null });

    try {
      let urls: string[] = [];

      if (tab === 'klassekammerater') {
        urls = getMembersFetchUrlsFromDocument(document, { showStudents: true, showTeachers: false });
      } else {
        urls = getMembersFetchUrlsFromDocument(document, { showStudents: false, showTeachers: true });
      }

      if (urls.length === 0 && isStudentWithClass) {
        const klasseId = await resolveClassId();
        if (!klasseId) {
          setMembersTabState(tab, {
            loading: false,
            error: tab === 'laerere' ? 'Kunne ikke finde klassens lærere.' : 'Kunne ikke finde klassen.',
          });
          return;
        }

        const membersUrl = new URL(`/lectio/${schoolId}/subnav/members.aspx`, window.location.origin);
        membersUrl.searchParams.set('klasseid', klasseId);
        membersUrl.searchParams.set(tab === 'laerere' ? 'showteachers' : 'showstudents', '1');
        membersUrl.searchParams.set('reporttype', 'withpics');
        urls = [membersUrl.href];
      }

      const fetchedMembers = await fetchMembersFromUrls(urls);
      const filteredMembers = fetchedMembers.filter(member => (tab === 'laerere' ? member.type === 'T' : member.type === 'S'));
      setMembersTabState(tab, { loading: false, error: null, items: filteredMembers });
    } catch {
      setMembersTabState(tab, {
        loading: false,
        error: tab === 'laerere' ? 'Kunne ikke hente lærere lige nu.' : 'Kunne ikke hente medlemmer lige nu.',
      });
    }
  }

  // Fetch members when switching tabs
  useEffect(() => {
    if (activeTab === 'skema' || activeTab === 'holdgrupper' || activeTab === 'dokumenter') {
      return;
    }
    void fetchMembersForTab(activeTab);
  }, [activeTab, supportsMembersPanel, supportsTeacherTab]);

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
    const currentMembers = activeTab === 'skema' ? null : membersByTab[activeTab].items;
    if (!currentMembers) return;
    const member = currentMembers.find(entry => entry.id === memberId);
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

  const currentMembers = activeTab === 'skema' ? null : membersByTab[activeTab].items;
  const sortedMembers = currentMembers
    ? [...currentMembers].sort((a, b) => {
        const nameA = `${a.firstName} ${a.lastName}`.trim();
        const nameB = `${b.firstName} ${b.lastName}`.trim();
        return nameA.localeCompare(nameB, 'da');
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
  const activeMembersState = activeTab === 'skema' || activeTab === 'holdgrupper' ? null : membersByTab[activeTab];
  const activeMembersLabel = activeTab === 'laerere' ? 'Lærere' : membersLabel;

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
          <button
            type="button"
            disabled={!canEnlargePicture}
            className={cn(
              'shrink-0 rounded-2xl overflow-hidden',
              hasBetterLectio
                ? 'w-[90px] h-[120px] ring-2 ring-border shadow-lg'
                : 'w-[60px] h-[80px] ring-1 ring-border/60',
              canEnlargePicture ? 'cursor-pointer hover:ring-primary/40 transition-all' : '',
              !effectivePictureUrl ? 'bg-muted flex items-center justify-center' : '',
            )}
            onClick={() => canEnlargePicture && setImageEnlarged(true)}
          >
            {effectivePictureUrl ? (
              <img src={effectivePictureUrl} alt={displayName} className="w-full h-full object-cover object-top" />
            ) : (
              <span className={cn(
                'font-semibold text-muted-foreground',
                hasBetterLectio ? 'text-4xl' : 'text-2xl',
              )}>
                {firstName.charAt(0).toUpperCase()}
              </span>
            )}
          </button>

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

            {hasBetterLectio ? (
              editing ? (
                /* ── Edit form ── */
                <div className="flex flex-col gap-4 max-w-md">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="bl-edit-desc" className="text-sm font-medium">Beskrivelse</Label>
                    <Input
                      id="bl-edit-desc"
                      value={editDescription}
                      onInput={(e) => setEditDescription((e.target as HTMLInputElement).value)}
                      maxLength={200}
                      placeholder="Skriv lidt om dig selv..."
                      className="text-sm"
                    />
                    <span className="text-xs text-muted-foreground text-right">{editDescription.length}/200</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="bl-edit-ig" className="text-sm font-medium">Instagram</Label>
                    <Input
                      id="bl-edit-ig"
                      value={editInstagram}
                      onInput={(e) => setEditInstagram((e.target as HTMLInputElement).value)}
                      placeholder="@brugernavn"
                      className="text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="bl-edit-bday"
                      checked={editShowBirthday}
                      onCheckedChange={(checked: boolean) => setEditShowBirthday(checked === true)}
                    />
                    <Label htmlFor="bl-edit-bday" className="text-sm cursor-pointer">Vis fødseldag på profil</Label>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() => {
                        updateProfile(
                          {
                            description: editDescription || null,
                            instagram: editInstagram || null,
                            show_birthday: editShowBirthday,
                          },
                          [{ column: 'id', op: 'eq', value: entityId }],
                        );
                      }}
                    >
                      {saving ? 'Gemmer...' : 'Gem'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => setEditing(false)}
                    >
                      Annuller
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <>
                  {/* Description */}
                  {student?.description && (
                    <p className="text-base text-muted-foreground leading-relaxed max-w-xl">
                      {student.description}
                    </p>
                  )}

                  {/* Info chips + edit button + mutual holds */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {student?.show_birthday && student?.birthdate && (
                      <InfoChip icon={Cake} label={formatDanishBirthdate(student.birthdate)} />
                    )}
                    {student?.instagram && (
                      <InfoChip icon={Instagram} label={student.instagram} href={`https://instagram.com/${student.instagram.replace('@', '')}`} />
                    )}
                    {subtitle && <InfoChip icon={GraduationCap} label={subtitle} />}

                    {isOwnProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditDescription(student?.description || '');
                          setEditInstagram(student?.instagram || '');
                          setEditShowBirthday(student?.show_birthday ?? false);
                          setEditing(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-muted/60 hover:bg-muted px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="size-3.5" />
                        Rediger profil
                      </button>
                    )}

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
                            {mutualHolds.map(item => (
                              <MutualHoldPill key={item.id} hold={item.name} />
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </>
              )
            ) : (
              <div className="flex items-start gap-3 mt-1 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <UserPlus className="size-5 text-muted-foreground/70 shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground leading-relaxed">
                  Denne elev har ikke BetterLectio endnu.
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
              href={isDocumentsPage ? buildProfileTabUrl('skema') : undefined}
              icon={Calendar}
              label="Skema"
            />
          {supportsMembersPanel && (
            <TabButton
              active={activeTab === 'klassekammerater'}
              onClick={() => setActiveTab('klassekammerater')}
              href={isDocumentsPage ? buildProfileTabUrl('klassekammerater') : undefined}
              icon={Users}
              label={membersLabel}
              count={membersByTab.klassekammerater.items?.length}
            />
          )}
          {supportsTeacherTab && (
            <TabButton
              active={activeTab === 'laerere'}
              onClick={() => setActiveTab('laerere')}
              href={isDocumentsPage ? buildProfileTabUrl('laerere') : undefined}
              icon={GraduationCap}
              label="Lærere"
              count={membersByTab.laerere.items?.length}
            />
          )}
          {supportsHoldGroupsTab && (
            <TabButton
              active={activeTab === 'holdgrupper'}
              onClick={() => setActiveTab('holdgrupper')}
              href={isDocumentsPage ? buildProfileTabUrl('holdgrupper') : undefined}
              icon={LayoutGrid}
              label="Hold & grupper"
              count={holdGroups.length || undefined}
            />
          )}
          {supportsDocumentsTab && (
            <TabButton
              active={activeTab === 'dokumenter'}
              onClick={() => setActiveTab('dokumenter')}
              href={documentsUrl ?? undefined}
              icon={FileText}
              label="Dokumenter"
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
      {activeTab !== 'skema' && ((activeTab === 'klassekammerater' && supportsMembersPanel) || (activeTab === 'laerere' && supportsTeacherTab)) && (
        <div className="px-6 py-5">
          {activeMembersState?.loading && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Henter {activeMembersLabel.toLowerCase()}...</span>
            </div>
          )}

          {!activeMembersState?.loading && activeMembersState?.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {activeMembersState.error}
            </div>
          )}

          {!activeMembersState?.loading && !activeMembersState?.error && activeMembersState?.items && activeMembersState.items.length === 0 && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              Ingen {activeMembersLabel.toLowerCase()} fundet.
            </div>
          )}

          {!activeMembersState?.loading && !activeMembersState?.error && activeMembersState?.items && activeMembersState.items.length > 0 && (
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
                    hasBetterLectio={(() => {
                      const sid = getStudentIdFromPersonId(member.id);
                      if (!sid || !studentsMap) return false;
                      const s = studentsMap.get(sid);
                      return !!(s?.has_extension || s?.has_app);
                    })()}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'holdgrupper' && supportsHoldGroupsTab && (
        <div className="px-6 py-5">
          {holdGroups.length === 0 ? (
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              Ingen hold eller grupper fundet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {holdGroups.map(item => {
                const hue = getHoldHue(item.name);
                const displayName = getFullHoldDisplayName(item.name) || item.name;

                return (
                  <a
                    key={item.id}
                    href={item.href}
                    className="group rounded-2xl border border-border bg-gradient-to-br from-background via-background to-muted/40 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `oklch(0.95 0.06 ${hue})`,
                          color: `oklch(0.45 0.14 ${hue})`,
                        }}
                      >
                        <LayoutGrid className="size-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                            {displayName !== item.name && (
                              <div className="mt-1 truncate text-xs text-muted-foreground">{item.name}</div>
                            )}
                          </div>

                          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}


      {/* Enlarged profile picture overlay */}
      {imageEnlarged && effectivePictureUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/60 z-100 flex items-center justify-center cursor-pointer backdrop-blur-sm"
          onClick={event => {
            if (event.target === event.currentTarget) {
              setImageEnlarged(false);
            }
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setImageEnlarged(false);
            }
          }}
        >
          <img
            src={effectivePictureUrl}
            alt={displayName}
            className="max-w-[80vw] max-h-[80vh] rounded-xl shadow-2xl object-contain animate-in zoom-in-95 duration-200"
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
  href,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  href?: string;
  icon: typeof Calendar;
  label: string;
  count?: number;
}) {
  const className = cn(
    'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
    active
      ? 'text-foreground'
      : 'text-muted-foreground hover:text-foreground',
  );

  const content = (
    <>
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
    </>
  );

  if (href) {
    return (
      <button
        type="button"
        onClick={() => {
          onClick();
          window.location.href = href;
        }}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
    >
      {content}
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
