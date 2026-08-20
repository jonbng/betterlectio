import { useEffect, useState } from 'react';
import { getCachedProfile } from '@/lib/profile-cache';
import { getSettings, updateSetting } from '@/lib/settings-storage';
import { SettingsModal } from './SettingsModal';
import { ActivityClassModal } from './ActivityClassModal';
import { ActivityClassFullModal } from './ActivityClassFullModal';
import { PrivatAftaleDialog } from './PrivatAftaleDialog';
import { OpgaveDetailSheet } from './OpgaveDetailSheet';
import type { OpgaveEntry } from './OpgaverPage';
import { OnboardingWizard } from './OnboardingWizard';
import { ElevfeedbackEditorOverlay } from './ElevfeedbackEditorOverlay';

const WELCOME_STORAGE_KEY = 'bl-welcome-popup-seen-v1';
const LEGACY_WELCOME_STORAGE_KEY = 'il-welcome-popup-seen-v1';

/** Globally mounted dialogs/sheets used by schedule bricks and page islands. */
export function AppOverlays() {
  const settings = getSettings();
  const profile = getCachedProfile();
  const schoolId = profile?.schoolId ?? window.location.pathname.match(/\/lectio\/(\d+)\//)?.[1] ?? '94';
  const portalTarget = document.getElementById('il-root') || document.body;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<string>();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityUrl, setActivityUrl] = useState<string | null>(null);
  const [activityViewMode, setActivityViewMode] = useState<'modal' | 'sheet'>(
    () => settings.behavior?.activityViewMode ?? 'modal',
  );
  const [privateOpen, setPrivateOpen] = useState(false);
  const [privateUrl, setPrivateUrl] = useState<string | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignment, setAssignment] = useState<OpgaveEntry | null>(null);
  const [assignmentViewMode, setAssignmentViewMode] = useState<'modal' | 'sheet'>(
    () => settings.behavior?.opgaveViewMode ?? 'sheet',
  );
  const [elevfeedbackOpen, setElevfeedbackOpen] = useState(false);
  const [elevfeedbackUrl, setElevfeedbackUrl] = useState<string | null>(null);

  useEffect(() => {
    const openSettings = (event: Event) => {
      const section = (event as CustomEvent<{ section?: string }>).detail?.section;
      setSettingsSection(section);
      setSettingsOpen(true);
    };
    const openActivity = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (!url) return;
      setActivityUrl(url);
      setActivityOpen(true);
    };
    const openPrivate = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (!url) return;
      setPrivateUrl(url);
      setPrivateOpen(true);
    };
    const openAssignment = (event: Event) => {
      const entry = (event as CustomEvent<{ entry?: OpgaveEntry }>).detail?.entry;
      if (!entry) return;
      setAssignment(entry);
      setAssignmentOpen(true);
    };
    const openElevfeedback = (event: Event) => {
      const nextUrl = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (!nextUrl) return;
      setElevfeedbackUrl(nextUrl);
      setElevfeedbackOpen(true);
    };

    window.addEventListener('betterlectio:openSettings', openSettings);
    window.addEventListener('betterlectio:openActivityModal', openActivity as EventListener);
    window.addEventListener('betterlectio:openPrivatAftale', openPrivate as EventListener);
    window.addEventListener('betterlectio:openOpgaveDetail', openAssignment as EventListener);
    window.addEventListener('betterlectio:openElevfeedbackEditor', openElevfeedback as EventListener);
    return () => {
      window.removeEventListener('betterlectio:openSettings', openSettings);
      window.removeEventListener('betterlectio:openActivityModal', openActivity as EventListener);
      window.removeEventListener('betterlectio:openPrivatAftale', openPrivate as EventListener);
      window.removeEventListener('betterlectio:openOpgaveDetail', openAssignment as EventListener);
      window.removeEventListener('betterlectio:openElevfeedbackEditor', openElevfeedback as EventListener);
    };
  }, []);

  useEffect(() => {
    try {
      const seen = (localStorage.getItem(WELCOME_STORAGE_KEY) ?? localStorage.getItem(LEGACY_WELCOME_STORAGE_KEY)) === 'true';
      if (!localStorage.getItem(WELCOME_STORAGE_KEY) && seen) localStorage.setItem(WELCOME_STORAGE_KEY, 'true');
      if (!seen) setWelcomeOpen(true);
    } catch {
      setWelcomeOpen(true);
    }

    const syncWelcome = (event: StorageEvent) => {
      if (event.key === WELCOME_STORAGE_KEY && event.newValue === 'true') setWelcomeOpen(false);
    };
    const reveal = () => {
      try {
        if (localStorage.getItem(WELCOME_STORAGE_KEY) === 'true') setWelcomeOpen(false);
      } catch { /* non-critical */ }
    };
    window.addEventListener('storage', syncWelcome);
    document.addEventListener('prerenderingchange', reveal);
    return () => {
      window.removeEventListener('storage', syncWelcome);
      document.removeEventListener('prerenderingchange', reveal);
    };
  }, []);

  const closeWelcome = () => {
    setWelcomeOpen(false);
    try { localStorage.setItem(WELCOME_STORAGE_KEY, 'true'); } catch { /* non-critical */ }
  };

  const swapActivityView = () => {
    const next = activityViewMode === 'modal' ? 'sheet' : 'modal';
    setActivityViewMode(next);
    updateSetting('behavior', 'activityViewMode', next);
  };
  const swapAssignmentView = () => {
    const next = assignmentViewMode === 'modal' ? 'sheet' : 'modal';
    setAssignmentViewMode(next);
    updateSetting('behavior', 'opgaveViewMode', next);
  };

  return (
    <>
      <SettingsModal
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        onShowOnboarding={() => setWelcomeOpen(true)}
        initialSection={settingsSection}
      />
      <OnboardingWizard
        open={welcomeOpen}
        onClose={closeWelcome}
        schoolId={schoolId}
        studentId={profile?.studentId ?? null}
        portalTarget={portalTarget}
        onOpenSettings={() => { closeWelcome(); setSettingsOpen(true); }}
      />
      {activityViewMode === 'modal' ? (
        <ActivityClassFullModal
          open={activityOpen}
          url={activityUrl}
          onOpenChange={(open) => { setActivityOpen(open); if (!open) setActivityUrl(null); }}
          onSwapViewMode={swapActivityView}
        />
      ) : (
        <ActivityClassModal
          open={activityOpen}
          url={activityUrl}
          onOpenChange={(open) => { setActivityOpen(open); if (!open) setActivityUrl(null); }}
          onSwapViewMode={swapActivityView}
        />
      )}
      {privateUrl && (
        <PrivatAftaleDialog
          open={privateOpen}
          onOpenChange={(open) => { setPrivateOpen(open); if (!open) setPrivateUrl(null); }}
          formUrl={privateUrl}
        />
      )}
      <OpgaveDetailSheet
        open={assignmentOpen}
        onOpenChange={(open) => { setAssignmentOpen(open); if (!open) setAssignment(null); }}
        entry={assignment}
        schoolId={schoolId}
        viewMode={assignmentViewMode}
        onSwapViewMode={swapAssignmentView}
      />
      <ElevfeedbackEditorOverlay
        open={elevfeedbackOpen}
        url={elevfeedbackUrl}
        onOpenChange={(open) => { setElevfeedbackOpen(open); if (!open) setElevfeedbackUrl(null); }}
      />
    </>
  );
}
