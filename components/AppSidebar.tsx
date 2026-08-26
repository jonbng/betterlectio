import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { reset as resetPostHog } from '@/lib/posthog';
import { markLogoutIntent } from '@/lib/logout-tracking';
import {
  Calendar,
  FileText,
  BookOpen,
  MessageSquare,
  GraduationCap,
  Clock,
  ClipboardList,
  Library,
  FolderOpen,
  HelpCircle,
  Home,
  LogOut,
  User,
  ChevronUp,
  ChevronRight,
  Search,
  ListChecks,
  CalendarDays,
  Users,
  GraduationCap as Teacher,
  School,
  DoorOpen,
  Box,
  UsersRound,
  LayoutGrid,
  FileSearch,
  BookMarked,
  Settings,
  Sun,
  Moon,
  EyeOff,
  Calculator,
  Smartphone,
} from 'lucide-react';
import { Avatar, FallbackAvatarImage, AvatarFallback } from '@/components/ui/avatar';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { clearLoginState } from '@/lib/profile-cache';
import { getCachedSchoolDisplayName, cacheSchoolDisplayName } from '@/lib/school-storage';
import { getSettings, updateSetting } from '@/lib/settings-storage';
import { getCachedPageHasData, getPageHasData } from '@/lib/page-data-cache';
import { getUnreadCount, getCachedUnreadCount, hasNotificationDot } from '@/lib/unread-messages';
import { armBypass } from '@/lib/bypass-redesigns';
import { captureBypassEngaged } from '@/lib/bypass-analytics';
import { MOBILE_APP_INVITE_OPEN_EVENT } from '@/components/MobileAppInvitePopup';
import { toast } from 'sonner';
import { useQuery } from '@/lib/supabase/hooks';
import { getPreferredStudentDisplayName, getPreferredStudentPictureUrl, type Student } from '@/lib/supabase/student-lookup';
import { ScheduleCountdown } from './ScheduleCountdown';
import { SupabaseAuthDot } from './SupabaseAuthDot';

function getSchoolIdFromUrl(): string {
  const match = window.location.pathname.match(/\/lectio\/(\d+)\//);
  return match ? match[1] : '94';
}

function getCurrentPage(): string {
  return window.location.pathname.split('/').pop()?.replace('.aspx', '').toLowerCase() || '';
}

function getSchoolNameFromPage(): string | null {
  // Try meta tag first (format: "Lectio- School Name")
  const meta = document.querySelector('meta[name="application-name"]');
  if (meta) {
    const content = meta.getAttribute('content') || '';
    const match = content.match(/^Lectio-\s*(.+)$/);
    if (match) return match[1];
  }
  // Fallback to title (format: "... - Lectio - School Name")
  const titleMatch = document.title.match(/ - Lectio - (.+)$/);
  if (titleMatch) return titleMatch[1];
  // Last resort
  const el = document.querySelector('.ls-master-header-institution-name');
  return el?.textContent?.trim() || null;
}

function getSchoolInfo(): { id: string; name: string } {
  const cached = getCachedProfile();
  const id = cached?.schoolId || getSchoolIdFromUrl();
  // Prefer the Supabase display name mirror (sync localStorage) so the
  // sidebar renders the curated school label instantly on every page load,
  // with the Lectio meta tag / page title as a first-ever-load fallback.
  const name =
    getCachedSchoolDisplayName(id) ||
    cached?.schoolName ||
    getSchoolNameFromPage() ||
    'Lectio';
  return { id, name };
}

interface CachedProfile {
  name: string;
  fullName: string;
  className: string;
  pictureUrl: string | null;
  studentId: string | null;
  schoolId: string | null;
  schoolName: string | null;
}

function getCachedProfile(): CachedProfile | null {
  return (window as any).__IL_CACHED_PROFILE__ || null;
}

function getProfilePicture(): string | null {
  // Try immediate extraction first
  const immediate = (window as any).__IL_PROFILE_PIC__;
  if (immediate) return immediate;

  // Fall back to cached
  const cached = getCachedProfile();
  return cached?.pictureUrl || null;
}

function getUserName(): string {
  // First check if we're on a page with another student's info
  const hasOtherUserId = window.location.search.includes('elevid=') ||
                         window.location.search.includes('laererid=');

  // If we're viewing another user, always use cached data
  if (hasOtherUserId) {
    const cached = getCachedProfile();
    if (cached?.name) return cached.name;
  }

  // Try to parse from title: "Eleven Name, 1x - Skema" or "Eleven Name(k), 1x - Skema"
  const titleMatch = document.title.match(/^Eleven\s+(.+?)(?:\([^)]+\))?,\s/);
  if (titleMatch) {
    const fullName = titleMatch[1].trim();
    return fullName.split(' ')[0];
  }

  // Fallback to DOM element
  const el = document.querySelector('.ls-user-name');
  if (el?.textContent?.trim()) {
    return el.textContent.trim().split(' ')[0];
  }

  // Final fallback to cached
  const cached = getCachedProfile();
  return cached?.name || 'Bruger';
}

function getUserClass(): string {
  // First check if we're on a page with another student's info
  const hasOtherUserId = window.location.search.includes('elevid=') ||
                         window.location.search.includes('laererid=');

  // If we're viewing another user, always use cached data
  if (hasOtherUserId) {
    const cached = getCachedProfile();
    if (cached?.className) return cached.className;
  }

  // Try to parse from title: "Eleven Name, 1x - Skema" or "Eleven Name(k), 1x - Skema"
  const titleMatch = document.title.match(/^Eleven\s+.+?(?:\([^)]+\))?,\s*(\S+)\s*-/);
  if (titleMatch) {
    return titleMatch[1];
  }

  // Fallback to DOM element
  const el = document.querySelector('.ls-user-class');
  if (el?.textContent?.trim()) {
    return el.textContent.trim();
  }

  // Final fallback to cached
  const cached = getCachedProfile();
  return cached?.className || '';
}


export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation();

  const navMain = [
    { title: t('sidebar.nav.forside'), icon: Home, page: 'forside', settingKey: 'showForside' as const },
    { title: t('sidebar.nav.skema'), icon: Calendar, page: 'skemany', settingKey: 'showSkema' as const },
    { title: t('sidebar.nav.elever'), icon: Users, page: 'FindSkema', settingKey: 'showElever' as const },
    { title: t('sidebar.nav.opgaver'), icon: FileText, page: 'opgaverelev', settingKey: 'showOpgaver' as const },
    { title: t('sidebar.nav.lektier'), icon: BookOpen, page: 'material_lektieoversigt', settingKey: 'showLektier' as const },
    { title: t('sidebar.nav.fravaer'), icon: Clock, page: 'subnav/fravaerelev_fravaersaarsager', settingKey: 'showFravaer' as const },
    { title: t('sidebar.nav.beskeder'), icon: MessageSquare, page: 'beskeder2', settingKey: 'showBeskeder' as const },
  ];

  const navSecondary: Array<{
    title: string;
    icon: typeof GraduationCap;
    page: string;
    settingKey: 'showKarakterer' | 'showDokumenter' | 'showModulregnskaber' | 'showLokaler' | 'showStudieplan' | 'showSpoergeskema';
    href?: string;
    activeMatch?: () => boolean;
  }> = [
    { title: t('sidebar.nav.karakterer'), icon: GraduationCap, page: 'grades/grade_report', settingKey: 'showKarakterer' },
    { title: t('sidebar.nav.dokumenter'), icon: FolderOpen, page: 'dokumentoversigt', settingKey: 'showDokumenter' },
    {
      title: t('sidebar.nav.modulregnskaber'),
      icon: Calculator,
      page: 'modulregnskaber',
      settingKey: 'showModulregnskaber',
      href: `/lectio/${getSchoolIdFromUrl()}/forside.aspx?bl=modulregnskaber`,
      activeMatch: () =>
        window.location.pathname.toLowerCase().includes('forside.aspx') &&
        new URLSearchParams(window.location.search).get('bl') === 'modulregnskaber',
    },
    {
      title: t('sidebar.nav.lokaler'),
      icon: DoorOpen,
      page: 'lokaler',
      settingKey: 'showLokaler',
      href: `/lectio/${getSchoolIdFromUrl()}/forside.aspx?bl=lokaler`,
      activeMatch: () =>
        window.location.pathname.toLowerCase().includes('forside.aspx') &&
        new URLSearchParams(window.location.search).get('bl') === 'lokaler',
    },
    { title: t('sidebar.nav.studieplan'), icon: ClipboardList, page: 'studieplan', settingKey: 'showStudieplan' },
    { title: t('sidebar.nav.spoergeskema'), icon: HelpCircle, page: 'spoergeskema/spoergeskema_rapport', settingKey: 'showSpoergeskema' },
  ];

  const findSkemaItems = [
    { title: t('sidebar.findSkema.elev'), type: 'elev', icon: Users },
    { title: t('sidebar.findSkema.laerer'), type: 'laerer', icon: GraduationCap },
    { title: t('sidebar.findSkema.klasse'), type: 'stamklasse', icon: School },
    { title: t('sidebar.findSkema.lokale'), type: 'lokale', icon: DoorOpen },
    { title: t('sidebar.findSkema.ressource'), type: 'ressource', icon: Box },
    { title: t('sidebar.findSkema.hold'), type: 'hold', icon: UsersRound },
    { title: t('sidebar.findSkema.gruppe'), type: 'gruppe', icon: LayoutGrid },
  ];

  const calendarItems = [
    { title: t('sidebar.aendringer.dagsaendringer'), page: 'SkemaDagsaendringer' },
    { title: t('sidebar.aendringer.ugeaendringer'), page: 'SkemaUgeaendringer' },
    { title: t('sidebar.aendringer.manedskalender'), page: 'kalender' },
  ];

  // Bump on `betterlectio:settings-hydrated` so the sidebar re-renders
  // when remote settings overwrite local (sidebar visibility toggles).
  const [, setSettingsTick] = useState(0);
  useEffect(() => {
    const onHydrated = () => setSettingsTick((n) => n + 1);
    window.addEventListener('betterlectio:settings-hydrated', onHydrated);
    return () => window.removeEventListener('betterlectio:settings-hydrated', onHydrated);
  }, []);

  // Get settings early — must be before any useState that references it
  const settings = getSettings();
  const sidebarSettings = settings.sidebar ?? {};

  const [menuOpen, setMenuOpen] = useState(false);
  const [imageEnlarged, setImageEnlarged] = useState(false);
  const [findSkemaOpen, setFindSkemaOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => settings.visual?.darkMode ?? false);
  const schoolInfo = getSchoolInfo();
  const schoolId = schoolInfo.id;
  const [hasBooks, setHasBooks] = useState(() => getCachedPageHasData(schoolId, 'books') ?? true);
  const [hasSps, setHasSps] = useState(() => getCachedPageHasData(schoolId, 'sps') ?? true);
  const [unreadCount, setUnreadCount] = useState<number>(() => getCachedUnreadCount(schoolId) ?? (hasNotificationDot() ? -1 : 0));
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter nav items based on settings (default to true if setting is undefined)
  const visibleNavMain = navMain.filter(item => sidebarSettings[item.settingKey] ?? true);
  const visibleNavSecondary = navSecondary.filter(item => sidebarSettings[item.settingKey] ?? true);

  // Get logo URL at render time when browser context is available
  const defaultLogoUrl = browser.runtime.getURL('/assets/logo-transparent.svg');
  const soroeLogoUrl = browser.runtime.getURL('/assets/soroeakademi.png');

  const { data: schoolRow } = useQuery<{ id: number; name: string; display_name: string | null }>({
    schoolId,
    table: 'schools',
    select: 'id, name, display_name',
    filters: [{ column: 'id', op: 'eq', value: Number(schoolId) }],
    single: true,
  });
  // Supabase query is async (even on cache hit — `browser.storage.local` is
  // a promise). `schoolInfo.name` already resolves synchronously from the
  // sync localStorage mirror, so keep showing it until Supabase produces a
  // real value. When it does, mirror it back to the sync cache for next load.
  const supabaseSchoolName = schoolRow?.display_name ?? schoolRow?.name ?? null;
  const schoolName = supabaseSchoolName ?? schoolInfo.name;
  useEffect(() => {
    if (supabaseSchoolName) {
      cacheSchoolDisplayName(schoolId, supabaseSchoolName);
    }
  }, [supabaseSchoolName, schoolId]);
  const cachedProfile = getCachedProfile();
  const { data: sidebarStudent } = useQuery<Student>({
    schoolId,
    table: 'students',
    filters: cachedProfile?.studentId ? [{ column: 'id', op: 'eq', value: cachedProfile.studentId }] : [],
    single: true,
    enabled: Boolean(cachedProfile?.studentId),
  });
  const lectioProfilePic = getProfilePicture();
  const profilePic = getPreferredStudentPictureUrl(sidebarStudent, lectioProfilePic);
  const userName = getPreferredStudentDisplayName(sidebarStudent, getUserName());
  const userClass = getUserClass();
  const currentPage = getCurrentPage();

  const baseUrl = `/lectio/${schoolId}`;

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

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

  // Check if school has books/SPS data (async, cached 1 week)
  useEffect(() => {
    let cancelled = false;

    // Stagger non-critical probes slightly to reduce first-load request bursts.
    const booksTimer = window.setTimeout(() => {
      getPageHasData(schoolId, 'bd/userreservations.aspx', 'books').then((value) => {
        if (!cancelled) setHasBooks(value);
      });
    }, 900);

    const spsTimer = window.setTimeout(() => {
      getPageHasData(schoolId, 'Elev_SPS.aspx', 'sps').then((value) => {
        if (!cancelled) setHasSps(value);
      });
    }, 1600);

    return () => {
      cancelled = true;
      window.clearTimeout(booksTimer);
      window.clearTimeout(spsTimer);
    };
  }, [schoolId]);

  // Fetch unread message count for sidebar badge
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      getUnreadCount(schoolId).then((count) => {
        if (!cancelled) setUnreadCount(count);
      });
    }, 1200);

    // Listen for live updates from BeskederPage
    const onBroadcast = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail.count;
      if (!cancelled) setUnreadCount(count);
    };
    window.addEventListener('betterlectio:unreadCount', onBroadcast);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('betterlectio:unreadCount', onBroadcast);
    };
  }, [schoolId]);

  const isActive = (page: string) => {
    const pageLower = page.toLowerCase();
    // Forside link should not appear active when a custom overlay like
    // ?bl=modulregnskaber is hosted on forside.aspx
    if (pageLower === 'forside' && new URLSearchParams(window.location.search).get('bl')) {
      return false;
    }
    if (currentPage === pageLower) return true;
    // Match skema pages but not findskema
    if ((currentPage === 'skemany' || currentPage === 'skema') && pageLower === 'skemany') return true;
    if (currentPage === pageLower.split('/').pop()) return true;
    return false;
  };

  return (
    <Sidebar {...props}>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          {schoolId === '94' ? (
            <img
              src={soroeLogoUrl}
              alt="Sorø Akademi"
              width={32}
              height={32}
              className="size-8 shrink-0"
            />
          ) : (
            <img
              src={defaultLogoUrl}
              alt="BetterLectio"
              width={32}
              height={32}
              className="size-8 shrink-0 dark:invert dark:brightness-110"
            />
          )}
          <span className="text-[1.35rem] font-semibold truncate text-sidebar-foreground">
            {schoolName}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1 [scrollbar-width:thin]">
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {visibleNavMain.map((item) => {
                const showBadge = item.page === 'beskeder2' && unreadCount !== 0;
                return (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton asChild isActive={isActive(item.page)} tooltip={item.title} className="text-[1rem]! py-2.5! h-auto! rounded-lg! data-[active=true]:bg-sidebar-accent! data-[active=true]:font-medium!">
                      <a href={`${baseUrl}/${item.page}.aspx`}>
                        <item.icon className="size-5! opacity-80" />
                        <span>{item.title}</span>
                        {showBadge && (
                          unreadCount > 0 ? (
                            <data className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold tabular-nums shrink-0" value={unreadCount}>
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </data>
                          ) : (
                            <data className="ml-auto size-2 rounded-full bg-primary animate-pulse shrink-0" value="0" />
                          )
                        )}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 opacity-50" />

        <SidebarGroup className="py-2">
          <SidebarGroupLabel className="text-muted-foreground px-3 mb-1.5">{t('sidebar.more')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {visibleNavSecondary.map((item) => {
                const active = item.activeMatch ? item.activeMatch() : isActive(item.page);
                const href = item.href ?? `${baseUrl}/${item.page}.aspx`;
                return (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title} className="text-[1rem]! py-2.5! h-auto! rounded-lg! data-[active=true]:bg-sidebar-accent! data-[active=true]:font-medium!">
                      <a href={href}>
                        <item.icon className="size-5! opacity-80" />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 opacity-50" />

        {((sidebarSettings.showFindSkema ?? true) || (sidebarSettings.showAendringer ?? true)) && (
          <SidebarGroup className="py-2">
            <SidebarGroupLabel className="text-muted-foreground px-3 mb-1.5">{t('sidebar.schedules')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {/* Find Skema collapsible */}
                {(sidebarSettings.showFindSkema ?? true) && (
                  <Collapsible open={findSkemaOpen} onOpenChange={setFindSkemaOpen} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={t('sidebar.findSkema.tooltip')} className="text-[1rem]! py-2.5! h-auto! rounded-lg!">
                          <FileSearch className="size-5! opacity-80" />
                          <span>{t('sidebar.findSkema.label')}</span>
                          <ChevronRight className="ml-auto size-4 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="ml-4 mt-1 border-l-0 pl-4">
                          {findSkemaItems.map((item) => (
                            <SidebarMenuSubItem key={item.type}>
                              <SidebarMenuSubButton asChild className="py-2! text-sm! rounded-lg!">
                                <a href={`${baseUrl}/FindSkema.aspx?type=${item.type}`}>
                                  <item.icon className="size-4 opacity-70" />
                                  <span>{item.title}</span>
                                </a>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild className="py-2! text-sm! rounded-lg!">
                              <a href={`${baseUrl}/FindSkemaAdv.aspx`}>
                                <Search className="size-4 opacity-70" />
                                <span>{t('sidebar.findSkema.advanced')}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {/* Calendar views collapsible */}
                {(sidebarSettings.showAendringer ?? true) && (
                  <Collapsible open={calendarOpen} onOpenChange={setCalendarOpen} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={t('sidebar.aendringer.tooltip')} className="text-[1rem]! py-2.5! h-auto! rounded-lg!">
                          <CalendarDays className="size-5! opacity-80" />
                          <span>{t('sidebar.aendringer.label')}</span>
                          <ChevronRight className="ml-auto size-4 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="ml-4 mt-1 border-l-0 pl-4">
                          {calendarItems.map((item) => (
                            <SidebarMenuSubItem key={item.page}>
                              <SidebarMenuSubButton asChild className="py-2! text-sm! rounded-lg!">
                                <a href={`${baseUrl}/${item.page}.aspx`}>
                                  <span>{item.title}</span>
                                </a>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3">
        {(settings.schedule.countdownBar ?? true) && (
          <div className="px-1 pb-1">
            <ScheduleCountdown schoolId={schoolId} />
          </div>
        )}
        <SidebarSeparator className="mb-2 opacity-50" />
        {/* Quick actions row */}
        <div className="flex items-center gap-1 px-2 mb-2">
          <a
            href={`${baseUrl}/indstillinger/studentIndstillinger.aspx`}
            className="flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-[color,background-color] duration-150"
            title={t('sidebar.profileTitle')}
          >
            <User className="size-[1.1rem]" />
          </a>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('betterlectio:openSettings'))}
            className="flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-[color,background-color] duration-150"
            title={t('sidebar.settingsTitle')}
          >
            <Settings className="size-[1.1rem]" />
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !isDark;
              setIsDark(next);
              updateSetting('visual', 'darkMode', next);
              document.documentElement.classList.toggle('dark', next);
            }}
            className="flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-[color,background-color] duration-150"
            title={isDark ? t('sidebar.lightModeTitle') : t('sidebar.darkModeTitle')}
          >
            {isDark ? <Sun className="size-[1.1rem]" /> : <Moon className="size-[1.1rem]" />}
          </button>
          <button
            type="button"
            onClick={async () => {
              // Every press is a strong "something is broken" signal. Fire the
              // rich analytics event (with page/context/any-visible-error
              // popup) and await its flush so the HTTP request isn't killed by
              // the reload that follows.
              armBypass();
              try {
                toast.info(t('sidebar.bypassToast'), {
                  description: t('sidebar.bypassToastDescription'),
                });
              } catch { /* non-critical */ }
              // Race analytics flush against a 1500ms cap so a slow/hung
              // PostHog request never strands the user on a broken page.
              await Promise.race([
                captureBypassEngaged(),
                new Promise((r) => setTimeout(r, 1500)),
              ]);
              window.location.reload();
            }}
            className="flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-[color,background-color] duration-150"
            title={t('sidebar.bypassTitle')}
          >
            <EyeOff className="size-[1.1rem]" />
          </button>
          {sidebarStudent && (
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent(MOBILE_APP_INVITE_OPEN_EVENT));
              }}
              className="flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-[color,background-color] duration-150"
              title="Open mobile app invite popup"
            >
              <Smartphone className="size-[1.1rem]" />
            </button>
          )}
        </div>
        <div className="relative" ref={menuRef}>
            {/* Dropdown menu - positioned above the trigger */}
            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="p-4 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 rounded-lg">
                      {profilePic ? (
                        <FallbackAvatarImage src={profilePic} fallbackSrc={lectioProfilePic} alt={userName} className="object-cover object-top" />
                      ) : null}
                      <AvatarFallback className="rounded-lg text-base">
                        {userName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-semibold text-[1rem]!">{userName}</span>
                      <span className="truncate text-sm text-muted-foreground">{userClass}</span>
                    </div>
                  </div>
                </div>
                <div className="p-1.5">
                  <a
                    href={`${baseUrl}/indstillinger/studentIndstillinger.aspx`}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-accent/80 transition-[color,background-color] duration-150"
                  >
                    <User className="size-[1.1rem] opacity-70" />
                    {t('sidebar.menu.profile')}
                  </a>
                  {hasSps && (
                    <a
                      href={`${baseUrl}/Elev_SPS.aspx`}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-accent/80 transition-[color,background-color] duration-150"
                    >
                      <ListChecks className="size-[1.1rem] opacity-70" />
                      {t('sidebar.menu.sps')}
                    </a>
                  )}
                  {hasBooks && (
                    <a
                      href={`${baseUrl}/bd/userreservations.aspx`}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-accent/80 transition-[color,background-color] duration-150"
                    >
                      <Library className="size-[1.1rem] opacity-70" />
                      {t('sidebar.menu.books')}
                    </a>
                  )}
                  <a
                    href={`${baseUrl}/studieplan/uvb_list_off.aspx`}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-accent/80 transition-[color,background-color] duration-150"
                  >
                    <BookMarked className="size-[1.1rem] opacity-70" />
                    {t('sidebar.menu.uvDescriptions')}
                  </a>
                </div>
                <div className="p-1.5 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('betterlectio:openSettings'));
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-accent/80 transition-[color,background-color] duration-150"
                  >
                    <Settings className="size-[1.1rem] opacity-70" />
                    {t('sidebar.menu.settings')}
                  </button>
                </div>
                <div className="p-1.5 border-t border-border/50">
                  <a
                    href={`${baseUrl}/logout.aspx`}
                    onClick={(e) => {
                      e.preventDefault();
                      markLogoutIntent(schoolId);
                      clearLoginState();
                      resetPostHog();
                      const logoutUrl = new URL(`${baseUrl}/logout.aspx`, window.location.origin).href;
                      fetch(logoutUrl, { credentials: 'include' })
                        .catch(() => {
                          // Ignore fetch errors and still redirect to logged-out landing page.
                        })
                        .finally(() => {
                          window.location.href = 'https://www.lectio.dk';
                        });
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-destructive/10 transition-[color,background-color] duration-150 text-destructive"
                  >
                    <LogOut className="size-[1.1rem]" />
                    {t('sidebar.menu.logout')}
                  </a>
                </div>
              </div>
            )}

            {/* Trigger button */}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex w-full items-center gap-3 rounded-lg p-2.5 hover:bg-sidebar-accent/80 transition-all text-left"
            >
              <Avatar
                className="h-10 w-10 rounded-lg cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  if (profilePic) setImageEnlarged(true);
                }}
              >
                {profilePic ? (
                  <FallbackAvatarImage src={profilePic} fallbackSrc={lectioProfilePic} alt={userName} className="object-cover object-top" />
                ) : null}
                <AvatarFallback className="rounded-lg text-sm">
                  {userName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left leading-snug">
                <span className="truncate text-base font-medium">{userName}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm text-muted-foreground/80">{userClass}</span>
                  <SupabaseAuthDot side="right" />
                </span>
              </div>
              <ChevronUp className={`size-4 opacity-40 transition-transform duration-200 ${menuOpen ? '' : 'rotate-180'}`} />
            </button>
          </div>
      </SidebarFooter>

      {/* Enlarged profile picture overlay */}
      {imageEnlarged && profilePic && (
        <div
          className="fixed inset-0 bg-black/60 z-100 flex items-center justify-center cursor-pointer backdrop-blur-sm"
          onClick={() => setImageEnlarged(false)}
        >
          <img
            src={profilePic}
            alt={userName}
            className="max-w-[80vw] max-h-[80vh] rounded-lg shadow-2xl object-contain animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            onError={(event) => {
              if (lectioProfilePic && event.currentTarget.src !== new URL(lectioProfilePic, window.location.origin).href) {
                event.currentTarget.src = lectioProfilePic;
              }
            }}
          />
        </div>
      )}

    </Sidebar>
  );
}
