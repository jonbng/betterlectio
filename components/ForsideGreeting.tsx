import { useEffect, useState } from 'preact/hooks';
import { getCachedProfile } from '@/lib/profile-cache';
import { getCachedSchedule } from '@/lib/schedule-cache';

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

export function ForsideGreeting() {
  const [time, setTime] = useState(new Date());
  const [firstName, setFirstName] = useState<string>('');
  const [cancelledCount, setCancelledCount] = useState(0);

  useEffect(() => {
    // Get first name from cached profile
    const profile = getCachedProfile();
    if (profile?.name) {
      const nameParts = profile.name.split(' ');
      setFirstName(nameParts[0]);
    }

    // Check for cancelled classes from schedule cache
    // The sidebar's ScheduleCountdown populates this — retry briefly if not yet ready
    function checkCancelled() {
      const blocks = getCachedSchedule();
      if (blocks) {
        setCancelledCount(blocks.filter(b => b.cancelled).length);
        return true;
      }
      return false;
    }
    if (!checkCancelled()) {
      // Retry a few times as the sidebar may still be fetching
      let attempts = 0;
      const retryId = setInterval(() => {
        if (checkCancelled() || ++attempts >= 6) clearInterval(retryId);
      }, 1500);
    }

    // Update time every second
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const greeting = getGreeting();

  return (
    <div className="px-8 pt-12 pb-8">
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
      </div>
    </div>
  );
}
