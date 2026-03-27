import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { browser } from "wxt/browser";
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
  type FeatureSettings,
} from "@/lib/settings-storage";
import { setUserJotTheme } from "@/lib/userjot";
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
  Info,
  Github,
  Palette,
  Wrench,
  ExternalLink,
  X,
  Chrome,
  Monitor,
  Calendar,
  PanelLeft,
  GraduationCap,
  FlaskConical,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { DesignPlayground } from "@/components/DesignPlayground";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowOnboarding?: () => void;
}

const navItems = [
  { id: "appearance", name: "Udseende", icon: Palette },
  { id: "sidebar", name: "Sidebar", icon: PanelLeft },
  { id: "subjects", name: "Fag", icon: GraduationCap },
  { id: "advanced", name: "Avanceret", icon: Wrench },
  { id: "about", name: "Om", icon: Info },
];

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
  return date.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getBrowserInfo(): string {
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

export function SettingsModal({ open, onOpenChange, onShowOnboarding }: SettingsModalProps) {
  const manifest = browser.runtime.getManifest();
  const version = manifest.version;
  const lectioVersion = (document.getElementById("s_m_VersionInfoLink") ?? document.getElementById("m_VersionInfoLink"))?.textContent?.replace(/^\s*Lectio\s+version\s*/i, "")?.trim() ?? null;
  const logoUrl = browser.runtime.getURL("/assets/logo-transparent.svg");
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState("appearance");
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [settings, setSettings] = useState<FeatureSettings>(() => getSettings());
  const schoolId = getSchoolIdFromUrl();
  const schoolTheme = getThemePreferenceForSchool(schoolId);
  const [themeId, setThemeId] = useState<ThemePresetId>(schoolTheme.themeId);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [supabaseExpiry, setSupabaseExpiry] = useState<number | null>(null);

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
    `Skærm: ${screenDimensions}`,
    `Skole navn: ${schoolName ?? "Ukendt"}`,
    `Skole ID: ${schoolId ?? "Ukendt"}`,
    `Viewport: ${window.innerWidth} × ${window.innerHeight}`,
    `Dark mode: ${document.documentElement.classList.contains("dark") ? "Ja" : "Nej"}`,
    versionInfo ? `Installeret: ${formatDate(versionInfo.firstInstalledAt)}` : null,
    versionInfo && versionInfo.firstInstalledAt !== versionInfo.lastUpdatedAt
      ? `Opdateret: ${formatDate(versionInfo.lastUpdatedAt)}`
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

  const handleSettingChange = <K extends keyof Omit<FeatureSettings, 'version'>>(
    category: K,
    key: keyof FeatureSettings[K],
    value: boolean
  ) => {
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

    if (category === "visual" && key === "darkMode") {
      document.documentElement.classList.toggle("dark", value);
      setUserJotTheme(value ? "dark" : "light");
      if (distinctId) {
        setPersonProperties(distinctId, {
          dark_mode: value,
        });
      }
    }

    // Show reload toast if this setting requires it
    if (requiresReload(category, key as string)) {
      toast("Indstillingen træder i kraft efter genindlæsning", {
        action: {
          label: "Genindlæs",
          onClick: () => window.location.reload(),
        },
        duration: 5000,
      });
    }
  };

  const handleClearPictureCache = () => {
    clearPictureCache();
    toast.success("Billedcache ryddet");
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
    toast.success("Alle data ryddet", {
      action: {
        label: "Genindlæs",
        onClick: () => window.location.reload(),
      },
    });
  };

  const handleResetSettings = () => {
    resetSettings();
    setSettings(getSettings());
    toast.success("Indstillinger nulstillet", {
      action: {
        label: "Genindlæs",
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
                  <span className="text-sm font-medium">Version</span>
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
                    <span className="text-sm font-medium">Lectio version</span>
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
                      <span className="text-sm font-medium">Først installeret</span>
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
                        <span className="text-sm font-medium">Sidst opdateret</span>
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background text-foreground hover:bg-accent cursor-pointer transition-colors no-underline"
              >
                <Chrome className="size-4" />
                Chrome Web Store
                <ExternalLink className="size-3" />
              </a>
              <a
                href="https://addons.mozilla.org/en-US/firefox/addon/betterlectio/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background text-foreground hover:bg-accent cursor-pointer transition-colors no-underline"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background text-foreground hover:bg-accent cursor-pointer transition-colors no-underline"
              >
                <Github className="size-4" />
                GitHub
                <ExternalLink className="size-3" />
              </a>
              {/* <a
                href={reportIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background text-foreground hover:bg-accent cursor-pointer transition-colors no-underline"
              >
                <Bug className="size-4" />
                Rapporter problem
                <ExternalLink className="size-3" />
              </a> */}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Debug info
              </h3>
              <div className="rounded-lg border bg-muted/30 divide-y divide-border">
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Chrome className="size-4 text-muted-foreground" />
                    <span className="text-sm">Browser</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {browserInfo}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="size-4 text-muted-foreground" />
                    <span className="text-sm">Operativsystem</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {osInfo}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="size-4 text-muted-foreground" />
                    <span className="text-sm">Skærmopløsning</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {screenDimensions}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Info className="size-4 text-muted-foreground" />
                    <span className="text-sm">Skole navn</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {schoolName ?? "Ukendt"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Info className="size-4 text-muted-foreground" />
                    <span className="text-sm">Skole ID</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {schoolId ?? "Ukendt"}
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
                {copied ? "Kopieret!" : "Kopiér debug info"}
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Tjenester
              </h3>
              <div className="rounded-lg border bg-muted/30 divide-y divide-border">
                <div className="py-3 px-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">BetterLectio Analytics</span>
                    <Badge variant={settings.behavior?.analyticsOptOut ? "outline" : "secondary"} className="text-xs">
                      {settings.behavior?.analyticsOptOut ? "Fravalgt" : "Aktiv"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Anonym brugsstatistik (sideopslag, fejlrapportering). Kan fravælges under Avanceret &gt; Privatliv.
                  </p>
                </div>
                <div className="py-3 px-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">BetterLectio Database</span>
                    <Badge
                      variant={supabaseStatus === 'authenticated' ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {supabaseStatus === 'loading' ? "Indlæser..." : supabaseStatus === 'authenticated' ? "Logget ind" : "Ikke logget ind"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Backend til kommende funktioner. Autentificering sker automatisk i baggrunden.
                    {supabaseStatus === 'authenticated' && supabaseExpiry && (
                      <> Session udløber {new Date(supabaseExpiry * 1000).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Udviklet af{" "}
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
              title="Tema"
              description={
                schoolName
                  ? `Disse farver gælder kun for ${schoolName}`
                  : "Disse farver gælder kun for den aktuelle skole"
              }
            >
              <div className="px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Farvetema</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="visual-darkmode" className="text-sm text-muted-foreground cursor-pointer">
                      Mørk
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

            <SettingsSection title="Skema">
              <FeatureToggle
                id="schedule-today"
                label="Fremhæv i dag"
                description="Gul baggrund på dagens kolonne i skemaet"
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
                label="Tidsindikator"
                description="Rød linje der viser det aktuelle tidspunkt"
                enabled={settings.schedule?.currentTimeIndicator ?? true}
                onChange={(v) => handleSettingChange('schedule', 'currentTimeIndicator', v)}
                disabled={!(settings.schedule?.todayHighlight ?? true)}
                disabledReason="Kræver 'Fremhæv i dag' er aktiveret"
                hasDependent={settings.schedule?.currentTimeLabel ?? false}
                requiresReload
              />
              <FeatureToggle
                id="schedule-time-label"
                label="Vis klokkeslæt ved tidslinjen"
                description="Viser tidspunkt ved siden af den røde tidsindikator"
                enabled={settings.schedule?.currentTimeLabel ?? false}
                onChange={(v) => handleSettingChange('schedule', 'currentTimeLabel', v)}
                disabled={
                  !(settings.schedule?.currentTimeIndicator ?? true) ||
                  !(settings.schedule?.todayHighlight ?? true)
                }
                disabledReason="Kræver 'Fremhæv i dag' og 'Tidsindikator' er aktiveret"
                requiresReload
              />
              <FeatureToggle
                id="schedule-countdown"
                label="Nedtælling"
                description="Tæller ned til slutningen af den nuværende lektion eller starten af den næste"
                enabled={settings.schedule?.countdownBar ?? true}
                onChange={(v) => handleSettingChange('schedule', 'countdownBar', v)}
              />
              <FeatureToggle
                id="schedule-subject-colors"
                label="Fagfarver"
                description="Vis unikke farver for hvert fag. Når slået fra vises blå for normale, grøn for ændrede og rød for aflyste lektioner"
                enabled={settings.schedule?.subjectColors ?? true}
                onChange={(v) => handleSettingChange('schedule', 'subjectColors', v)}
                requiresReload
              />
            </SettingsSection>

          </div>
        );

      case "sidebar":
        return (
          <div className="space-y-6">
            <SettingsSection title="Hovedmenu" description="Vælg hvilke links der vises i hovedmenuen">
              <FeatureToggle
                id="sidebar-forside"
                label="Forside"
                description="Link til forsiden"
                enabled={settings.sidebar?.showForside ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showForside', v)}
              />
              <FeatureToggle
                id="sidebar-skema"
                label="Skema"
                description="Link til dit skema"
                enabled={settings.sidebar?.showSkema ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showSkema', v)}
              />
              <FeatureToggle
                id="sidebar-elever"
                label="Elever"
                description="Link til elevoversigt"
                enabled={settings.sidebar?.showElever ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showElever', v)}
              />
              <FeatureToggle
                id="sidebar-opgaver"
                label="Opgaver"
                description="Link til opgaveoversigt"
                enabled={settings.sidebar?.showOpgaver ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showOpgaver', v)}
              />
              <FeatureToggle
                id="sidebar-lektier"
                label="Lektier"
                description="Link til lektieoversigt"
                enabled={settings.sidebar?.showLektier ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showLektier', v)}
              />
              <FeatureToggle
                id="sidebar-beskeder"
                label="Beskeder"
                description="Link til beskeder"
                enabled={settings.sidebar?.showBeskeder ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showBeskeder', v)}
              />
            </SettingsSection>

            <SettingsSection title="Sekundær menu" description="Vælg hvilke links der vises i den sekundære menu">
              <FeatureToggle
                id="sidebar-karakterer"
                label="Karakterer"
                description="Link til karakteroversigt"
                enabled={settings.sidebar?.showKarakterer ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showKarakterer', v)}
              />
              <FeatureToggle
                id="sidebar-fravaer"
                label="Fravær"
                description="Link til fraværsoversigt"
                enabled={settings.sidebar?.showFravaer ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showFravaer', v)}
              />
              <FeatureToggle
                id="sidebar-studieplan"
                label="Studieplan"
                description="Link til studieplan"
                enabled={settings.sidebar?.showStudieplan ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showStudieplan', v)}
              />
              <FeatureToggle
                id="sidebar-dokumenter"
                label="Dokumenter"
                description="Link til dokumenter"
                enabled={settings.sidebar?.showDokumenter ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showDokumenter', v)}
              />
              <FeatureToggle
                id="sidebar-spoergeskema"
                label="Spørgeskema"
                description="Link til spørgeskemaer"
                enabled={settings.sidebar?.showSpoergeskema ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showSpoergeskema', v)}
              />
              <FeatureToggle
                id="sidebar-uvbeskrivelser"
                label="UV-beskrivelser"
                description="Link til undervisningsbeskrivelser"
                enabled={settings.sidebar?.showUVBeskrivelser ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showUVBeskrivelser', v)}
              />
            </SettingsSection>

            <SettingsSection title="Sektioner" description="Vis eller skjul foldbare sektioner">
              <FeatureToggle
                id="sidebar-findskema"
                label="Find Skema"
                description="Foldbar sektion med genveje til skematyper"
                enabled={settings.sidebar?.showFindSkema ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showFindSkema', v)}
              />
              <FeatureToggle
                id="sidebar-aendringer"
                label="Ændringer"
                description="Foldbar sektion med skemaændringer"
                enabled={settings.sidebar?.showAendringer ?? true}
                onChange={(v) => handleSettingChange('sidebar', 'showAendringer', v)}
              />
            </SettingsSection>
          </div>
        );

      case "subjects":
        return <HoldMappingEditor />;

      case "advanced":
        return (
          <div className="space-y-6">
            <SettingsSection title="Adfærd">
              <FeatureToggle
                id="behavior-messages"
                label="Beskeder til Nyeste"
                description="Åbn beskeder i 'Nyeste' mappe som standard"
                enabled={settings.behavior?.messagesAutoRedirect ?? true}
                onChange={(v) => handleSettingChange('behavior', 'messagesAutoRedirect', v)}
              />
              <FeatureToggle
                id="behavior-lastschool"
                label="Fortsæt til sidst brugte skole"
                description="Vis knap til hurtigt login på login-siden"
                enabled={settings.behavior?.continueToLastSchool ?? true}
                onChange={(v) => handleSettingChange('behavior', 'continueToLastSchool', v)}
              />
            </SettingsSection>

            <SettingsSection title="Data">
              <FeatureToggle
                id="data-starred"
                label="Fastgjorte personer"
                description={`Gem fastgjorte personer til hurtig adgang (${starredCount} gemt)`}
                enabled={settings.data?.starredPeople ?? false}
                onChange={(v) => handleSettingChange('data', 'starredPeople', v)}
              />
              <FeatureToggle
                id="data-recents"
                label="Seneste søgninger"
                description={`Husk dine seneste søgninger (${recentsCount} gemt)`}
                enabled={settings.data?.recentSearches ?? false}
                onChange={(v) => handleSettingChange('data', 'recentSearches', v)}
              />
            </SettingsSection>

            <SettingsSection title="Beskeder">
              <FeatureToggle
                id="behavior-signature"
                label="Deaktiver 'Sendt med BetterLectio' signatur"
                description="Fjern BetterLectio-signaturen fra beskeder"
                enabled={settings.behavior?.disableSignature ?? false}
                onChange={(v) => handleSettingChange('behavior', 'disableSignature', v)}
              />
            </SettingsSection>

            <SettingsSection title="Privatliv">
              <FeatureToggle
                id="behavior-analytics"
                label="Fravælg anonym analyse"
                description="Deaktiver anonym brugsstatistik (sideopslag, fejlrapportering). Ingen persondata deles."
                enabled={settings.behavior?.analyticsOptOut ?? false}
                onChange={(v) => handleSettingChange('behavior', 'analyticsOptOut', v)}
              />
            </SettingsSection>

            <SettingsSection title="Design System">
              <div className="flex items-center justify-between py-3 px-4">
                <div className="space-y-0.5">
                  <Label className="font-medium">Design System Playground</Label>
                  <p className="text-sm text-muted-foreground">
                    Udforsk farver, komponenter og mønstre
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPlaygroundOpen(true)}
                  className="cursor-pointer"
                >
                  <FlaskConical className="size-4" />
                  Åbn
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection title="Cache" description="Administrer lokalt gemt data">
              <div className="flex items-center justify-between py-3 px-4">
                <div className="space-y-0.5">
                  <Label className="font-medium">Ryd billedcache</Label>
                  <p className="text-sm text-muted-foreground">
                    Slet cachede profilbilleder
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearPictureCache}
                  className="cursor-pointer"
                >
                  Ryd cache
                </Button>
              </div>
              <div className="flex items-center justify-between py-3 px-4">
                <div className="space-y-0.5">
                  <Label className="font-medium">Ryd alle data</Label>
                  <p className="text-sm text-muted-foreground">
                    Slet fastgjorte personer, seneste søgninger, billedcache og indstillinger
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearAllData}
                  className="cursor-pointer"
                >
                  Ryd alt
                </Button>
              </div>
            </SettingsSection>

            {onShowOnboarding && (
              <SettingsSection title="Velkomstguide">
                <div className="flex items-center justify-between py-3 px-4">
                  <div className="space-y-0.5">
                    <Label className="font-medium">Kør opsætningsguiden igen</Label>
                    <p className="text-sm text-muted-foreground">
                      Gennemgå tema, fagfarver og profilopsætning
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
                    Vis guide
                  </Button>
                </div>
              </SettingsSection>
            )}

            <SettingsSection title="Nulstil" description="Gendan standardindstillinger">
              <div className="flex items-center justify-between py-3 px-4">
                <div className="space-y-0.5">
                  <Label className="font-medium">Nulstil indstillinger</Label>
                  <p className="text-sm text-muted-foreground">
                    Gendan alle indstillinger til standard (beholder fastgjorte personer og søgninger)
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSettings}
                  className="cursor-pointer"
                >
                  Nulstil
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
          aria-label="Luk"
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
                          className="cursor-pointer h-11! text-[15px]!"
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
                  <BreadcrumbList className="text-[15px]">
                    <BreadcrumbItem>
                      <span className="text-muted-foreground">
                        Indstillinger
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
