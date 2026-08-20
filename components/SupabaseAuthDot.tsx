import { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/lib/i18n';
import { getSession } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * Tiny coloured status dot for Supabase session presence.
 * Green = authenticated, muted = not. No label — hover shows synced/offline.
 */
export function SupabaseAuthDot({ className, side = 'top' }: Props) {
  const { t } = useTranslation();
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Delay so bootstrap auto-auth has time to finish before we paint offline.
    const timer = window.setTimeout(() => {
      getSession()
        .then((session) => {
          if (!cancelled) setConnected(session !== null);
        })
        .catch(() => {
          if (!cancelled) setConnected(false);
        });
    }, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (connected === null) return null;

  const label = connected ? t('forside.synced') : t('forside.offline');

  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={label}
          className={cn(
            'inline-block size-1.5 shrink-0 rounded-full',
            connected
              ? 'bg-[oklch(0.6_0.15_145)]'
              : 'bg-[oklch(0.5_0.03_285)]',
            className,
          )}
        />
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
