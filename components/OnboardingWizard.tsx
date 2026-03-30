import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { browser } from 'wxt/browser';
import {
  Sun,
  Moon,
  Instagram,
  ChevronRight,
  ChevronLeft,
  Palette,
  ArrowRight,
  Heart,
  MessageSquareHeart,
  Users,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  THEME_PRESETS,
  type ThemePresetId,
} from '@/lib/theme-presets';
import {
  applyThemePreferenceToDocument,
  getThemePreferenceForSchool,
  saveThemePreferenceForSchool,
} from '@/lib/theme-storage';
import {
  getSettings,
  saveSettings,
  type FeatureSettings,
} from '@/lib/settings-storage';
import { setUserJotTheme } from '@/lib/userjot';
import { getCachedProfile } from '@/lib/profile-cache';
import { useQuery, useMutation } from '@/lib/supabase/hooks';
import {
  getPreferredStudentPictureUrl,
  useAdoptionCounts,
  ADOPTION_SCHOOL_THRESHOLD,
  ADOPTION_CLASS_THRESHOLD,
} from '@/lib/supabase/student-lookup';
import { capture, getDistinctId, setPersonProperties } from '@/lib/posthog';
import { formatInstagramHandle, normalizeInstagramHandle } from '@/lib/instagram';
import type { Tables } from '@/database.types';

type Student = Tables<'students'>;

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  schoolId: string;
  studentId: string | null;
  portalTarget: HTMLElement;
  onOpenSettings: () => void;
}

const ALL_STEPS = [0, 1, 2, 3, 4] as const;
const PROFILE_STEP = 3;

// ── Live schedule preview for fagfarver ───────────────────────────────
const SCHEDULE_BLOCKS = [
  { label: 'Matematik', short: 'Ma', hue: 220 },
  { label: 'Dansk', short: 'Da', hue: 340 },
  { label: 'Engelsk', short: 'En', hue: 45 },
  { label: 'Historie', short: 'Hi', hue: 150 },
  { label: 'Fysik', short: 'Fy', hue: 280 },
];

function SchedulePreviewLive({ colored }: { colored: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {SCHEDULE_BLOCKS.map((b) => {
        const hue = colored ? b.hue : 265;
        const chroma = colored ? 0.045 : 0.025;
        const textChroma = colored ? 0.14 : 0.08;
        return (
          <button
            key={b.short}
            type="button"
            className="rounded-xl py-4 flex flex-col items-center gap-1 transition-all duration-500 ease-out cursor-default"
            style={{
              backgroundColor: `oklch(0.93 ${chroma} ${hue})`,
              boxShadow: colored ? `0 2px 8px oklch(0.7 0.08 ${hue} / 0.2)` : 'none',
            }}
          >
            <span
              className="text-base font-bold transition-[color,background-color] duration-150 duration-500"
              style={{ color: `oklch(0.42 ${textChroma} ${hue})` }}
            >
              {b.short}
            </span>
            <span
              className="text-[10px] font-medium transition-[color,background-color] duration-150 duration-500 opacity-60"
              style={{ color: `oklch(0.42 ${textChroma} ${hue})` }}
            >
              {b.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function OnboardingWizard({
  open,
  onClose,
  schoolId,
  studentId,
  portalTarget,
  onOpenSettings,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<FeatureSettings>(() => getSettings());
  const [themeId, setThemeId] = useState<ThemePresetId>(() => getThemePreferenceForSchool(schoolId).themeId);
  const [isDark, setIsDark] = useState(() => settings.visual?.darkMode ?? false);
  const [subjectColors, setSubjectColors] = useState(() => settings.schedule?.subjectColors ?? true);
  const contentRef = useRef<HTMLDivElement>(null);

  // Profile form state
  const [profileName, setProfileName] = useState('');
  const [profileDesc, setProfileDesc] = useState('');
  const [profileInsta, setProfileInsta] = useState('');
  const [showBirthday, setShowBirthday] = useState(false);
  const [profileInitialized, setProfileInitialized] = useState(false);

  const logoUrl = browser.runtime.getURL('/assets/logo-transparent.svg');

  // Load student data
  const { data: student } = useQuery<Student>({
    schoolId,
    table: 'students',
    filters: studentId ? [{ column: 'id', op: 'eq', value: studentId }] : [],
    single: true,
    enabled: Boolean(studentId),
  });

  const { mutate: updateStudent } = useMutation({
    table: 'students',
    method: 'update',
    schoolId,
  });

  // ── Profile step skip logic (based on BL adoption) ──────────────────
  const cachedProfileData = getCachedProfile();
  const { schoolCount, classCount } = useAdoptionCounts(schoolId, cachedProfileData?.className ?? null);

  // Lock the decision once data arrives so the step structure doesn't change mid-wizard
  const [skipProfileLocked, setSkipProfileLocked] = useState<boolean | null>(null);

  useEffect(() => {
    if (open && skipProfileLocked === null && schoolCount !== null) {
      const schoolBelow = schoolCount < ADOPTION_SCHOOL_THRESHOLD;
      // If class_name data isn't available yet, fall back to school-only check
      const classBelow = classCount === null ? true : classCount < ADOPTION_CLASS_THRESHOLD;
      setSkipProfileLocked(schoolBelow && classBelow);
    }
  }, [open, skipProfileLocked, schoolCount, classCount]);

  useEffect(() => {
    if (!open) setSkipProfileLocked(null);
  }, [open]);

  const shouldSkipProfile = skipProfileLocked ?? false;

  const activeSteps = useMemo(() => {
    return shouldSkipProfile ? ALL_STEPS.filter((s) => s !== PROFILE_STEP) : [...ALL_STEPS];
  }, [shouldSkipProfile]);

  const totalVisibleSteps = activeSteps.length;
  const currentStepId = activeSteps[step];

  // Pre-populate profile fields when student data loads
  useEffect(() => {
    if (student && !profileInitialized) {
      setProfileName(student.name ?? '');
      setProfileDesc(student.description ?? '');
      setProfileInsta(formatInstagramHandle(student.instagram));
      setShowBirthday(student.show_birthday ?? false);
      setProfileInitialized(true);

      // Backfill class_name if missing on the student record
      const className = cachedProfileData?.className;
      if (className && !student.class_name && studentId) {
        updateStudent(
          { class_name: className } as Record<string, unknown>,
          [{ column: 'id', op: 'eq', value: studentId }],
        );
      }
    }
  }, [student, profileInitialized]);

  // Reset step when reopened (e.g. from settings "Vis guide" button)
  useEffect(() => {
    if (open) {
      setStep(0);
      setSettings(getSettings());
      setThemeId(getThemePreferenceForSchool(schoolId).themeId);
      setIsDark(getSettings().visual?.darkMode ?? false);
      setSubjectColors(getSettings().schedule?.subjectColors ?? true);
      setProfileInitialized(false);
      setSkipProfileLocked(null);
    }
  }, [open, schoolId]);

  // Analytics: onboarding started
  useEffect(() => {
    if (!open) return;
    const profile = getCachedProfile();
    if (profile?.studentId) {
      capture('onboarding_started', getDistinctId(profile.studentId), {
        school_id: schoolId,
      });
    }
  }, [open, schoolId]);

  // Keyboard navigation (no Escape to prevent accidental close)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goBack();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, step]);

  // Prevent body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const getDistinctIdSafe = useCallback(() => {
    const profile = getCachedProfile();
    return profile?.studentId ? getDistinctId(profile.studentId) : null;
  }, []);

  // ── Settings helpers ────────────────────────────────────────────────

  const handleDarkModeToggle = (value: boolean) => {
    setIsDark(value);
    const newSettings = { ...settings, visual: { ...settings.visual, darkMode: value } };
    setSettings(newSettings as FeatureSettings);
    saveSettings(newSettings as FeatureSettings);
    document.documentElement.classList.toggle('dark', value);
    setUserJotTheme(value ? 'dark' : 'light');

    const distinctId = getDistinctIdSafe();
    if (distinctId) {
      capture('setting changed', distinctId, { category: 'visual', key: 'darkMode', value, school_id: schoolId });
      setPersonProperties(distinctId, { dark_mode: value });
    }
  };

  const handleThemeChange = (nextThemeId: ThemePresetId) => {
    setThemeId(nextThemeId);
    saveThemePreferenceForSchool(schoolId, { themeId: nextThemeId });
    applyThemePreferenceToDocument({ themeId: nextThemeId });

    const distinctId = getDistinctIdSafe();
    if (distinctId) {
      capture('theme changed', distinctId, { school_id: schoolId, theme_id: nextThemeId });
      setPersonProperties(distinctId, { theme_id: nextThemeId });
    }
  };

  const handleSubjectColorsToggle = (value: boolean) => {
    setSubjectColors(value);
    const newSettings = { ...settings, schedule: { ...settings.schedule, subjectColors: value } };
    setSettings(newSettings as FeatureSettings);
    saveSettings(newSettings as FeatureSettings);

    const distinctId = getDistinctIdSafe();
    if (distinctId) {
      capture('setting changed', distinctId, { category: 'schedule', key: 'subjectColors', value, school_id: schoolId });
    }
  };

  // ── Profile save on blur ────────────────────────────────────────────

  const saveProfileField = useCallback((field: string, value: unknown) => {
    if (!studentId) return;
    updateStudent(
      { [field]: value } as Record<string, unknown>,
      [{ column: 'id', op: 'eq', value: studentId }],
    );

    const distinctId = getDistinctIdSafe();
    if (distinctId) {
      capture('betterlectio profile updated', distinctId, {
        field,
        school_id: schoolId,
        source: 'onboarding',
      });
    }
  }, [studentId, updateStudent, getDistinctIdSafe, schoolId]);

  // ── Navigation ──────────────────────────────────────────────────────

  const goNext = () => {
    if (step < totalVisibleSteps - 1) {
      setStep(step + 1);
    } else {
      const distinctId = getDistinctIdSafe();
      if (distinctId) {
        capture('onboarding_completed', distinctId, {
          school_id: schoolId,
          steps_visited: totalVisibleSteps,
          profile_skipped: shouldSkipProfile,
        });
      }
      onClose();
    }
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!open) return null;

  const profilePic = getPreferredStudentPictureUrl(student ?? null, null);
  const progress = ((step + 1) / totalVisibleSteps) * 100;

  // ── Step content ────────────────────────────────────────────────────

  const renderStep = () => {
    switch (currentStepId) {
      // ── Welcome ─────────────────────────────────────────────────────
      case 0:
        return (
          <div className="flex flex-col items-center text-center gap-6 py-4">
            <img
              src={logoUrl}
              alt="BetterLectio"
              width={80}
              height={80}
              className="size-20 dark:invert dark:brightness-110"
            />
            <div className="space-y-3">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Velkommen til BetterLectio
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
                Et nyt look til Lectio — pænere, hurtigere og nemmere at bruge.
                <br />
                Lad os sætte det op sammen.
              </p>
            </div>
            <div className="w-full rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-3.5 text-left">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Bemærk:</span>{' '}
                Første gang kan Lectio logge dig ud én gang. Log bare ind igen — så virker alt bagefter.
              </p>
            </div>
          </div>
        );

      // ── Theme ───────────────────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <Palette className="size-6 text-primary" />
                Vælg dit tema
              </h2>
              <p className="text-sm text-muted-foreground">
                Gør BetterLectio til dit eget. Du kan altid ændre det senere.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <Label className="text-sm font-medium">Udseende</Label>
              <div className="flex items-center gap-2.5">
                <Sun className="size-4 text-muted-foreground" />
                <Switch
                  checked={isDark}
                  onCheckedChange={handleDarkModeToggle}
                  className="cursor-pointer"
                />
                <Moon className="size-4 text-muted-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              {THEME_PRESETS.map((preset) => {
                const c = isDark ? preset.colors.dark : preset.colors.light;
                const isSelected = themeId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleThemeChange(preset.id)}
                    className={`group cursor-pointer rounded-xl border-2 transition-all overflow-hidden ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/25 scale-[1.03]'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="flex h-16" style={{ backgroundColor: c.bg }}>
                      <div
                        className="w-[30%] flex flex-col gap-0.5 p-1.5 border-r"
                        style={{ backgroundColor: c.sidebar, borderColor: `color-mix(in oklch, ${c.sidebar} 70%, ${c.primary} 30%)` }}
                      >
                        <div className="h-1.5 w-full rounded-sm" style={{ backgroundColor: c.primary }} />
                        <div className="h-1 w-[80%] rounded-sm" style={{ backgroundColor: c.accent }} />
                        <div className="h-1 w-[60%] rounded-sm" style={{ backgroundColor: c.accent }} />
                      </div>
                      <div className="flex-1 p-1.5 flex flex-col gap-0.5">
                        <div className="h-1.5 w-[60%] rounded-sm" style={{ backgroundColor: c.primary, opacity: 0.7 }} />
                        <div className="h-1 w-full rounded-sm" style={{ backgroundColor: c.accent }} />
                        <div className="h-1 w-[85%] rounded-sm" style={{ backgroundColor: c.accent }} />
                        <div className="mt-auto h-2.5 w-[40%] rounded-sm" style={{ backgroundColor: c.primary }} />
                      </div>
                    </div>
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
        );

      // ── Fagfarver ───────────────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Skemafarver
              </h2>
              <p className="text-sm text-muted-foreground">
                Giv hvert fag sin egen farve i skemaet, så det er lettere at skelne mellem dem.
              </p>
            </div>

            {/* Live preview */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <SchedulePreviewLive colored={subjectColors} />
            </div>

            {/* Toggle styled like the theme switcher cards */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSubjectColorsToggle(true)}
                className={`cursor-pointer rounded-xl border-2 px-4 py-3.5 text-center transition-all ${
                  subjectColors
                    ? 'border-primary ring-2 ring-primary/25 scale-[1.02] bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex justify-center gap-1 mb-2">
                  {[220, 340, 45, 150].map((h) => (
                    <div key={h} className="size-3 rounded-full" style={{ backgroundColor: `oklch(0.65 0.15 ${h})` }} />
                  ))}
                </div>
                <span className={`text-sm font-semibold ${subjectColors ? 'text-primary' : 'text-foreground'}`}>
                  Med farver
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleSubjectColorsToggle(false)}
                className={`cursor-pointer rounded-xl border-2 px-4 py-3.5 text-center transition-all ${
                  !subjectColors
                    ? 'border-primary ring-2 ring-primary/25 scale-[1.02] bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex justify-center gap-1 mb-2">
                  {[265, 265, 265, 265].map((h, i) => (
                    <div key={i} className="size-3 rounded-full" style={{ backgroundColor: `oklch(0.65 0.12 ${h})` }} />
                  ))}
                </div>
                <span className={`text-sm font-semibold ${!subjectColors ? 'text-primary' : 'text-foreground'}`}>
                  Uden farver
                </span>
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Du kan tilpasse farverne for hvert enkelt fag i indstillinger.
            </p>
          </div>
        );

      // ── Profile ─────────────────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Din profil
              </h2>
              <p className="text-sm text-muted-foreground">
                Andre BetterLectio-brugere kan se din profil. Alt er valgfrit.
              </p>
            </div>

            {studentId ? (
              <div className="space-y-4">
                {/* Current picture */}
                {profilePic && (
                  <div className="flex items-center gap-3">
                    <img
                      src={profilePic}
                      alt=""
                      className="size-14 rounded-full object-cover border-2 border-border"
                    />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Dit billede kommer fra Lectio.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-name" className="text-xs font-medium text-muted-foreground">Visningsnavn</Label>
                    <input
                      id="ob-name"
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName((e.target as HTMLInputElement).value)}
                      onBlur={() => saveProfileField('name', profileName || null)}
                      placeholder="Dit navn"
                      className="flex w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ob-desc" className="text-xs font-medium text-muted-foreground">Beskrivelse</Label>
                    <input
                      id="ob-desc"
                      type="text"
                      value={profileDesc}
                      onChange={(e) => setProfileDesc((e.target as HTMLInputElement).value)}
                      onBlur={() => saveProfileField('description', profileDesc || null)}
                      placeholder="Kort om dig selv"
                      className="flex w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ob-insta" className="text-xs font-medium text-muted-foreground">Instagram</Label>
                    <div className="relative">
                      <Instagram className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <input
                        id="ob-insta"
                        type="text"
                        value={profileInsta}
                        onChange={(e) => setProfileInsta((e.target as HTMLInputElement).value)}
                        onBlur={() => {
                          saveProfileField('instagram', normalizeInstagramHandle(profileInsta));
                          setProfileInsta(formatInstagramHandle(profileInsta));
                        }}
                        placeholder="@brugernavn"
                        className="flex w-full rounded-xl border border-input bg-background pl-10 pr-3.5 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Du kan skrive med eller uden @</p>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Vis fødselsdag</p>
                      <p className="text-xs text-muted-foreground">Andre kan se din fødselsdag</p>
                    </div>
                    <Switch
                      checked={showBirthday}
                      onCheckedChange={(v) => {
                        setShowBirthday(v);
                        saveProfileField('show_birthday', v);
                      }}
                      className="cursor-pointer"
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Alt kan ændres senere i indstillinger.
                </p>
              </div>
            ) : (
              <div className="space-y-4 opacity-50 pointer-events-none select-none">
                <div className="flex items-center gap-3">
                  <div className="size-14 rounded-full bg-muted animate-pulse" />
                  <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="h-3 w-20 rounded bg-muted" />
                    <div className="h-10 w-full rounded-xl border border-input bg-muted/50" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-10 w-full rounded-xl border border-input bg-muted/50" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 w-16 rounded bg-muted" />
                    <div className="h-10 w-full rounded-xl border border-input bg-muted/50" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center !opacity-100 !pointer-events-auto">
                  Din profil opsættes automatisk — du kan redigere den snart.
                </p>
              </div>
            )}
          </div>
        );

      // ── Feedback & Share (merged) ───────────────────────────────────
      case 4:
        return (
          <div className="flex flex-col items-center text-center gap-6 py-4">
            <div className="flex items-center justify-center size-16 rounded-2xl bg-primary/10">
              <Heart className="size-8 text-primary" />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Én sidste ting
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
                BetterLectio er et hobbyprojekt, og din feedback gør en kæmpe forskel.
              </p>
            </div>

            <div className="w-full space-y-3">
              <div className="flex items-start gap-3.5 rounded-xl border bg-muted/30 px-5 py-4 text-left">
                <MessageSquareHeart className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Giv feedback</p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                    Har du fundet en fejl eller har en idé? Brug <span className="font-semibold text-primary">"Give Feedback"</span>-knappen nederst til højre — den er der altid.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 rounded-xl border bg-muted/30 px-5 py-4 text-left">
                <Users className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Fortæl dine venner</p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                    Kender du nogen som ikke bruger BetterLectio endnu? Fortæl dem om det — jo flere vi er, jo bedre bliver det.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isLastStep = step === totalVisibleSteps - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bl-onboarding-title"
    >
      {/* Backdrop (no click-to-close to prevent accidental dismissal) */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200"
        aria-hidden="true"
      />

      {/* Card */}
      <div
        ref={contentRef}
        className="relative z-10 mx-4 w-full max-w-lg rounded-2xl border bg-background shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200 flex flex-col overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary rounded-r-full transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step content */}
        <div className="px-7 pt-7 pb-5 min-h-[380px] flex flex-col justify-center">
          <div
            key={step}
            className="animate-in fade-in-0 slide-in-from-right-2 duration-200"
          >
            {renderStep()}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t px-7 py-4">
          <div>
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150 cursor-pointer"
              >
                <ChevronLeft className="size-4" />
                Tilbage
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Step indicator dots */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalVisibleSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-200 ${
                    i === step
                      ? 'w-4 h-1.5 bg-primary'
                      : i < step
                        ? 'size-1.5 bg-primary/40'
                        : 'size-1.5 bg-border'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
            >
              {isLastStep ? (
                <>
                  Kom i gang
                  <ArrowRight className="size-4" />
                </>
              ) : (
                <>
                  Næste
                  <ChevronRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
