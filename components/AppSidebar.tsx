import { useState, useRef, useEffect } from 'react';
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
  IdCard,
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
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

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
import { getSettings } from '@/lib/settings-storage';
import { SettingsModal } from './SettingsModal';
import { ActivityClassModal } from './ActivityClassModal';

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
  return {
    id: cached?.schoolId || getSchoolIdFromUrl(),
    name: cached?.schoolName || getSchoolNameFromPage() || 'Lectio',
  };
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

const navMain = [
  { title: 'Forside', icon: Home, page: 'forside', settingKey: 'showForside' as const },
  { title: 'Skema', icon: Calendar, page: 'skemany', settingKey: 'showSkema' as const },
  { title: 'Elever', icon: Users, page: 'FindSkema', settingKey: 'showElever' as const },
  { title: 'Opgaver', icon: FileText, page: 'opgaverelev', settingKey: 'showOpgaver' as const },
  { title: 'Lektier', icon: BookOpen, page: 'material_lektieoversigt', settingKey: 'showLektier' as const },
  { title: 'Fravær', icon: Clock, page: 'subnav/fravaerelev_fravaersaarsager', settingKey: 'showFravaer' as const },
  { title: 'Beskeder', icon: MessageSquare, page: 'beskeder2', settingKey: 'showBeskeder' as const },
];

const navSecondary = [
  { title: 'Karakterer', icon: GraduationCap, page: 'grades/grade_report', settingKey: 'showKarakterer' as const },
  { title: 'Studieplan', icon: ClipboardList, page: 'studieplan', settingKey: 'showStudieplan' as const },
  { title: 'Dokumenter', icon: FolderOpen, page: 'dokumentoversigt', settingKey: 'showDokumenter' as const },
  { title: 'Spørgeskema', icon: HelpCircle, page: 'spoergeskema/spoergeskema_rapport', settingKey: 'showSpoergeskema' as const },
  { title: 'UV-beskrivelser', icon: BookMarked, page: 'studieplan/uvb_list_off', settingKey: 'showUVBeskrivelser' as const },
];

const findSkemaItems = [
  { title: 'Elev', type: 'elev', icon: Users },
  { title: 'Lærer', type: 'laerer', icon: GraduationCap },
  { title: 'Klasse', type: 'stamklasse', icon: School },
  { title: 'Lokale', type: 'lokale', icon: DoorOpen },
  { title: 'Ressource', type: 'ressource', icon: Box },
  { title: 'Hold', type: 'hold', icon: UsersRound },
  { title: 'Gruppe', type: 'gruppe', icon: LayoutGrid },
];

const calendarItems = [
  { title: 'Dagsændringer', page: 'SkemaDagsaendringer' },
  { title: 'Ugeændringer', page: 'SkemaUgeaendringer' },
  { title: 'Månedskalender', page: 'kalender' },
];

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imageEnlarged, setImageEnlarged] = useState(false);
  const [findSkemaOpen, setFindSkemaOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activityModalUrl, setActivityModalUrl] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get settings for sidebar visibility
  const settings = getSettings();
  const sidebarSettings = settings.sidebar ?? {};

  // Filter nav items based on settings (default to true if setting is undefined)
  const visibleNavMain = navMain.filter(item => sidebarSettings[item.settingKey] ?? true);
  const visibleNavSecondary = navSecondary.filter(item => sidebarSettings[item.settingKey] ?? true);

  // Get logo URL at render time when browser context is available
  const logoUrl = browser.runtime.getURL('/assets/logo-transparent.svg');

  const school = getSchoolInfo();
  const schoolId = school.id;
  const schoolName = school.name;
  const profilePic = getProfilePicture();
  const userName = getUserName();
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

  // Listen for custom event to open settings (triggered by extension icon click)
  useEffect(() => {
    function handleOpenSettings() {
      setSettingsOpen(true);
    }
    window.addEventListener('betterlectio:openSettings', handleOpenSettings);
    return () => window.removeEventListener('betterlectio:openSettings', handleOpenSettings);
  }, []);

  useEffect(() => {
    const handleOpenActivityModal = (event: Event) => {
      const customEvent = event as CustomEvent<{ url?: string }>;
      const nextUrl = customEvent.detail?.url;
      if (!nextUrl) return;
      setActivityModalUrl(nextUrl);
      setActivityModalOpen(true);
    };

    window.addEventListener("betterlectio:openActivityModal", handleOpenActivityModal as EventListener);
    return () =>
      window.removeEventListener(
        "betterlectio:openActivityModal",
        handleOpenActivityModal as EventListener,
      );
  }, []);

  const isActive = (page: string) => {
    const pageLower = page.toLowerCase();
    if (currentPage === pageLower) return true;
    // Match skema pages but not findskema
    if ((currentPage === 'skemany' || currentPage === 'skema') && pageLower === 'skemany') return true;
    if (currentPage === pageLower.split('/').pop()) return true;
    return false;
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="BetterLectio"
            width={32}
            height={32}
            className="size-8 shrink-0 dark:invert dark:brightness-110"
          />
          <span className="text-[1.35rem] font-semibold truncate text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            {schoolName === 'Sorø Akademis Skole' ? 'Sorø Akademi' : schoolName}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {visibleNavMain.map((item) => (
                <SidebarMenuItem key={item.page}>
                  <SidebarMenuButton asChild isActive={isActive(item.page)} tooltip={item.title} className="text-[1rem]! py-2.5! h-auto! rounded-lg! data-[active=true]:bg-sidebar-accent! data-[active=true]:font-medium!">
                    <a href={`${baseUrl}/${item.page}.aspx`}>
                      <item.icon className="size-5! opacity-80" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 opacity-50" />

        <SidebarGroup className="py-2">
          <SidebarGroupLabel className="text-[0.9rem]! font-semibold! text-muted-foreground! px-3 mb-1.5">Mere</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {visibleNavSecondary.map((item) => (
                <SidebarMenuItem key={item.page}>
                  <SidebarMenuButton asChild isActive={isActive(item.page)} tooltip={item.title} className="text-[1rem]! py-2.5! h-auto! rounded-lg! data-[active=true]:bg-sidebar-accent! data-[active=true]:font-medium!">
                    <a href={`${baseUrl}/${item.page}.aspx`}>
                      <item.icon className="size-5! opacity-80" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 opacity-50" />

        {((sidebarSettings.showFindSkema ?? true) || (sidebarSettings.showAendringer ?? true)) && (
          <SidebarGroup className="py-2">
            <SidebarGroupLabel className="text-[0.9rem]! font-semibold! text-muted-foreground! px-3 mb-1.5">Skemaer</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {/* Find Skema collapsible */}
                {(sidebarSettings.showFindSkema ?? true) && (
                  <Collapsible open={findSkemaOpen} onOpenChange={setFindSkemaOpen} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip="Find Skema" className="text-[1rem]! py-2.5! h-auto! rounded-lg!">
                          <FileSearch className="size-5! opacity-80" />
                          <span>Find Skema</span>
                          <ChevronRight className="ml-auto size-4 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="ml-4 mt-1 border-l-0 pl-4">
                          {findSkemaItems.map((item) => (
                            <SidebarMenuSubItem key={item.type}>
                              <SidebarMenuSubButton asChild className="py-2! text-[0.9rem]! rounded-lg!">
                                <a href={`${baseUrl}/FindSkema.aspx?type=${item.type}`}>
                                  <item.icon className="size-4 opacity-70" />
                                  <span>{item.title}</span>
                                </a>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild className="py-2! text-[0.9rem]! rounded-lg!">
                              <a href={`${baseUrl}/FindSkemaAdv.aspx`}>
                                <Search className="size-4 opacity-70" />
                                <span>Avanceret</span>
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
                        <SidebarMenuButton tooltip="Kalendervisninger" className="text-[1rem]! py-2.5! h-auto! rounded-lg!">
                          <CalendarDays className="size-5! opacity-80" />
                          <span>Ændringer</span>
                          <ChevronRight className="ml-auto size-4 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="ml-4 mt-1 border-l-0 pl-4">
                          {calendarItems.map((item) => (
                            <SidebarMenuSubItem key={item.page}>
                              <SidebarMenuSubButton asChild className="py-2! text-[0.9rem]! rounded-lg!">
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
        <SidebarSeparator className="mb-3 opacity-50" />
        <div className="relative" ref={menuRef}>
            {/* Dropdown menu - positioned above the trigger */}
            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="p-4 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 rounded-lg">
                      {profilePic ? (
                        <AvatarImage src={profilePic} alt={userName} className="object-cover object-top" />
                      ) : null}
                      <AvatarFallback className="rounded-lg text-base">
                        {userName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-semibold text-[1rem]!">{userName}</span>
                      <span className="truncate text-[0.85rem] text-muted-foreground">{userClass}</span>
                    </div>
                  </div>
                </div>
                <div className="p-1.5">
                  <a
                    href={`${baseUrl}/indstillinger/studentIndstillinger.aspx`}
                    className="flex items-center gap-3 px-3 py-2.5 text-[0.9rem] rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    <User className="size-[1.1rem] opacity-70" />
                    Profil
                  </a>
                  <a
                    href={`${baseUrl}/digitaltStudiekort.aspx`}
                    className="flex items-center gap-3 px-3 py-2.5 text-[0.9rem] rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    <IdCard className="size-[1.1rem] opacity-70" />
                    Studiekort
                  </a>
                  <a
                    href={`${baseUrl}/Elev_SPS.aspx`}
                    className="flex items-center gap-3 px-3 py-2.5 text-[0.9rem] rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    <ListChecks className="size-[1.1rem] opacity-70" />
                    SPS
                  </a>
                  <a
                    href={`${baseUrl}/bd/userreservations.aspx`}
                    className="flex items-center gap-3 px-3 py-2.5 text-[0.9rem] rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    <Library className="size-[1.1rem] opacity-70" />
                    Bøger
                  </a>
                  <a
                    href={`${baseUrl}/default.aspx?menu=kontakt`}
                    className="flex items-center gap-3 px-3 py-2.5 text-[0.9rem] rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    <MessageSquare className="size-[1.1rem] opacity-70" />
                    Kontakt
                  </a>
                  <a
                    href={`${baseUrl}/help/mainhelp.aspx`}
                    className="flex items-center gap-3 px-3 py-2.5 text-[0.9rem] rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    <HelpCircle className="size-[1.1rem] opacity-70" />
                    Hjælp
                  </a>
                </div>
                <div className="p-1.5 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-[0.9rem] rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    <Settings className="size-[1.1rem] opacity-70" />
                    Indstillinger
                  </button>
                </div>
                <div className="p-1.5 border-t border-border/50">
                  <a
                    href={`${baseUrl}/logout.aspx`}
                    onClick={(e) => {
                      e.preventDefault();
                      clearLoginState();
                      fetch(`${baseUrl}/logout.aspx`, { credentials: 'include' }).then(() => {
                        window.location.href = "https://www.lectio.dk";
                      });
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 text-[0.9rem] rounded-lg hover:bg-destructive/10 transition-colors text-destructive"
                  >
                    <LogOut className="size-[1.1rem]" />
                    Log ud
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
                  <AvatarImage src={profilePic} alt={userName} className="object-cover object-top" />
                ) : null}
                <AvatarFallback className="rounded-lg text-sm">
                  {userName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-snug">
                <span className="truncate font-medium text-[0.95rem]!">{userName}</span>
                <span className="truncate text-[0.8rem] text-muted-foreground/80">{userClass}</span>
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
          />
        </div>
      )}

      {/* Settings modal */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ActivityClassModal
        open={activityModalOpen}
        url={activityModalUrl}
        onOpenChange={(next) => {
          setActivityModalOpen(next);
          if (!next) {
            setActivityModalUrl(null);
          }
        }}
      />
    </Sidebar>
  );
}
