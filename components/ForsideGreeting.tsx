import { useEffect, useState } from 'preact/hooks';
import { getCachedProfile } from '@/lib/profile-cache';
import { getCachedSchedule } from '@/lib/schedule-cache';
import { getHoldDisplayName } from '@/lib/hold-mapping';
import { fetchMissingOpgaver } from '@/lib/missing-opgaver';
import { getExerciseIdFromUrl, loadIgnoredMissingIds } from '@/lib/opgaver-ignored';
import { getSession } from '@/lib/supabase/client';

const weekendGreetings = [
  'God weekend',
  'Nyd weekenden',
  'Slap af, det er weekend',
  'Velkommen til weekenden',
];

const fridayAfternoonGreetings = [
  'God weekend',
  'Næsten weekend',
  'God fredag',
];

function pickGreeting(pool: string[]): string {
  const store = ((window as any).__ilGreetIdx ??= {}) as Record<string, number>;
  const key = pool[0];
  if (!(key in store)) store[key] = Math.floor(Math.random() * pool.length);
  return pool[store[key]];
}

function getGreeting(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const hour = now.getHours();

  if (day === 6 || day === 0) return pickGreeting(weekendGreetings);
  if (day === 5 && hour >= 14) return pickGreeting(fridayAfternoonGreetings);

  if (hour >= 5 && hour < 9) return 'God morgen';
  if (hour >= 9 && hour < 12) return 'God formiddag';
  if (hour >= 12 && hour < 18) return 'God eftermiddag';
  return 'God aften';
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const cancelledNudges = [
  (n: number) => `${n === 1 ? '1 aflyst modul' : `${n} aflyste moduler`} i dag — nice`,
  (n: number) => `${n === 1 ? '1 aflyst time' : `${n} aflyste timer`} i dag 🎉`,
  (n: number) => `Psst… ${n === 1 ? '1 time' : `${n} timer`} aflyst i dag`,
  (n: number) => `${n === 1 ? 'En fritime' : `${n} fritimer`} takket være aflyste moduler`,
];

function pickCancelledNudge(): (n: number) => string {
  if (!('__ilForsideCnIdx' in window)) {
    (window as any).__ilForsideCnIdx = Math.floor(Math.random() * cancelledNudges.length);
  }
  return cancelledNudges[(window as any).__ilForsideCnIdx];
}

interface UrgentOpgave {
  title: string;
  hold: string;
  deadline: Date;
  url: string;
  /** True if this assignment has exercisemissing status (past due, never submitted) */
  isMissing?: boolean;
}

/** Get urgent opgaver from the forside widget table (only has ~3 upcoming assignments) */
function getUrgentOpgaver(): UrgentOpgave[] {
  const table = document.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_ElevOpgaveAfleveringerDBB',
  );
  if (!table) return [];

  const now = new Date();
  const urgent: UrgentOpgave[] = [];

  table.querySelectorAll('tr').forEach((row) => {
    const timeCell = row.querySelector<HTMLTableCellElement>('td.timeCol');
    if (!timeCell) return;

    const titleAttr = timeCell.getAttribute('title') || '';
    const match = titleAttr.match(/^(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!match) return;

    const deadline = new Date(
      parseInt(match[3]),
      parseInt(match[2]) - 1,
      parseInt(match[1]),
      parseInt(match[4]),
      parseInt(match[5]),
    );

    const diffMs = deadline.getTime() - now.getTime();
    // Include overdue and imminent (< 24h)
    if (diffMs < 24 * 3600000) {
      const rowTitle = row.getAttribute('title') || '';
      const holdMatch = rowTitle.match(/^Hold:\s*(.+?),\s*Titel:\s*(.+?),\s*frist:/);
      const link = row.querySelector<HTMLAnchorElement>('td.infoCol a');

      urgent.push({
        title: holdMatch?.[2]?.trim() || link?.textContent?.trim() || 'Opgave',
        hold: holdMatch?.[1]?.trim() || '',
        deadline,
        url: link?.getAttribute('href') || '',
      });
    }
  });

  // Sort by deadline (most urgent first)
  urgent.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  return urgent;
}

// fetchMissingOpgaver is imported from @/lib/missing-opgaver (shared, cached)

/** Merge missing opgaver into urgent list, deduplicating by URL */
function mergeUrgentOpgaver(local: UrgentOpgave[], missing: UrgentOpgave[]): UrgentOpgave[] {
  const seen = new Set<string>();
  const merged: UrgentOpgave[] = [];

  // Missing assignments always come first
  for (const m of missing) {
    const key = m.url || `${m.title}|${m.hold}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(m);
    }
  }

  // Then local urgent (imminent from forside widget)
  for (const u of local) {
    const key = u.url || `${u.title}|${u.hold}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(u);
    }
  }

  return merged;
}

function formatUrgentLabel(opgave: UrgentOpgave): string {
  const now = new Date();
  const diffMs = opgave.deadline.getTime() - now.getTime();

  if (opgave.isMissing || diffMs < 0) {
    const absDays = Math.floor(Math.abs(diffMs) / 86400000);
    const absHours = Math.floor(Math.abs(diffMs) / 3600000);
    const absMin = Math.floor(Math.abs(diffMs) / 60000);
    if (absMin < 60) return 'mangler — lige overskredet';
    if (absHours < 24) return `mangler — ${absHours} ${absHours === 1 ? 'time' : 'timer'} forsinket`;
    return `mangler — ${absDays} ${absDays === 1 ? 'dag' : 'dage'} forsinket`;
  }

  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffMin < 60) return `om ${Math.max(1, diffMin)} min`;
  return `om ${diffHours} ${diffHours === 1 ? 'time' : 'timer'}`;
}

export function ForsideGreeting({ schoolId }: { schoolId: string }) {
  const [time, setTime] = useState(new Date());
  const [firstName, setFirstName] = useState<string>('');
  const [cancelledCount, setCancelledCount] = useState(0);
  const [urgentOpgaver, setUrgentOpgaver] = useState<UrgentOpgave[]>([]);
  const [cloudConnected, setCloudConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let retryId: ReturnType<typeof setInterval> | null = null;

    // Get first name from cached profile
    const profile = getCachedProfile();
    if (profile?.name) {
      const nameParts = profile.name.split(' ');
      setFirstName(nameParts[0]);
    }

    // Check for cancelled classes from schedule cache
    // The sidebar's ScheduleCountdown populates this — retry briefly if not yet ready
    function checkCancelled() {
      const blocks = getCachedSchedule(schoolId);
      if (blocks) {
        setCancelledCount(blocks.filter(b => b.cancelled).length);
        return true;
      }
      return false;
    }
    if (!checkCancelled()) {
      // Retry a few times as the sidebar may still be fetching
      let attempts = 0;
      const id = setInterval(() => {
        if (checkCancelled() || ++attempts >= 6) clearInterval(id);
      }, 1500);
      retryId = id;
    }

    // Check Supabase auth state (delayed so auto-auth has time to complete)
    const authTimer = window.setTimeout(() => {
      getSession().then(s => {
        if (!isCancelled) setCloudConnected(s !== null);
      }).catch(() => {});
    }, 2000);

    // Check for urgent opgaver from forside DOM (only ~3 upcoming visible in widget)
    const localUrgent = getUrgentOpgaver();
    setUrgentOpgaver(localUrgent);

    // Background fetch: check for missing assignments from full opgaver page.
    // Delay slightly to avoid adding pressure during initial page boot.
    const missingTimer = window.setTimeout(() => {
      fetchMissingOpgaver(schoolId).then((missingRaw) => {
        if (isCancelled) return;
        if (missingRaw.length > 0) {
          const ignoredIds = loadIgnoredMissingIds(schoolId);
          const missing: UrgentOpgave[] = missingRaw
            .filter(m => {
              const id = getExerciseIdFromUrl(m.url);
              return !id || !ignoredIds.has(id);
            })
            .map(m => ({
              title: m.title,
              hold: m.hold,
              deadline: m.deadline,
              url: m.url,
              isMissing: true,
            }));
          if (missing.length > 0) {
            setUrgentOpgaver((prev) => mergeUrgentOpgaver(prev, missing));
          }
        }
      });
    }, 1500);

    // Tick clock every second (drives clock + urgent labels)
    const clockInterval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    const onDismiss = (e: Event) => {
      const id = (e as CustomEvent).detail?.exerciseId;
      if (!id) return;
      setUrgentOpgaver((prev) => prev.filter((o) => {
        const eid = getExerciseIdFromUrl(o.url);
        return eid !== id;
      }));
    };
    window.addEventListener('betterlectio:dismissMissing', onDismiss);

    return () => {
      isCancelled = true;
      if (retryId) clearInterval(retryId);
      clearInterval(clockInterval);
      window.clearTimeout(missingTimer);
      window.clearTimeout(authTimer);
      window.removeEventListener('betterlectio:dismissMissing', onDismiss);
    };
  }, []);

  const greeting = getGreeting();
  const hasMissing = urgentOpgaver.some(o => o.isMissing);

  return (
    <div className="px-8 pt-10 pb-8 relative animate-[bl-fade-in_400ms_var(--ease-out)_both]">
      {cloudConnected !== null && (
        <div
          className="absolute top-4 right-8 flex items-center gap-1.5 text-xs font-medium select-none"
          style={{ color: cloudConnected ? 'oklch(0.55 0.08 145)' : 'oklch(0.55 0.03 285)' }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: cloudConnected ? 'oklch(0.6 0.15 145)' : 'oklch(0.5 0.03 285)' }}
          />
          {cloudConnected ? 'Synkroniseret' : 'Offline'}
        </div>
      )}
      <div className="flex flex-col gap-3">
        <p className="text-base font-medium text-muted-foreground uppercase tracking-[0.2em]">
          {formatDate(time)}
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-2xl font-extralight text-muted-foreground tabular-nums mt-1">
          {formatTime(time)}
        </p>
        {cancelledCount > 0 && (
          <p className="text-sm font-medium mt-1" style={{ color: 'oklch(0.55 0.1 85)' }}>
            {pickCancelledNudge()(cancelledCount)}
          </p>
        )}
        {urgentOpgaver.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2">
            {urgentOpgaver.map((opgave, i) => {
              const isOverdue = opgave.isMissing || opgave.deadline.getTime() < Date.now();
              const label = formatUrgentLabel(opgave);
              const holdName = opgave.hold ? getHoldDisplayName(opgave.hold) : '';
              return (
                <a
                  key={opgave.url || `${opgave.title}-${opgave.hold}`}
                  href={opgave.url || undefined}
                  className="text-sm font-medium flex items-center gap-2 no-underline hover:underline"
                  style={{ color: isOverdue ? 'oklch(0.55 0.15 25)' : 'oklch(0.55 0.15 55)' }}
                  onClick={(e) => {
                    if (!opgave.url) return;
                    e.preventDefault();
                    e.stopPropagation();
                    window.dispatchEvent(
                      new CustomEvent('betterlectio:openOpgaveDetail', {
                        detail: {
                          entry: {
                            title: opgave.title,
                            url: opgave.url,
                            hold: opgave.hold,
                            deadline: opgave.deadline,
                            deadlineText: '',
                            studentTime: '',
                            status: opgave.isMissing ? 'mangler' as const : 'venter' as const,
                            absence: '',
                            awaiting: '',
                            note: '',
                            grade: '',
                            gradeExtra: '',
                          },
                        },
                      }),
                    );
                  }}
                >
                  <span style={{
                    display: 'inline-block',
                    width: opgave.isMissing ? '7px' : '6px',
                    height: opgave.isMissing ? '7px' : '6px',
                    borderRadius: '50%',
                    backgroundColor: isOverdue ? 'oklch(0.55 0.2 25)' : 'oklch(0.65 0.2 55)',
                    flexShrink: 0,
                    boxShadow: opgave.isMissing ? '0 0 0 2px oklch(0.55 0.2 25 / 0.3)' : 'none',
                  }} />
                  <span>
                    {opgave.title}
                    {holdName ? ` (${holdName})` : ''}
                    {' — '}
                    <span style={{ fontWeight: 600 }}>{label}</span>
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
