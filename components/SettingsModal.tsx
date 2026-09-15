import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { browser } from "wxt/browser";
import { safeGetManifest, safeRuntimeUrl } from "@/lib/safe-runtime";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { FeatureToggle } from "@/components/settings/FeatureToggle";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { HoldMappingEditor } from "@/components/settings/HoldMappingEditor";
import {
  getSettings,
  saveSettings,
  resetSettings,
  clearAllData,
  requiresReload,
  applySettingsSideEffects,
  type FeatureSettings,
} from "@/lib/settings-storage";
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  useTranslation,
  formatLocaleDate,
  getLocaleTag,
  type LocaleCode,
} from "@/lib/i18n";
import {
  THEME_PRESETS,
  type ThemePresetId,
} from "@/lib/theme-presets";
import {
  applyThemePreferenceToDocument,
  getThemePreferenceForSchool,
  saveThemePreferenceForSchool,
} from "@/lib/theme-storage";
import { getCachedProfile } from "@/lib/profile-cache";
import { capture, captureFeatureUsedOncePerSession, getDistinctId, setPersonProperties } from "@/lib/posthog";
import { clearPictureCache, getStarredPeople, getRecentPeople } from "@/lib/findskema-storage";
import {
  fetchSessionsData,
  deleteSession,
  isMobileDevice,
  cleanDeviceName,
  type SessionEntry,
} from "@/lib/profil-parser";
import {
  Info,
  Github,
  Palette,
  Wrench,
  ExternalLink,
  X,
  Chrome,
  Monitor,
  Smartphone,
  Shield,
  Clock,
  CalendarPlus,
  CalendarClock,
  Trash2,
  Calendar,
  PanelLeft,
  GraduationCap,
  FlaskConical,
  Copy,
  Check,
  Sparkles,
  Loader2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DesignPlayground } from "@/components/DesignPlayground";
import { ReferralShareCard } from "@/components/ReferralShareCard";
import { ProfilePictureEditor } from "@/components/ProfilPage";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowOnboarding?: () => void;
  initialSection?: string;
}


const VERSION_STORAGE_KEY = "betterlectio_version_info";

interface VersionInfo {
  version: string;
  firstInstalledAt: string;
  lastUpdatedAt: string;
}

function getVersionInfo(currentVersion: string): VersionInfo {
  try {
    const stored = localStorage.getItem(VERSION_STORAGE_KEY);
    if (stored) {
      const info = JSON.parse(stored);
      const firstInstalledAt = info.firstInstalledAt || info.installedAt || new Date().toISOString();

      if (info.version === currentVersion) {
        return {
          version: currentVersion,
          firstInstalledAt,
          lastUpdatedAt: info.lastUpdatedAt || firstInstalledAt,
        };
      }

      const updatedInfo: VersionInfo = {
        version: currentVersion,
        firstInstalledAt,
        lastUpdatedAt: new Date().toISOString(),
      };
      localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(updatedInfo));
      return updatedInfo;
    }
  } catch {
    // Ignore parse errors
  }

  const now = new Date().toISOString();
  const newInfo: VersionInfo = {
    version: currentVersion,
    firstInstalledAt: now,
    lastUpdatedAt: now,
  };
  localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(newInfo));
  return newInfo;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return formatLocaleDate(date, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getBrowserInfo(): string {
  const uad = (navigator as any).userAgentData as
    | { brands?: { brand: string; version: string }[] }
    | undefined;
  if (uad?.brands) {
    const brand =
      uad.brands.find(
        (b) => !b.brand.includes("Not") && b.brand !== "Chromium"
      ) ?? uad.brands.find((b) => b.brand === "Chromium");
    if (brand) return `${brand.brand} ${brand.version}`;
  }
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) {
    const match = ua.match(/Firefox\/(\d+)/);
    return `Firefox ${match?.[1] ?? ""}`;
  }
  if (ua.includes("Edg/")) {
    const match = ua.match(/Edg\/(\d+)/);
    return `Edge ${match?.[1] ?? ""}`;
  }
  if (ua.includes("Chrome")) {
    const match = ua.match(/Chrome\/(\d+)/);
    return `Chrome ${match?.[1] ?? ""}`;
  }
  if (ua.includes("Safari")) {
    const match = ua.match(/Version\/(\d+)/);
    return `Safari ${match?.[1] ?? ""}`;
  }
  return "Ukendt";
}

function getOSInfo(): string {
  const uad = (navigator as any).userAgentData as
    | { platform?: string }
    | undefined;
  if (uad?.platform) return uad.platform;
  const ua = navigator.userAgent;
  if (ua.includes("Windows NT 10")) return "Windows 10/11";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS X")) {
    const match = ua.match(/Mac OS X (\d+[._]\d+)/);
    if (match) {
      return `macOS ${match[1].replace("_", ".")}`;
    }
    return "macOS";
  }
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iOS")) return "iOS";
  return "Ukendt";
}

function getSchoolIdFromUrl(): string | null {
  return window.location.pathname.match(/\/lectio\/(\d+)\//)?.[1] ?? null;
}

function getSchoolNameFromPage(): string | null {
  const meta = document.querySelector('meta[name="application-name"]');
  if (meta) {
    const content = meta.getAttribute("content") || "";
    const match = content.match(/^Lectio-\s*(.+)$/);
    if (match) return match[1];
  }

  const titleMatch = document.title.match(/ - Lectio - (.+)$/);
  if (titleMatch) return titleMatch[1];

  const el = document.querySelector(".ls-master-header-institution-name");
  return el?.textContent?.trim() || null;
}

export function SettingsModal({ open, onOpenChange, onShowOnboarding, initialSection }: SettingsModalProps) {
  const { t } = useTranslation();
  const navItems = [
    { id: "appearance", name: t('settings.nav.appearance'), icon: Palette },
    { id: "sidebar", name: t('settings.nav.sidebar'), icon: PanelLeft },
    { id: "subjects", name: t('settings.nav.subjects'), icon: GraduationCap },
    { id: "invite", name: "Inviter", icon: UserPlus },
    { id: "sessions", name: t('settings.nav.sessions'), icon: Shield },
    { id: "advanced", name: t('settings.nav.advanced'), icon: Wrench },
    { id: "about", name: t('settings.nav.about'), icon: Info },
  ];
  const version = safeGetManifest()?.version ?? '';
  const lectioVersion = (document.getElementById("s_m_VersionInfoLink") ?? document.getElementById("m_VersionInfoLink"))?.textContent?.replace(/^\s*Lectio\s+version\s*/i, "")?.trim() ?? null;
  const logoUrl = safeRuntimeUrl("/assets/logo-transparent.svg");
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState("appearance");
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [settings, setSettings] = useState<FeatureSettings>(() => getSettings());
  const schoolId = getSchoolIdFromUrl();
  const studentId = getCachedProfile()?.studentId ?? null;
  const schoolTheme = getThemePreferenceForSchool(schoolId);
  const [themeId, setThemeId] = useState<ThemePresetId>(schoolTheme.themeId);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [supabaseExpiry, setSupabaseExpiry] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const sessionsFetchedRef = useRef(false);
  const [deletingSessionIndex, setDeletingSessionIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open && initialSection && navItems.some((item) => item.id === initialSection)) {
      setActiveSection(initialSection);
    }
  }, [open, initialSection]);

  const getPostHogDistinctId = () => {
    const profile = getCachedProfile();
    return profile?.studentId ? getDistinctId(profile.studentId) : null;
  };

  // Get version info on mount
  useEffect(() => {
    setVersionInfo(getVersionInfo(version));
  }, [version]);

  // Reload settings when modal opens
  useEffect(() => {
    if (open) {
      setSettings(getSettings());
      const preference = getThemePreferenceForSchool(getSchoolIdFromUrl());
      setThemeId(preference.themeId);

      const distinctId = getPostHogDistinctId();
      if (distinctId) {
        captureFeatureUsedOncePerSession("settings_modal", distinctId, {
          school_id: getSchoolIdFromUrl(),
        });
      }
    }
  }, [open]);

  // Fetch sessions when advanced tab is shown
  useEffect(() => {
    if (!open || activeSection !== 'sessions' || sessionsFetchedRef.current || !schoolId) return;
    sessionsFetchedRef.current = true;
    setSessionsLoading(true);
    fetchSessionsData(schoolId)
      .then(setSessions)
      .catch((err) => console.error('[BetterLectio] Failed to load sessions:', err))
      .finally(() => setSessionsLoading(false));
  }, [open, activeSection, schoolId]);

  // Reset sessions fetch ref when modal closes
  useEffect(() => {
    if (!open) {
      sessionsFetchedRef.current = false;
    }
  }, [open]);

  const handleDeleteSession = async (deleteIndex: number) => {
    if (!schoolId) return;
    setDeletingSessionIndex(deleteIndex);
    try {
      const updated = await deleteSession(schoolId, deleteIndex);
      setSessions(updated);
    } catch (err) {
      console.error('[BetterLectio] Failed to delete session:', err);
    } finally {
      setDeletingSessionIndex(null);
    }
  };

  // Check Supabase auth status when about tab is shown
  useEffect(() => {
    if (!open || activeSection !== 'about') return;
    setSupabaseStatus('loading');
    browser.runtime.sendMessage({ type: 'bl-sb:auth:session' })
      .then((resp: any) => {
        if (resp?.ok && resp.session?.expires_at) {
          setSupabaseStatus('authenticated');
          setSupabaseExpiry(resp.session.expires_at);
        } else {
          setSupabaseStatus('unauthenticated');
          setSupabaseExpiry(null);
        }
      })
      .catch(() => {
        setSupabaseStatus('unauthenticated');
        setSupabaseExpiry(null);
      });
  }, [open, activeSection]);

  // Handle escape key and focus trap
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };

    contentRef.current?.focus();

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const activeName = navItems.find((item) => item.id === activeSection)?.name ?? "Om";

  const browserInfo = getBrowserInfo();
  const osInfo = getOSInfo();
  const schoolName = getSchoolNameFromPage();
  const screenDimensions = `${window.screen.width} × ${window.screen.height}`;
  const debugInfoLines = [
    `BetterLectio: v${version}`,
    lectioVersion ? `Lectio: ${lectioVersion}` : null,
    `Browser: ${browserInfo}`,
    `OS: ${osInfo}`,
    `Screen: ${screenDimensions}`,
    `School name: ${schoolName ?? t('settings.unknown')}`,
    `School ID: ${schoolId ?? t('settings.unknown')}`,
    `Viewport: ${window.innerWidth} × ${window.innerHeight}`,
    `Dark mode: ${document.documentElement.classList.contains("dark") ? "Yes" : "No"}`,
    versionInfo ? `Installed: ${formatDate(versionInfo.firstInstalledAt)}` : null,
    versionInfo && versionInfo.firstInstalledAt !== versionInfo.lastUpdatedAt
      ? `Updated: ${formatDate(versionInfo.lastUpdatedAt)}`
      : null,
    `URL: ${window.location.href}`,
    `User-Agent: ${navigator.userAgent}`,
  ].filter((line): line is string => Boolean(line));
  // const reportIssueBody = [
  //   "## Beskrivelse",
  //   "<!-- Beskriv problemet og hvordan det kan genskabes -->",
  //   "",
  //   "## Debug info",
  //   "```text",
  //   ...debugInfoLines,
  //   "```",
  // ].join("\n");
  // const reportIssueUrl =
  //   `https://github.com/jonbng/betterlectio/issues/new?body=${encodeURIComponent(reportIssueBody)}`;

  const handleSettingChange = <
    K extends keyof Omit<FeatureSettings, 'version'>,
    Field extends keyof FeatureSettings[K],
  >(
    category: K,
    key: Field,
    value: FeatureSettings[K][Field]
  ) => {
    const prev = settings;
    // Deep copy to avoid mutation issues
    const newSettings = {
      ...settings,
      [category]: {
        ...settings[category],
        [key]: value,
      },
    };
    setSettings(newSettings as FeatureSettings);
    saveSettings(newSettings as FeatureSettings);

    const distinctId = getPostHogDistinctId();
    if (distinctId && !(category === "behavior" && key === "analyticsOptOut" && value)) {
      capture("setting changed", distinctId, {
        category,
        key: String(key),
        value,
        school_id: schoolId,
      });
    }

    // Live DOM/event side effects (dark mode toggle, locale change,
    // opgave deadlines event, opt-out mirror to extension storage).
    applySettingsSideEffects(prev, newSettings as FeatureSettings);

    // Person-property updates stay here — they're per-user-action and
    // don't need to fire from the cross-device hydrate path.
    if (distinctId && category === "visual" && key === "darkMode") {
      setPersonProperties(distinctId, { dark_mode: value as boolean });
    }
    if (
      distinctId &&
      category === "interface" &&
      key === "language" &&
      isSupportedLocale(value)
    ) {
      setPersonProperties(distinctId, { language: value });
    }

    if (requiresReload(category, key as string)) {
      toast(t('settings.reloadToast'), {
        action: {
          label: t('settings.reload'),
          onClick: () => window.location.reload(),
        },
        duration: 5000,
      });
    }
  };

  const handleClearPictureCache = () => {
    clearPictureCache();
    toast.success(t('settings.pictureCacheCleared'));
  };

  const saveThemePreference = (nextThemeId: ThemePresetId) => {
    saveThemePreferenceForSchool(schoolId, {
      themeId: nextThemeId,
    });
    applyThemePreferenceToDocument({
      themeId: nextThemeId,
    });
  };

  const handleThemeChange = (nextThemeId: ThemePresetId) => {
    setThemeId(nextThemeId);
    saveThemePreference(nextThemeId);

    const distinctId = getPostHogDistinctId();
    if (distinctId) {
      capture("theme changed", distinctId, {
        school_id: schoolId,
        theme_id: nextThemeId,
      });
      setPersonProperties(distinctId, {
        theme_id: nextThemeId,
      });
    }
  };

  const handleClearAllData = () => {
    clearAllData();
    setSettings(getSettings());
    toast.success(t('settings.allDataCleared'), {
      action: {
        label: t('settings.reload'),
        onClick: () => window.location.reload(),
      },
    });
  };

  const handleResetSettings = () => {
    resetSettings();
    setSettings(getSettings());
    toast.success(t('settings.settingsReset'), {
      action: {
        label: t('settings.reload'),
        onClick: () => window.location.reload(),
      },
    });
  };

  // Get data counts for display
  const starredCount = getStarredPeople().length;
  const recentsCount = getRecentPeople().length;

  const renderContent = () => {
    switch (activeSection) {
      case "about":
        return (
          <div className="space-y-8">
            <div className="flex items-center justify-center gap-2">
              <img
                src={logoUrl}
                alt="BetterLectio"
                width={64}
                height={64}
                className="size-16 shrink-0 dark:invert dark:brightness-110"
              />
              <h1 className="text-3xl! font-bold! text-foreground">
                BetterLectio
              </h1>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-8 rounded-md bg-primary/10">
                    <Info className="size-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{t('settings.about.version')}</span>
                </div>
                <Badge variant="secondary" className="text-sm">
                  v{version}
                </Badge>
              </div>

              {lectioVersion && (
                <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-8 rounded-md bg-primary/10">
                      <Info className="size-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium">{t('settings.about.lectioVersion')}</span>
                  </div>
                  <Badge variant="outline" className="text-sm">
                    {lectioVersion}
                  </Badge>
                </div>
              )}

              {versionInfo && (
                <>
                  <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center size-8 rounded-md bg-primary/10">
                        <Calendar className="size-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{t('settings.about.firstInstalled')}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(versionInfo.firstInstalledAt)}
                    </span>
                  </div>
                  {versionInfo.firstInstalledAt !== versionInfo.lastUpdatedAt && (
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center size-8 rounded-md bg-primary/10">
                          <Calendar className="size-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{t('settings.about.lastUpdated')}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(versionInfo.lastUpdatedAt)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href="https://chromewebstore.google.com/detail/betterlectio/cbopfnaegoknpplkngoppmmomppimhkh"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background text-foreground hover:bg-accent cursor-pointer transition-[color,background-color] duration-150 no-underline"
              >
                <Chrome className="size-4" />
                Chrome Web Store
                <ExternalLink className="size-3" />
              </a>
              <a
                href="https://addons.mozilla.org/en-US/firefox/addon/betterlectio/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background text-foreground hover:bg-accent cursor-pointer transition-[color,background-color] duration-150 no-underline"
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-4"
                >
                  <title>Firefox Browser</title>
                  <path d="M8.824 7.287c.008 0 .004 0 0 0zm-2.8-1.4c.006 0 .003 0 0 0zm16.754 2.161c-.505-1.215-1.53-2.528-2.333-2.943.654 1.283 1.033 2.57 1.177 3.53l.002.02c-1.314-3.278-3.544-4.6-5.366-7.477-.091-.147-.184-.292-.273-.446a3.545 3.545 0 01-.13-.24 2.118 2.118 0 01-.172-.46.03.03 0 00-.027-.03.038.038 0 00-.021 0l-.006.001a.037.037 0 00-.01.005L15.624 0c-2.585 1.515-3.657 4.168-3.932 5.856a6.197 6.197 0 00-2.305.587.297.297 0 00-.147.37c.057.162.24.24.396.17a5.622 5.622 0 012.008-.523l.067-.005a5.847 5.847 0 011.957.222l.095.03a5.816 5.816 0 01.616.228c.08.036.16.073.238.112l.107.055a5.835 5.835 0 01.368.211 5.953 5.953 0 012.034 2.104c-.62-.437-1.733-.868-2.803-.681 4.183 2.09 3.06 9.292-2.737 9.02a5.164 5.164 0 01-1.513-.292 4.42 4.42 0 01-.538-.232c-1.42-.735-2.593-2.121-2.74-3.806 0 0 .537-2 3.845-2 .357 0 1.38-.998 1.398-1.287-.005-.095-2.029-.9-2.817-1.677-.422-.416-.622-.616-.8-.767a3.47 3.47 0 00-.301-.227 5.388 5.388 0 01-.032-2.842c-1.195.544-2.124 1.403-2.8 2.163h-.006c-.46-.584-.428-2.51-.402-2.913-.006-.025-.343.176-.389.206-.406.29-.787.616-1.136.974-.397.403-.76.839-1.085 1.303a9.816 9.816 0 00-1.562 3.52c-.003.013-.11.487-.19 1.073-.013.09-.026.181-.037.272a7.8 7.8 0 00-.069.667l-.002.034-.023.387-.001.06C.386 18.795 5.593 24 12.016 24c5.752 0 10.527-4.176 11.463-9.661.02-.149.035-.298.052-.448.232-1.994-.025-4.09-.753-5.844z" />
                </svg>
                Firefox Add-ons
                <ExternalLink className="size-3" />
              </a>
              <a
                href="https://github.com/jonbng/betterlectio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background text-foreground hover:bg-accent cursor-pointer transition-[color,background-color] duration-150 no-underline"
              >
                <Github className="size-4" />
                GitHub
                <ExternalLink className="size-3" />
              </a>
              {/* <a
                href={reportIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background text-foreground hover:bg-accent cursor-pointer transition-[color,background-color] duration-150 no-underline"
              >
                <Bug className="size-4" />
                Rapporter problem
                <ExternalLink className="size-3" />
              </a> */}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t('settings.about.debugInfoTitle')}
              </h3>
              <div className="rounded-lg border bg-muted/30 divide-y divide-border">
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Chrome className="size-4 text-muted-foreground" />
                    <span className="text-sm">{t('settings.about.browserLabel')}</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {browserInfo}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="size-4 text-muted-foreground" />
                    <span className="text-sm">{t('settings.about.osLabel')}</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {osInfo}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="size-4 text-muted-foreground" />
                    <span className="text-sm">{t('settings.about.screenResolutionLabel')}</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {screenDimensions}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Info className="size-4 text-muted-foreground" />
                    <span className="text-sm">{t('settings.about.schoolNameLabel')}</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {schoolName ?? t('settings.unknown')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Info className="size-4 text-muted-foreground" />
                    <span className="text-sm">{t('settings.about.schoolIdLabel')}</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {schoolId ?? t('settings.unknown')}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => {
                  const lines = debugInfoLines.join("\n");
                  navigator.clipboard.writeText(lines).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? t('settings.about.copied') : t('settings.about.copyDebugInfo')}
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t('settings.about.servicesTitle')}
              </h3>
              <div className="rounded-lg border bg-muted/30 divide-y divide-border">
                <div className="py-3 px-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t('settings.about.analyticsName')}</span>
                    <Badge variant={settings.behavior?.analyticsOptOut ? "outline" : "secondary"} className="text-xs">
                      {settings.behavior?.analyticsOptOut ? t('settings.about.analyticsOptOut') : t('settings.about.analyticsActive')}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.about.analyticsDescription')}
                  </p>
                </div>
                <div className="py-3 px-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t('settings.about.dbName')}</span>
                    <Badge
                      variant={supabaseStatus === 'authenticated' ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {supabaseStatus === 'loading' ? t('settings.about.dbLoading') : supabaseStatus === 'authenticated' ? t('settings.about.dbLoggedIn') : t('settings.about.dbNotLoggedIn')}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.about.dbDescription')}
                    {supabaseStatus === 'authenticated' && supabaseExpiry && (
                      <>{t('settings.about.sessionExpires', { date: new Date(supabaseExpiry * 1000).toLocaleString(getLocaleTag(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {t('settings.about.developedBy')}{" "}
              <a
                href="https://jonathanb.dk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline cursor-pointer"
              >
                Jonathan Bangert
              </a>
            </p>
          </div>
        );

      case "appearance":
        return (
          <div className="space-y-6">
            <SettingsSection
              title={t('settings.appearance.themeTitle')}
              description={
                schoolName
                  ? t('settings.appearance.themeDescriptionWithSchool', { school: schoolName })
                  : t('settings.appearance.themeDescriptionDefault')
              }
            >
              <div className="px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">{t('settings.appearance.colorThemeLabel')}</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="visual-darkmode" className="text-sm text-muted-foreground cursor-pointer">
                      {t('settings.appearance.darkModeLabel')}
                    </Label>
                    <Switch
                      id="visual-darkmode"
                      checked={settings.visual?.darkMode ?? false}
                      onCheckedChange={(v) => handleSettingChange("visual", "darkMode", v)}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {THEME_PRESETS.map((preset) => {
                    const isDark = settings.visual?.darkMode ?? false;
                    const c = isDark ? preset.colors.dark : preset.colors.light;
                    const isSelected = themeId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleThemeChange(preset.id)}
                        className={`group cursor-pointer rounded-lg border-2 transition-all overflow-hidden ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/25 scale-[1.02]"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        {/* Mini UI preview */}
                        <div
                          className="flex h-16"
                          style={{ backgroundColor: c.bg }}
                        >
                          {/* Mini sidebar */}
                          <div
                            className="w-[30%] flex flex-col gap-1 p-1.5 border-r"
                            style={{ backgroundColor: c.sidebar, borderColor: `color-mix(in oklch, ${c.sidebar} 70%, ${c.primary} 30%)` }}
                          >
                            <div className="h-1.5 w-full rounded-sm" style={{ backgroundColor: c.primary }} />
                            <div className="h-1 w-[80%] rounded-sm" style={{ backgroundColor: c.accent }} />
                            <div className="h-1 w-[60%] rounded-sm" style={{ backgroundColor: c.accent }} />
                          </div>
                          {/* Mini content area */}
                          <div className="flex-1 p-1.5 flex flex-col gap-1">
                            <div className="h-1.5 w-[60%] rounded-sm" style={{ backgroundColor: c.primary, opacity: 0.7 }} />
                            <div className="h-1 w-full rounded-sm" style={{ backgroundColor: c.accent }} />
                            <div className="h-1 w-[85%] rounded-sm" style={{ backgroundColor: c.accent }} />
                            <div className="mt-auto h-2 w-[40%] rounded-sm" style={{ backgroundColor: c.primary }} />
                          </div>
                        </div>
                        {/* Label */}
                        <div
                          className="text-xs font-medium py-1 text-center border-t"
                          style={{
                            backgroundColor: c.sidebar,
                            borderColor: `color-mix(in oklch, ${c.sidebar} 70%, ${c.primary} 30%)`,
                            color: isSelected ? c.primary : `color-mix(in oklch, ${c.bg} 30%, ${c.primary} 70%)`,
                          }}
                        >
                          {preset.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              title={t('settings.appearance.language')}
              description={t('settings.appearance.languageDescription')}
            >
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <Label htmlFor="interface-language" className="font-medium">
                  {t('settings.appearance.language')}
                </Label>
                <select
                  id="interface-language"
                  value={settings.interface?.language ?? DEFAULT_LOCALE}
                  onChange={(e) => {
                    const v = (e.currentTarget as HTMLSelectElement).value;
                    if (isSupportedLocale(v)) {
                      handleSettingChange("interface", "language", v as LocaleCode);
                    }
                  }}
                  className="h-9 w-44 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none cursor-pointer transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
                >
                  {SUPPORTED_LOCALES.map((code) => (
                    <option key={code} value={code}>
                      {LOCALE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>
            </SettingsSection>

            <SettingsSection title={t('settings.appearance.forsideTitle')}>
              <FeatureToggle
                id="forside-aktuel-info"
                label={t('settings.appearance.aktuelInfoLabel')}
                description={t('settings.appearance.aktuelInfoDescription')}
                enabled={settings.forside?.showAktuelInfo ?? true}
                onChange={(v) => handleSettingChange('forside', 'showAktuelInfo', v)}
              />
            </SettingsSection>

            <SettingsSection title={t('settings.appearance.scheduleTitle')}>
              <FeatureToggle
                id="schedule-today"
                label={t('settings.appearance.todayHighlightLabel')}
                description={t('settings.appearance.todayHighlightDescription')}
                enabled={settings.schedule?.todayHighlight ?? true}
                onChange={(v) => handleSettingChange('schedule', 'todayHighlight', v)}
                hasDependent={
                  (settings.schedule?.currentTimeIndicator ?? true) ||
                  (settings.schedule?.currentTimeLabel ?? false)
                }
                requiresReload
              />
              <FeatureToggle
                id="schedule-time"
                label={t('settings.appearance.timeIndicatorLabel')}
                description={t('settings.appearance.timeIndicatorDescription')}
                enabled={settings.schedule?.currentTimeIndicator ?? true}
                onChange={(v) => handleSettingChange('schedule', 'currentTimeIndicator', v)}
                disabled={!(settings.schedule?.todayHighlight ?? true)}
                disabledReason={t('settings.appearance.timeIndicatorDisabledReason')}
                hasDependent={settings.schedule?.currentTimeLabel ?? false}
                requiresReload
              />
              <FeatureToggle
                id="schedule-time-label"
                label={t('settings.appearance.timeLabelLabel')}
                description={t('settings.appearance.timeLabelDescription')}
                enabled={settings.schedule?.currentTimeLabel ?? false}
                onChange={(v) => handleSettingChange('schedule', 'currentTimeLabel', v)}
                disabled={
                  !(settings.schedule?.currentTimeIndicator ?? true) ||
                  !(settings.schedule?.todayHighlight ?? true)
                }
                disabledReason={t('settings.appearance.timeLabelDisabledReason')}
                requiresReload
              />
              <FeatureToggle
                id="schedule-countdown"
                label={t('settings.appearance.countdownLabel')}
                description={t('settings.appearance.countdownDescription')}
                enabled={settings.schedule?.countdownBar ?? true}
                onChange={(v) => handleSettingChange('schedule', 'countdownBar', v)}
              />
              <FeatureToggle
                id="schedule-subject-colors"
                label={t('settings.appearance.subjectColorsLabel')}
                description={t('settings.appearance.subjectColorsDescription')}
                enabled={settings.schedule?.subjectColors ?? false}
                onChange={(v) => handleSettingChange('schedule', 'subjectColors', v)}
                requiresReload
              />
              <FeatureToggle
                id="schedule-end-of-module-effect"
                label={t('settings.appearance.endOfModuleEffectLabel')}
                description={t('settings.appearance.endOfModuleEffectDescription')}
                enabled={settings.schedule?.endOfModuleEffect ?? true}
                onChange={(v) => handleSettingChange('schedule', 'endOfModuleEffect', v)}
              />
              <FeatureToggle
                id="schedule-opgave-deadlines"
                label={t('settings.appearance.opgaveDeadlinesLabel')}
                description={t('settings.appearance.opgaveDeadlinesDescription')}
                enabled={settings.schedule?.opgaveDeadlines ?? false}
                onChange={(v) => handleSettingChange('schedule', 'opgaveDeadlines', v)}
              />
            </SettingsSection>

          </div>
        );

      case "sidebar":
        return (
          <div className="space-y-6">
            <SettingsSection title={t('settings.sidebar.layoutTitle')} description={t('settings.sidebar.layoutDescription')}>
              <div className="grid grid-cols-2 gap-3 px-4 py-4">
                {([
                  {
                    value: 'sidebar' as const,
                    label: t('settings.sidebar.sidebarLayout'),
                    description: t('settings.sidebar.sidebarLayoutDescription'),
                  },
                  {
                    value: 'horizontal' as const,
                    label: t('settings.sidebar.horizontalLayout'),
                    description: t('settings.sidebar.horizontalLayoutDescription'),
                  },
                ]).map((option) => {
                  const selected = (settings.interface?.navigationLayout ?? 'sidebar') === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleSettingChange('interface', 'navigationLayout', option.value)}
                      className={cn(
                        'group cursor-pointer overflow-hidden rounded-xl border-2 text-left transition-[border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected ? 'border-primary shadow-sm ring-2 ring-primary/15' : 'border-border hover:border-primary/40',
                      )}
                    >
                      <div className="flex h-20 bg-background p-2">
                        {option.value === 'sidebar' ? (
                          <>
                            <div className="flex w-[32%] flex-col gap-1.5 rounded-md border bg-sidebar p-1.5">
                              <span className="h-1.5 w-3/4 rounded-full bg-primary" />
                              <span className="h-1 w-full rounded-full bg-sidebar-accent" />
                              <span className="h-1 w-4/5 rounded-full bg-sidebar-accent" />
                              <span className="h-1 w-2/3 rounded-full bg-sidebar-accent" />
                            </div>
                            <div className="flex-1 p-2"><span className="block h-2 w-1/2 rounded-full bg-muted" /></div>
                          </>
                        ) : (
                          <div className="flex flex-1 flex-col gap-2">
                            <div className="flex h-7 items-center gap-1.5 rounded-md border bg-sidebar px-2">
                              <span className="size-2 rounded-sm bg-primary" />
                              <span className="h-1 w-8 rounded-full bg-sidebar-accent" />
                              <span className="h-1 w-6 rounded-full bg-sidebar-accent" />
                              <span className="ml-auto size-3 rounded-full bg-primary/50" />
                            </div>
                            <div className="flex h-4 items-center gap-1.5 border-b px-2">
                              <span className="h-1 w-10 rounded-full bg-primary" />
                              <span className="h-1 w-7 rounded-full bg-muted" />
                              <span className="h-1 w-8 rounded-full bg-muted" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="border-t px-3 py-2.5">
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SettingsSection>

            <SettingsSection title={t('settings.sidebar.mainMenuTitle')} description={t('settings.sidebar.mainMenuDescription')}>
              <FeatureToggle
                id="sidebar-forside"
                label={t('settings.sidebar.forside.label')}
                description={t('settings.sidebar.forside.description')}
                enabled={settings.sidebar?.showForside ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showForside', v)}
              />
              <FeatureToggle
                id="sidebar-skema"
                label={t('settings.sidebar.skema.label')}
                description={t('settings.sidebar.skema.description')}
                enabled={settings.sidebar?.showSkema ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showSkema', v)}
              />
              <FeatureToggle
                id="sidebar-elever"
                label={t('settings.sidebar.elever.label')}
                description={t('settings.sidebar.elever.description')}
                enabled={settings.sidebar?.showElever ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showElever', v)}
              />
              <FeatureToggle
                id="sidebar-opgaver"
                label={t('settings.sidebar.opgaver.label')}
                description={t('settings.sidebar.opgaver.description')}
                enabled={settings.sidebar?.showOpgaver ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showOpgaver', v)}
              />
              <FeatureToggle
                id="sidebar-lektier"
                label={t('settings.sidebar.lektier.label')}
                description={t('settings.sidebar.lektier.description')}
                enabled={settings.sidebar?.showLektier ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showLektier', v)}
              />
              <FeatureToggle
                id="sidebar-beskeder"
                label={t('settings.sidebar.beskeder.label')}
                description={t('settings.sidebar.beskeder.description')}
                enabled={settings.sidebar?.showBeskeder ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showBeskeder', v)}
              />
            </SettingsSection>

            <SettingsSection title={t('settings.sidebar.secondaryMenuTitle')} description={t('settings.sidebar.secondaryMenuDescription')}>
              <FeatureToggle
                id="sidebar-karakterer"
                label={t('settings.sidebar.karakterer.label')}
                description={t('settings.sidebar.karakterer.description')}
                enabled={settings.sidebar?.showKarakterer ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showKarakterer', v)}
              />
              <FeatureToggle
                id="sidebar-fravaer"
                label={t('settings.sidebar.fravaer.label')}
                description={t('settings.sidebar.fravaer.description')}
                enabled={settings.sidebar?.showFravaer ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showFravaer', v)}
              />
              <FeatureToggle
                id="sidebar-studieplan"
                label={t('settings.sidebar.studieplan.label')}
                description={t('settings.sidebar.studieplan.description')}
                enabled={settings.sidebar?.showStudieplan ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showStudieplan', v)}
              />
              <FeatureToggle
                id="sidebar-dokumenter"
                label={t('settings.sidebar.dokumenter.label')}
                description={t('settings.sidebar.dokumenter.description')}
                enabled={settings.sidebar?.showDokumenter ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showDokumenter', v)}
              />
              <FeatureToggle
                id="sidebar-modulregnskaber"
                label={t('settings.sidebar.modulregnskaber.label')}
                description={t('settings.sidebar.modulregnskaber.description')}
                enabled={settings.sidebar?.showModulregnskaber ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showModulregnskaber', v)}
              />
              <FeatureToggle
                id="sidebar-lokaler"
                label={t('settings.sidebar.lokaler.label')}
                description={t('settings.sidebar.lokaler.description')}
                enabled={settings.sidebar?.showLokaler ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showLokaler', v)}
              />
              <FeatureToggle
                id="sidebar-spoergeskema"
                label={t('settings.sidebar.spoergeskema.label')}
                description={t('settings.sidebar.spoergeskema.description')}
                enabled={settings.sidebar?.showSpoergeskema ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showSpoergeskema', v)}
              />
              <FeatureToggle
                id="sidebar-uvbeskrivelser"
                label={t('settings.sidebar.uvbeskrivelser.label')}
                description={t('settings.sidebar.uvbeskrivelser.description')}
                enabled={settings.sidebar?.showUVBeskrivelser ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showUVBeskrivelser', v)}
              />
            </SettingsSection>

            <SettingsSection title={t('settings.sidebar.sectionsTitle')} description={t('settings.sidebar.sectionsDescription')}>
              <FeatureToggle
                id="sidebar-findskema"
                label={t('settings.sidebar.findskema.label')}
                description={t('settings.sidebar.findskema.description')}
                enabled={settings.sidebar?.showFindSkema ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showFindSkema', v)}
              />
              <FeatureToggle
                id="sidebar-aendringer"
                label={t('settings.sidebar.aendringer.label')}
                description={t('settings.sidebar.aendringer.description')}
                enabled={settings.sidebar?.showAendringer ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showAendringer', v)}
              />
            </SettingsSection>
          </div>
        );

      case "subjects":
        return <HoldMappingEditor />;

      case "invite":
        return (
          <div className="space-y-6">
            <SettingsSection
              title="Inviter venner"
              description="Del dit personlige link og få æren for at have inviteret dem."
            >
              <ReferralShareCard />
              {studentId && schoolId && (
                <div className="border-t border-border px-4 py-4">
                  <ProfilePictureEditor
                    studentId={studentId}
                    schoolId={schoolId}
                    hideWhenLocked
                  />
                </div>
              )}
            </SettingsSection>
          </div>
        );

      case "sessions":
        return (
          <div className="space-y-6">
            <SettingsSection title={t('settings.sessions.title')} description={t('settings.sessions.description')}>
              {sessionsLoading ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t('settings.sessions.loading')}
                </div>
              ) : sessions.length === 0 ? (
                <div className="px-4 py-4 text-sm text-muted-foreground">
                  {t('settings.sessions.noSessions')}
                </div>
              ) : (
                <div className="px-2 py-1">
                  <div className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
                    <Shield className="size-3.5" />
                    <span>{sessions.length !== 1 ? t('settings.sessions.deviceCountPlural', { count: String(sessions.length) }) : t('settings.sessions.deviceCount', { count: String(sessions.length) })}</span>
                  </div>
                  {sessions.map((session, i) => {
                    const mobile = isMobileDevice(session.device);
                    const DeviceIcon = mobile ? Smartphone : Monitor;
                    const deviceName = session.isCurrent
                      ? cleanDeviceName(session.device)
                      : session.device;

                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-[color,background-color] duration-150',
                          session.isCurrent
                            ? 'bg-[oklch(0.97_0.02_145)] dark:bg-[oklch(0.18_0.02_145)]'
                            : 'hover:bg-accent/30',
                        )}
                      >
                        <div
                          className={cn(
                            'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
                            session.isCurrent
                              ? 'bg-[oklch(0.92_0.04_145)] dark:bg-[oklch(0.24_0.03_145)]'
                              : 'bg-muted',
                          )}
                        >
                          <DeviceIcon
                            className={cn(
                              'w-4 h-4',
                              session.isCurrent
                                ? 'text-[oklch(0.45_0.15_145)] dark:text-[oklch(0.70_0.12_145)]'
                                : 'text-muted-foreground',
                            )}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {deviceName}
                            </span>
                            {session.isCurrent && (
                              <Badge
                                className="text-[0.55rem] px-1.5 py-0 border-0"
                                style={{
                                  backgroundColor: 'oklch(0.88 0.06 145)',
                                  color: 'oklch(0.35 0.12 145)',
                                }}
                              >
                                {t('settings.sessions.thisDevice')}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[0.65rem] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {session.lastLogin}
                            </span>
                            <span className="flex items-center gap-1">
                              <CalendarPlus className="w-3 h-3" />
                              {session.created}
                            </span>
                            <span className="flex items-center gap-1">
                              <CalendarClock className="w-3 h-3" />
                              {session.expiry}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteSession(session.deleteIndex)}
                          disabled={deletingSessionIndex !== null}
                          title={t('settings.sessions.deleteSession')}
                          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 hover:bg-destructive/10 transition-[color,background-color] duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {deletingSessionIndex === session.deleteIndex ? (
                            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-[color,background-color] duration-150" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </SettingsSection>
          </div>
        );

      case "advanced":
        return (
          <div className="space-y-6">
            <SettingsSection title={t('settings.advanced.behaviorTitle')}>
              <div className="flex items-center justify-between gap-4 py-3 px-4">
                <div className="space-y-0.5 pr-4">
                  <Label className="font-medium">{t('settings.advanced.activityViewModeLabel')}</Label>
                  <p className="text-sm text-muted-foreground">{t('settings.advanced.activityViewModeDescription')}</p>
                </div>
                <div
                  role="radiogroup"
                  aria-label={t('settings.advanced.activityViewModeLabel')}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 p-1"
                >
                  {(['modal', 'sheet'] as const).map((mode) => {
                    const active = (settings.behavior?.activityViewMode ?? 'modal') === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => handleSettingChange('behavior', 'activityViewMode', mode)}
                        className={`cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 active:scale-[0.97] ${
                          active
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t(`settings.advanced.activityViewMode.${mode}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 py-3 px-4">
                <div className="space-y-0.5 pr-4">
                  <Label className="font-medium">{t('settings.advanced.opgaveViewModeLabel')}</Label>
                  <p className="text-sm text-muted-foreground">{t('settings.advanced.opgaveViewModeDescription')}</p>
                </div>
                <div
                  role="radiogroup"
                  aria-label={t('settings.advanced.opgaveViewModeLabel')}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 p-1"
                >
                  {(['modal', 'sheet'] as const).map((mode) => {
                    const active = (settings.behavior?.opgaveViewMode ?? 'sheet') === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => handleSettingChange('behavior', 'opgaveViewMode', mode)}
                        className={`cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 active:scale-[0.97] ${
                          active
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t(`settings.advanced.opgaveViewMode.${mode}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <FeatureToggle
                id="behavior-messages"
                label={t('settings.advanced.messagesLabel')}
                description={t('settings.advanced.messagesDescription')}
                enabled={settings.behavior?.messagesAutoRedirect ?? true}
                onChange={(v) => handleSettingChange('behavior', 'messagesAutoRedirect', v)}
              />
              <FeatureToggle
                id="behavior-lastschool"
                label={t('settings.advanced.lastSchoolLabel')}
                description={t('settings.advanced.lastSchoolDescription')}
                enabled={settings.behavior?.continueToLastSchool ?? true}
                onChange={(v) => handleSettingChange('behavior', 'continueToLastSchool', v)}
              />
            </SettingsSection>

            <SettingsSection title={t('settings.advanced.dataTitle')}>
              <FeatureToggle
                id="data-starred"
                label={t('settings.advanced.starredLabel')}
                description={t('settings.advanced.starredDescription', { count: String(starredCount) })}
                enabled={settings.data?.starredPeople ?? false}
                onChange={(v) => handleSettingChange('data', 'starredPeople', v)}
              />
              <FeatureToggle
                id="data-recents"
                label={t('settings.advanced.recentsLabel')}
                description={t('settings.advanced.recentsDescription', { count: String(recentsCount) })}
                enabled={settings.data?.recentSearches ?? false}
                onChange={(v) => handleSettingChange('data', 'recentSearches', v)}
              />
            </SettingsSection>

            <SettingsSection title={t('settings.advanced.beskedTitle')}>
              <FeatureToggle
                id="behavior-signature"
                label={t('settings.advanced.signatureLabel')}
                description={t('settings.advanced.signatureDescription')}
                enabled={settings.behavior?.disableSignature ?? false}
                onChange={(v) => handleSettingChange('behavior', 'disableSignature', v)}
              />
            </SettingsSection>

            <SettingsSection title={t('settings.advanced.privacyTitle')}>
              <FeatureToggle
                id="behavior-analytics"
                label={t('settings.advanced.analyticsLabel')}
                description={t('settings.advanced.analyticsDescription')}
                enabled={settings.behavior?.analyticsOptOut ?? false}
                onChange={(v) => handleSettingChange('behavior', 'analyticsOptOut', v)}
              />
            </SettingsSection>

            <SettingsSection title={t('settings.advanced.designSystemTitle')}>
              <div className="flex items-center justify-between py-3 px-4">
                <div className="space-y-0.5">
                  <Label className="font-medium">{t('settings.advanced.designSystemPlaygroundLabel')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.advanced.designSystemPlaygroundDescription')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPlaygroundOpen(true)}
                  className="cursor-pointer"
                >
                  <FlaskConical className="size-4" />
                  {t('settings.advanced.openButton')}
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection title={t('settings.advanced.cacheTitle')} description={t('settings.advanced.cacheDescription')}>
              <div className="flex items-center justify-between py-3 px-4">
                <div className="space-y-0.5">
                  <Label className="font-medium">{t('settings.advanced.clearPictureCacheLabel')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.advanced.clearPictureCacheDescription')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearPictureCache}
                  className="cursor-pointer"
                >
                  {t('settings.advanced.clearPictureCacheButton')}
                </Button>
              </div>
              <div className="flex items-center justify-between py-3 px-4">
                <div className="space-y-0.5">
                  <Label className="font-medium">{t('settings.advanced.clearAllDataLabel')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.advanced.clearAllDataDescription')}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearAllData}
                  className="cursor-pointer"
                >
                  {t('settings.advanced.clearAllDataButton')}
                </Button>
              </div>
            </SettingsSection>

            {onShowOnboarding && (
              <SettingsSection title={t('settings.advanced.welcomeGuideTitle')}>
                <div className="flex items-center justify-between py-3 px-4">
                  <div className="space-y-0.5">
                    <Label className="font-medium">{t('settings.advanced.welcomeGuideLabel')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.advanced.welcomeGuideDescription')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      onShowOnboarding();
                    }}
                    className="cursor-pointer"
                  >
                    <Sparkles className="size-4 mr-1.5" />
                    {t('settings.advanced.welcomeGuideButton')}
                  </Button>
                </div>
              </SettingsSection>
            )}

            <SettingsSection title={t('settings.advanced.resetTitle')} description={t('settings.advanced.resetDescription')}>
              <div className="flex items-center justify-between py-3 px-4">
                <div className="space-y-0.5">
                  <Label className="font-medium">{t('settings.advanced.resetLabel')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.advanced.resetDescription2')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSettings}
                  className="cursor-pointer"
                >
                  {t('settings.advanced.resetButton')}
                </Button>
              </div>
            </SettingsSection>
          </div>
        );

      default:
        return null;
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div
        ref={contentRef}
        tabIndex={-1}
        className="relative z-10 bg-background w-full max-w-[700px] lg:max-w-[800px] h-[85vh] md:h-[600px] max-h-[85vh] md:max-h-[600px] overflow-hidden rounded-lg border shadow-lg mx-4 animate-in fade-in-0 zoom-in-95 duration-200 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-5 right-5 z-20 rounded-sm opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
          aria-label={t('settings.closeLabel')}
        >
          <X className="size-5" />
        </button>

        <div className="settings-modal flex items-stretch min-h-0 h-full w-full">
          <aside className="w-64 shrink-0 border-r py-4 bg-sidebar text-sidebar-foreground">
            <SidebarContent className="overflow-hidden">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={item.id === activeSection}
                          onClick={() => setActiveSection(item.id)}
                          className="cursor-pointer h-11! text-base!"
                        >
                          <item.icon className="size-[18px]!" />
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </aside>

          <main className="settings-modal-main flex flex-1 min-h-0 flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b mt-4">
              <div className="flex items-center gap-2 px-6">
                <Breadcrumb>
                  <BreadcrumbList className="text-base">
                    <BreadcrumbItem>
                      <span className="text-muted-foreground">
                        {t('settings.breadcrumb')}
                      </span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeName}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>

            <div className="settings-modal-scroll flex flex-1 min-h-0 flex-col gap-4 p-6 overflow-y-auto overscroll-contain">
              {renderContent()}
            </div>
          </main>
        </div>
      </div>
    </div>
  );

  // Portal to il-root to ensure styles apply
  const portalTarget = document.getElementById("il-root") || document.body;
  return createPortal(
    <>
      {modalContent}
      <DesignPlayground open={playgroundOpen} onOpenChange={setPlaygroundOpen} />
    </>,
    portalTarget,
  );
}
