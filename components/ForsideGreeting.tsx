import { useEffect, useState } from 'preact/hooks';
import { getCachedProfile } from '@/lib/profile-cache';

function getGreeting(): string {
  const hour = new Date().getHours();
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

export function ForsideGreeting() {
  const [time, setTime] = useState(new Date());
  const [firstName, setFirstName] = useState<string>('');

  useEffect(() => {
    // Get first name from cached profile
    const profile = getCachedProfile();
    if (profile?.name) {
      // Extract first name (handle compound first names like "Anne Marie")
      const nameParts = profile.name.split(' ');
      // Usually first name is everything except the last part (surname)
      // But let's just take the first word for simplicity
      setFirstName(nameParts[0]);
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
      </div>
    </div>
  );
}
