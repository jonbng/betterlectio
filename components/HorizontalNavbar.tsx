import { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  BookMarked,
  BookOpen,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  Ellipsis,
  EyeOff,
  FileSearch,
  FileText,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  Home,
  Library,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Smartphone,
  Sun,
  User,
  Users,
  ArrowLeft,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScheduleCountdown } from './ScheduleCountdown';
import { SupabaseAuthDot } from './SupabaseAuthDot';
import { useTranslation } from '@/lib/i18n';
import { getCachedProfile, clearLoginState, getViewedEntityId } from '@/lib/profile-cache';
import { getCachedSchoolDisplayName } from '@/lib/school-storage';
import { getSettings, updateSetting } from '@/lib/settings-storage';
import { getCachedPageHasData, getPageHasData } from '@/lib/page-data-cache';
import { getCachedUnreadCount, getUnreadCount, hasNotificationDot } from '@/lib/unread-messages';
import { useQuery } from '@/lib/supabase/hooks';
import {
  getDisplayNameFromLookupId,
  getPictureUrlFromLookupId,
  getPreferredStudentDisplayName,
  getPreferredStudentPictureUrl,
  type Student,
  useSchoolStudents,
} from '@/lib/supabase/student-lookup';
import { armBypass } from '@/lib/bypass-redesigns';
import { captureBypassEngaged } from '@/lib/bypass-analytics';
import { reset as resetPostHog } from '@/lib/posthog';
import { markLogoutIntent } from '@/lib/logout-tracking';
import { MOBILE_APP_INVITE_OPEN_EVENT } from './MobileAppInvitePopup';
import {
  activateNativeNavigationItem,
  isSecondaryNavigationMerged,
  type LectioNavigationItem,
  type LectioNavigationSnapshot,
} from '@/lib/lectio-navigation';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getRecentUrls } from '@/lib/url-history';

interface HorizontalNavbarProps {
  snapshot: LectioNavigationSnapshot;
}

const GLOBAL_LINK_CLASS = 'il-horizontal-global-link relative inline-flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border-0 bg-transparent px-3 text-[1.025rem] font-medium text-sidebar-foreground/75 no-underline transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground focus-visible:outline-none';
const CONTEXT_LINK_CLASS = 'il-horizontal-context-link relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[0.95rem] font-medium text-muted-foreground no-underline transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:bg-accent/70 focus-visible:text-foreground focus-visible:outline-none';
const QUICK_ACTION_CLASS = 'il-horizontal-icon-button inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground focus-visible:outline-none';

function QuickActionButton({
  label,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <button type="button" className={cn(QUICK_ACTION_CLASS, className)} aria-label={label} {...props}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}

function hrefMatchesCurrentPage(href: string): boolean {
  const target = new URL(href, window.location.origin);
  if (target.pathname.toLowerCase() !== window.location.pathname.toLowerCase()) return false;
  const targetOverlay = target.searchParams.get('bl');
  return targetOverlay ? targetOverlay === new URLSearchParams(window.location.search).get('bl') : true;
}


/** True only for the Beskeder page itself — not links whose prevurl mentions beskeder2.aspx. */
function isBeskederHref(href: string): boolean {
  try {
    return /\/beskeder2\.aspx$/i.test(new URL(href, window.location.origin).pathname);
  } catch {
    return /\/beskeder2\.aspx$/i.test(href.split(/[?#]/, 1)[0] ?? href);
  }
}

function withoutActiveSection(title: string, activeLabel?: string): string {
  if (!activeLabel) return title;
  const escaped = activeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`\\s*[-–—]\\s*${escaped}\\s*$`, 'i'), '').trim();
}

function nativeItemByLabel(snapshot: LectioNavigationSnapshot, label: string) {
  return snapshot.globalItems.find((item) => item.label.toLocaleLowerCase('da') === label.toLocaleLowerCase('da'));
}

function NativeLink({
  item,
  className,
  unreadCount = 0,
}: {
  item: LectioNavigationItem;
  className?: string;
  unreadCount?: number;
}) {
  const isMessages = isBeskederHref(item.href);
  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (item.nativeAction && activateNativeNavigationItem(item)) event.preventDefault();
  };
  return (
    <a
      href={item.href}
      onClick={onClick}
      aria-current={item.active ? 'page' : undefined}
      className={className}
    >
      <span>{item.label}</span>
      {isMessages && unreadCount !== 0 && (
        unreadCount > 0 ? (
          <data className="il-horizontal-nav-badge inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-bold tabular-nums text-primary-foreground" value={unreadCount}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </data>
        ) : <span className="il-horizontal-nav-dot size-1.5 rounded-full bg-primary" aria-label="Ulæste beskeder" />
      )}
    </a>
  );
}

function ScrollableNavigationRow({
  items,
  unreadCount,
  secondary = false,
}: {
  items: LectioNavigationItem[];
  unreadCount: number;
  secondary?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => setEdges({
      left: scroller.scrollLeft > 2,
      right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2,
    });
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    scroller.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    return () => { scroller.removeEventListener('scroll', update); observer.disconnect(); };
  }, [items]);

  const scroll = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });
  };

  return (
    <div className={cn('il-horizontal-nav-scroll-shell relative flex min-w-0 flex-1 overflow-hidden', secondary && 'is-secondary')}>
      {edges.left && (
        <button type="button" className="il-horizontal-nav-scroll-button is-left absolute left-1 top-1/2 z-2 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-popover text-foreground shadow-md" onClick={() => scroll(-1)} aria-label="Rul navigation til venstre">
          <ChevronLeft className="size-3.5" />
        </button>
      )}
      <div ref={scrollerRef} className="il-horizontal-nav-scroller flex min-w-0 items-stretch overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => (
          <NativeLink
            key={`${item.href}-${index}`}
            item={item}
            unreadCount={unreadCount}
            className={cn(CONTEXT_LINK_CLASS, secondary && 'px-2.5 text-sm', item.active && 'is-active font-bold text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-primary after:content-[\'\']')}
          />
        ))}
      </div>
      {edges.right && (
        <button type="button" className="il-horizontal-nav-scroll-button is-right absolute right-1 top-1/2 z-2 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-popover text-foreground shadow-md" onClick={() => scroll(1)} aria-label="Rul navigation til højre">
          <ChevronRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function HorizontalNavbar({ snapshot }: HorizontalNavbarProps) {
  const { t } = useTranslation();
  const settings = getSettings();
  const navSettings = settings.sidebar ?? {};
  const profile = getCachedProfile();
  const schoolId = profile?.schoolId ?? window.location.pathname.match(/\/lectio\/(\d+)\//)?.[1] ?? '94';
  const baseUrl = `/lectio/${schoolId}`;
  const [isDark, setIsDark] = useState(() => settings.visual?.darkMode ?? false);
  const [imageOpen, setImageOpen] = useState(false);
  const [hasBooks, setHasBooks] = useState(() => getCachedPageHasData(schoolId, 'books') ?? true);
  const [hasSps, setHasSps] = useState(() => getCachedPageHasData(schoolId, 'sps') ?? true);
  const [unreadCount, setUnreadCount] = useState(() => getCachedUnreadCount(schoolId) ?? (hasNotificationDot() ? -1 : 0));
  const { studentsMap } = useSchoolStudents(schoolId);
  const { data: currentStudent } = useQuery<Student>({
    schoolId,
    table: 'students',
    filters: profile?.studentId ? [{ column: 'id', op: 'eq', value: profile.studentId }] : [],
    single: true,
    enabled: Boolean(profile?.studentId),
  });

  useEffect(() => {
    let cancelled = false;
    const booksTimer = window.setTimeout(() => {
      getPageHasData(schoolId, 'bd/userreservations.aspx', 'books').then((value) => { if (!cancelled) setHasBooks(value); });
    }, 900);
    const spsTimer = window.setTimeout(() => {
      getPageHasData(schoolId, 'Elev_SPS.aspx', 'sps').then((value) => { if (!cancelled) setHasSps(value); });
    }, 1600);
    const unreadTimer = window.setTimeout(() => {
      getUnreadCount(schoolId).then((value) => { if (!cancelled) setUnreadCount(value); });
    }, 1200);
    const onUnread = (event: Event) => setUnreadCount((event as CustomEvent<{ count: number }>).detail.count);
    window.addEventListener('betterlectio:unreadCount', onUnread);
    return () => {
      cancelled = true;
      window.clearTimeout(booksTimer);
      window.clearTimeout(spsTimer);
      window.clearTimeout(unreadTimer);
      window.removeEventListener('betterlectio:unreadCount', onUnread);
    };
  }, [schoolId]);

  useEffect(() => {
    if (!imageOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setImageOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [imageOpen]);

  const profilePicture = getPreferredStudentPictureUrl(currentStudent, (window as any).__IL_PROFILE_PIC__ ?? profile?.pictureUrl);
  const profileName = getPreferredStudentDisplayName(currentStudent, profile?.fullName || profile?.name || t('sidebar.menu.profile'));
  const schoolName = getCachedSchoolDisplayName(schoolId) || profile?.schoolName || snapshot.schoolName;
  const logoUrl = browser.runtime.getURL(schoolId === '94' ? '/assets/soroeakademi.png' : '/assets/logo-transparent.svg');

  const contextFallbackName = snapshot.contextTitle?.match(/^Eleven\s+(.+?)(?:\([^)]+\))?,\s/)?.[1] ?? snapshot.contextTitle ?? '';
  const contextName = getDisplayNameFromLookupId(studentsMap, snapshot.contextId, contextFallbackName);
  const contextPicture = getPictureUrlFromLookupId(studentsMap, snapshot.contextId, snapshot.contextImageUrl);
  const customRoute = new URLSearchParams(window.location.search).get('bl');
  const currentPath = window.location.pathname.toLowerCase();
  const findSkemaType = new URLSearchParams(window.location.search).get('type')?.toLowerCase() ?? null;
  const homeItem: LectioNavigationItem = {
    ...(nativeItemByLabel(snapshot, 'Forside') ?? { label: t('sidebar.nav.forside'), href: `${baseUrl}/forside.aspx`, active: false, sourceId: null, nativeAction: false }),
    active: currentPath.endsWith('/forside.aspx') && !customRoute,
  };
  const scheduleItem: LectioNavigationItem = {
    ...(nativeItemByLabel(snapshot, 'Skema') ?? { label: t('sidebar.nav.skema'), href: `${baseUrl}/SkemaNy.aspx`, active: false, sourceId: null, nativeAction: false }),
    active: /\/(skemany|skema1dag)\.aspx$/.test(currentPath),
  };
  const studentsItem: LectioNavigationItem = {
    label: t('sidebar.nav.elever'),
    href: `${baseUrl}/FindSkema.aspx`,
    active: currentPath.endsWith('/findskema.aspx') && (!findSkemaType || findSkemaType === 'elev'),
    sourceId: null,
    nativeAction: false,
  };
  const messagesItem: LectioNavigationItem = {
    label: t('sidebar.nav.beskeder'),
    href: `${baseUrl}/beskeder2.aspx`,
    active: currentPath.endsWith('/beskeder2.aspx'),
    sourceId: null,
    nativeAction: false,
  };
  const contextItems = customRoute
    ? snapshot.primaryItems.map((item) => ({ ...item, active: false }))
    : snapshot.primaryItems;
  const secondaryItems = isSecondaryNavigationMerged(window.location.pathname)
    ? []
    : snapshot.secondaryItems;
  const lectioExtras = snapshot.globalItems.filter((item) => !['forside', 'skema', 'log ud'].includes(item.label.toLocaleLowerCase('da')));

  const pageItems = [
    { show: navSettings.showOpgaver ?? true, label: t('sidebar.nav.opgaver'), href: `${baseUrl}/OpgaverElev.aspx`, icon: FileText },
    { show: navSettings.showLektier ?? true, label: t('sidebar.nav.lektier'), href: `${baseUrl}/material_lektieoversigt.aspx`, icon: BookOpen },
    { show: navSettings.showFravaer ?? true, label: t('sidebar.nav.fravaer'), href: `${baseUrl}/subnav/fravaerelev_fravaersaarsager.aspx`, icon: Clock },
    { show: navSettings.showKarakterer ?? true, label: t('sidebar.nav.karakterer'), href: `${baseUrl}/grades/grade_report.aspx`, icon: GraduationCap },
    { show: navSettings.showDokumenter ?? true, label: t('sidebar.nav.dokumenter'), href: `${baseUrl}/DokumentOversigt.aspx`, icon: FolderOpen },
    { show: navSettings.showStudieplan ?? true, label: t('sidebar.nav.studieplan'), href: `${baseUrl}/studieplan.aspx`, icon: ListChecks },
    { show: navSettings.showSpoergeskema ?? true, label: t('sidebar.nav.spoergeskema'), href: `${baseUrl}/spoergeskema/spoergeskema_rapport.aspx`, icon: HelpCircle },
    { show: navSettings.showModulregnskaber ?? true, label: t('sidebar.nav.modulregnskaber'), href: `${baseUrl}/forside.aspx?bl=modulregnskaber`, icon: CalendarDays },
    { show: navSettings.showLokaler ?? true, label: t('sidebar.nav.lokaler'), href: `${baseUrl}/forside.aspx?bl=lokaler`, icon: DoorOpen },
  ]
    .filter((item) => item.show)
    .map((item) => ({
      ...item,
      active: item.href.includes('fravaerelev')
        ? /\/subnav\/fravaerelev(?:_fravaersaarsager)?\.aspx$/i.test(window.location.pathname)
        : hrefMatchesCurrentPage(item.href),
    }));

  const moreActive = Boolean(customRoute)
    || pageItems.some((item) => item.active)
    || currentPath.endsWith('/findskemaadv.aspx')
    || (currentPath.endsWith('/findskema.aspx') && Boolean(findSkemaType && findSkemaType !== 'elev'))
    || /\/(skemadagsaendringer|skemauegeaendringer|kalender)\.aspx$/.test(currentPath)
    || lectioExtras.some((item) => item.active);

  const activeContextLabel = contextItems.find((item) => item.active)?.label;
  const contextTitle = useMemo(() => {
    if (customRoute === 'modulregnskaber') return t('sidebar.nav.modulregnskaber');
    if (customRoute === 'lokaler') return t('sidebar.nav.lokaler');
    if (!snapshot.contextTitle) return null;
    const preferredTitle = snapshot.contextId?.startsWith('S') && contextName !== contextFallbackName
      ? `${contextName}${snapshot.contextTitle.match(/^Eleven\s+.+?(,\s*.+)$/)?.[1] ?? ''}`
      : snapshot.contextTitle;
    return withoutActiveSection(preferredTitle, activeContextLabel);
  }, [customRoute, snapshot.contextTitle, snapshot.contextId, contextName, contextFallbackName, activeContextLabel, t]);

  const viewedEntity = getViewedEntityId();
  const viewingOtherEntity = Boolean(viewedEntity && (
    viewedEntity.type !== 'student' || !profile?.studentId || viewedEntity.id !== profile.studentId
  ));
  const contextBack = useMemo(() => {
    if (!viewingOtherEntity) return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'findskema') {
      const search = new URLSearchParams();
      const query = params.get('q');
      if (query) search.set('q', query);
      return {
        href: `${baseUrl}/FindSkema.aspx${search.size ? `?${search}` : ''}`,
        label: t('viewingSchedule.backToSearch'),
      };
    }

    const current = new URL(window.location.href);
    const previous = getRecentUrls(5)
      .map((url) => { try { return new URL(url); } catch { return null; } })
      .find((url) => url
        && url.origin === current.origin
        && url.pathname.startsWith(`${baseUrl}/`)
        && `${url.pathname}${url.search}` !== `${current.pathname}${current.search}`);
    return {
      href: previous ? `${previous.pathname}${previous.search}${previous.hash}` : `${baseUrl}/FindSkema.aspx`,
      label: previous?.pathname.toLowerCase().endsWith('/findskema.aspx')
        ? t('viewingSchedule.backToSearch')
        : t('horizontalNav.back'),
    };
  }, [viewingOtherEntity, baseUrl, t]);

  const openSettings = () => window.dispatchEvent(new CustomEvent('betterlectio:openSettings'));
  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    updateSetting('visual', 'darkMode', next);
    document.documentElement.classList.toggle('dark', next);
  };
  const showOriginal = async () => {
    armBypass();
    try { toast.info(t('sidebar.bypassToast'), { description: t('sidebar.bypassToastDescription') }); } catch { /* non-critical */ }
    await Promise.race([captureBypassEngaged(), new Promise((resolve) => setTimeout(resolve, 1500))]);
    window.location.reload();
  };
  const logout = () => {
    markLogoutIntent(schoolId);
    clearLoginState();
    resetPostHog();
    fetch(`${baseUrl}/logout.aspx`, { credentials: 'include' })
      .catch(() => {})
      .finally(() => { window.location.href = 'https://www.lectio.dk'; });
  };

  return (
    <header className="il-horizontal-navbar relative z-60 w-full shrink-0 bg-sidebar text-sidebar-foreground shadow-[0_1px_0_var(--sidebar-border)]" aria-label={t('horizontalNav.navigationLabel')}>
      <div className="il-horizontal-navbar-main mx-auto flex h-15 w-full max-w-[1760px] min-w-0 items-center gap-3 px-5">
        <a href={`${baseUrl}/forside.aspx`} className="il-horizontal-brand flex min-w-32 max-w-60 flex-[0_1_15rem] items-center gap-2.5 text-sidebar-foreground no-underline" title={schoolName}>
          <img src={logoUrl} alt="" className={cn('il-horizontal-brand-logo size-8 shrink-0 object-contain', schoolId !== '94' && 'dark:invert')} />
          <span className="min-w-0 truncate text-base font-semibold tracking-[-0.015em]">{schoolName}</span>
        </a>

        <nav className="il-horizontal-global-links flex shrink-0 self-stretch items-stretch gap-0.5" aria-label={t('horizontalNav.globalLabel')}>
          {(navSettings.showForside ?? true) && (
            <NativeLink item={homeItem} className={cn(GLOBAL_LINK_CLASS, homeItem.active && 'is-active font-bold text-sidebar-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-sidebar-primary after:content-[\'\']')} />
          )}
          {(navSettings.showSkema ?? true) && (
            <NativeLink item={scheduleItem} className={cn(GLOBAL_LINK_CLASS, scheduleItem.active && 'is-active font-bold text-sidebar-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-sidebar-primary after:content-[\'\']')} />
          )}
          {(navSettings.showElever ?? true) && (
            <NativeLink item={studentsItem} className={cn(GLOBAL_LINK_CLASS, studentsItem.active && 'is-active font-bold text-sidebar-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-sidebar-primary after:content-[\'\']')} />
          )}
          {(navSettings.showBeskeder ?? true) && (
            <NativeLink item={messagesItem} unreadCount={unreadCount} className={cn(GLOBAL_LINK_CLASS, messagesItem.active && 'is-active font-bold text-sidebar-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-sidebar-primary after:content-[\'\']')} />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn(GLOBAL_LINK_CLASS, moreActive && 'is-active font-bold text-sidebar-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-sidebar-primary after:content-[\'\']')}>
                <Menu className="size-4" />
                <span>{t('horizontalNav.more')}</span>
                <ChevronDown className="size-3.5 opacity-55" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-1.5">
              <DropdownMenuLabel>{t('horizontalNav.yourPages')}</DropdownMenuLabel>
              <DropdownMenuGroup>
                {pageItems.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <a href={item.href} aria-current={item.active ? 'page' : undefined} className={cn(item.active && 'bg-accent font-semibold text-accent-foreground')}>
                      <item.icon />{item.label}
                      {isBeskederHref(item.href) && unreadCount !== 0 && (
                        unreadCount > 0
                          ? <data className="il-horizontal-nav-badge ml-auto inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-bold tabular-nums text-primary-foreground" value={unreadCount}>{unreadCount > 99 ? '99+' : unreadCount}</data>
                          : <span className="il-horizontal-nav-dot ml-auto size-1.5 rounded-full bg-primary" />
                      )}
                    </a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {(navSettings.showElever ?? true) && (navSettings.showFindSkema ?? true) && <DropdownMenuSub>
                <DropdownMenuSubTrigger><FileSearch />{t('sidebar.findSkema.label')}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  {['elev', 'laerer', 'stamklasse', 'lokale', 'ressource', 'hold', 'gruppe'].map((type) => (
                    <DropdownMenuItem key={type} asChild>
                      <a href={`${baseUrl}/FindSkema.aspx?type=${type}`}>{t(`sidebar.findSkema.${type === 'stamklasse' ? 'klasse' : type}` as any)}</a>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><a href={`${baseUrl}/FindSkemaAdv.aspx`}><Search />{t('sidebar.findSkema.advanced')}</a></DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>}
              {(navSettings.showAendringer ?? true) && <DropdownMenuSub>
                <DropdownMenuSubTrigger><Calendar />{t('sidebar.aendringer.label')}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem asChild><a href={`${baseUrl}/SkemaDagsaendringer.aspx`}>{t('sidebar.aendringer.dagsaendringer')}</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={`${baseUrl}/SkemaUgeaendringer.aspx`}>{t('sidebar.aendringer.ugeaendringer')}</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={`${baseUrl}/kalender.aspx`}>{t('sidebar.aendringer.manedskalender')}</a></DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>}
              {lectioExtras.length > 0 && <DropdownMenuSeparator />}
              {lectioExtras.map((item, index) => (
                <DropdownMenuItem key={`${item.href}-${index}`} asChild>
                  <a
                    href={item.href}
                    onClick={(event) => {
                      if (item.nativeAction && activateNativeNavigationItem(item)) event.preventDefault();
                    }}
                  >
                    {item.label}
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="il-horizontal-navbar-actions ml-auto flex min-w-0 items-center justify-end gap-1.5">
          {settings.schedule?.countdownBar !== false && (
            <div className="il-horizontal-countdown-slot min-w-0 [width:clamp(8rem,17vw,15.5rem)] max-[1279px]:hidden">
              <ScheduleCountdown schoolId={schoolId} variant="horizontal" />
            </div>
          )}
          <div
            className="il-horizontal-quick-actions flex shrink-0 items-center gap-0.5 rounded-xl border border-sidebar-border bg-sidebar-accent/35 p-0.5"
            role="group"
            aria-label={t('horizontalNav.quickActions')}
          >
            {snapshot.searchItem && (
              <QuickActionButton label={snapshot.searchItem.label} onClick={() => activateNativeNavigationItem(snapshot.searchItem!)}>
                <Search className="size-[1.05rem]" />
              </QuickActionButton>
            )}
            <QuickActionButton className="max-[1179px]:hidden" label={t('sidebar.settingsTitle')} onClick={openSettings}>
              <Settings className="size-[1.05rem]" />
            </QuickActionButton>
            <QuickActionButton
              className="max-[1179px]:hidden"
              label={isDark ? t('sidebar.lightModeTitle') : t('sidebar.darkModeTitle')}
              aria-pressed={isDark}
              onClick={toggleTheme}
            >
              {isDark ? <Sun className="size-[1.05rem]" /> : <Moon className="size-[1.05rem]" />}
            </QuickActionButton>
            <QuickActionButton className="max-[1179px]:hidden" label={t('sidebar.bypassTitle')} onClick={showOriginal}>
              <EyeOff className="size-[1.05rem]" />
            </QuickActionButton>
            {currentStudent && (
              <QuickActionButton
                className="max-[1179px]:hidden"
                label={t('horizontalNav.mobileApp')}
                onClick={() => window.dispatchEvent(new CustomEvent(MOBILE_APP_INVITE_OPEN_EVENT))}
              >
                <Smartphone className="size-[1.05rem]" />
              </QuickActionButton>
            )}
            <DropdownMenu>
              <Tooltip disableHoverableContent>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn(QUICK_ACTION_CLASS, 'min-[1180px]:hidden')} aria-label={t('horizontalNav.moreActions')}>
                      <Ellipsis className="size-[1.1rem]" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>{t('horizontalNav.moreActions')}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuLabel>{t('horizontalNav.quickActions')}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={openSettings}><Settings />{t('sidebar.menu.settings')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={toggleTheme}>{isDark ? <Sun /> : <Moon />}{isDark ? t('sidebar.lightModeTitle') : t('sidebar.darkModeTitle')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={showOriginal}><EyeOff />{t('horizontalNav.showOriginal')}</DropdownMenuItem>
                {currentStudent && (
                  <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent(MOBILE_APP_INVITE_OPEN_EVENT))}><Smartphone />{t('horizontalNav.mobileApp')}</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="il-horizontal-profile-trigger flex h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border-0 bg-transparent py-1 pr-2 pl-1 text-left text-sidebar-foreground hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none data-[state=open]:bg-sidebar-accent" aria-label={t('horizontalNav.openProfileMenu')}>
                <Avatar className="size-8 rounded-lg">
                  {profilePicture && <AvatarImage src={profilePicture} alt="" className="object-cover object-top" />}
                  <AvatarFallback className="rounded-lg">{profileName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="il-horizontal-profile-copy grid min-w-14 max-w-28 leading-none max-[1080px]:hidden">
                  <strong className="truncate text-sm font-semibold">{profileName.split(' ')[0]}</strong>
                  <small className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-sidebar-foreground/55">
                    <span className="truncate">{profile?.className}</span>
                    <SupabaseAuthDot side="bottom" />
                  </small>
                </span>
                <ChevronDown className="size-3.5 opacity-55" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-1.5">
              <div className="flex items-center gap-3 px-2 py-2">
                <button type="button" onClick={() => profilePicture && setImageOpen(true)} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="size-11 rounded-lg">
                    {profilePicture && <AvatarImage src={profilePicture} alt={profileName} className="object-cover object-top" />}
                    <AvatarFallback className="rounded-lg">{profileName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </button>
                <div className="min-w-0"><p className="truncate font-semibold">{profileName}</p><p className="text-xs text-muted-foreground">{profile?.className}</p></div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><a href={`${baseUrl}/indstillinger/studentIndstillinger.aspx`}><User />{t('sidebar.menu.profile')}</a></DropdownMenuItem>
              {hasSps && <DropdownMenuItem asChild><a href={`${baseUrl}/Elev_SPS.aspx`}><ListChecks />{t('sidebar.menu.sps')}</a></DropdownMenuItem>}
              {hasBooks && <DropdownMenuItem asChild><a href={`${baseUrl}/bd/userreservations.aspx`}><Library />{t('sidebar.menu.books')}</a></DropdownMenuItem>}
              {(navSettings.showUVBeskrivelser ?? true) && <DropdownMenuItem asChild><a href={`${baseUrl}/studieplan/uvb_list_off.aspx`}><BookMarked />{t('sidebar.menu.uvDescriptions')}</a></DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openSettings}><Settings />{t('sidebar.menu.settings')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={toggleTheme}>{isDark ? <Sun /> : <Moon />}{isDark ? t('sidebar.lightModeTitle') : t('sidebar.darkModeTitle')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={showOriginal}><EyeOff />{t('horizontalNav.showOriginal')}</DropdownMenuItem>
              {currentStudent && (
                <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent(MOBILE_APP_INVITE_OPEN_EVENT))}><Smartphone />{t('horizontalNav.mobileApp')}</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={logout}><LogOut />{t('sidebar.menu.logout')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {contextItems.length > 0 && (
        <div className="il-horizontal-context-row h-[2.85rem] border-t border-sidebar-border bg-[color-mix(in_oklch,var(--background)_88%,var(--sidebar)_12%)]">
          <div className="mx-auto flex h-full w-full max-w-[1760px] min-w-0 items-stretch px-5">
            {contextBack && (
              <a
                href={contextBack.href}
                className="mr-3 inline-flex shrink-0 items-center gap-1.5 border-r border-border/70 pr-3 text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <ArrowLeft className="size-4" />
                <span>{contextBack.label}</span>
              </a>
            )}
            {contextTitle && (
              <div className="il-horizontal-context-identity flex min-w-36 max-w-68 flex-[0_1_17rem] items-center gap-2 py-0 pr-3.5 text-foreground" title={contextTitle}>
                {contextPicture ? <img src={contextPicture} alt="" className="size-7 shrink-0 rounded-[0.45rem] bg-muted object-cover object-top" /> : <span className="il-horizontal-context-monogram inline-flex size-7 shrink-0 items-center justify-center rounded-[0.45rem] bg-muted text-sm font-bold text-muted-foreground">{contextTitle.charAt(0)}</span>}
                <span className="truncate text-[0.9375rem] font-semibold">{contextTitle}</span>
              </div>
            )}
            <ScrollableNavigationRow items={contextItems} unreadCount={unreadCount} />
          </div>
        </div>
      )}
      {secondaryItems.length > 0 && (
        <div className="il-horizontal-context-row is-secondary h-[2.35rem] border-t border-sidebar-border bg-background">
          <div className="mx-auto flex h-full w-full max-w-[1760px] min-w-0 items-stretch px-5">
            <span className="il-horizontal-local-label inline-flex shrink-0 items-center py-0 pr-3.5 text-[0.8rem] font-bold tracking-[0.06em] text-muted-foreground uppercase">{t('horizontalNav.inThisSection')}</span>
            <ScrollableNavigationRow items={secondaryItems} unreadCount={unreadCount} secondary />
          </div>
        </div>
      )}

      {imageOpen && profilePicture && (
        <div className="fixed inset-0 z-100 flex cursor-pointer items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setImageOpen(false)}>
          <img src={profilePicture} alt={profileName} className="max-h-[80vh] max-w-[80vw] rounded-xl object-contain shadow-2xl" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </header>
  );
}
