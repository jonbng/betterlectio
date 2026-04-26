import { useEffect, useState, useRef } from 'react';
import confetti from '@hiseb/confetti';
import { getHoldHue } from '@/lib/hold-mapping';
import { type ScheduleBlock, getTodaySchedule, getCachedSchedule } from '@/lib/schedule-cache';
import { getSettings } from '@/lib/settings-storage';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

const END_SOON_THRESHOLD_SEC = 300;

function endSoonStage(remaining: number): 'none' | 'soft' | 'strong' | 'climax' {
  if (remaining > END_SOON_THRESHOLD_SEC) return 'none';
  if (remaining > 60) return 'soft';
  if (remaining > 10) return 'strong';
  return 'climax';
}

function endSoonIntensity(remaining: number): number {
  if (remaining >= END_SOON_THRESHOLD_SEC) return 0;
  if (remaining <= 0) return 1;
  // Gentle ease — visible earlier than pure quadratic, still accelerates toward zero
  const linear = (END_SOON_THRESHOLD_SEC - remaining) / END_SOON_THRESHOLD_SEC;
  return Math.pow(linear, 1.25);
}

// ── State machine ──────────────────────────────────────────────────────

type CountdownState =
  | { type: 'loading' }
  | { type: 'in-class'; label: string; holdCode: string; elapsed: number; total: number; remaining: number }
  | { type: 'break'; label: string; holdCode: string; remaining: number }
  | { type: 'before-school'; label: string; holdCode: string; remaining: number }
  | { type: 'after-school' }
  | { type: 'no-classes' }
  | { type: 'cancelled-class'; label: string; holdCode: string; remaining: number; nextLabel?: string; nextHoldCode?: string; nextStart?: number };

export function getCountdownState(blocks: ScheduleBlock[], nowMinutes: number, nowSeconds: number): CountdownState {
  const active = blocks.filter(b => !b.cancelled);
  const cancelled = blocks.filter(b => b.cancelled);

  /** Build a cancelled-class state with next-active-class info */
  function makeCancelled(c: ScheduleBlock): CountdownState {
    const rem = Math.max(0, (c.end - nowMinutes) * 60 - nowSeconds);
    const next = active.find(b => b.start >= nowMinutes);
    return {
      type: 'cancelled-class', label: c.label, holdCode: c.holdCode, remaining: rem,
      ...(next ? { nextLabel: next.label, nextHoldCode: next.holdCode, nextStart: next.start } : {}),
    };
  }

  if (active.length === 0 && cancelled.length === 0) return { type: 'no-classes' };

  // If only cancelled classes today, check if we're inside one
  if (active.length === 0) {
    for (const c of cancelled) {
      if (nowMinutes >= c.start && nowMinutes < c.end) return makeCancelled(c);
    }
    return { type: 'no-classes' };
  }

  const firstBlock = active[0];
  const lastBlock = active[active.length - 1];

  if (nowMinutes < firstBlock.start) {
    // Check if a cancelled class covers right now (before first active class)
    for (const c of cancelled) {
      if (nowMinutes >= c.start && nowMinutes < c.end) return makeCancelled(c);
    }
    const remainingSec = (firstBlock.start - nowMinutes) * 60 - nowSeconds;
    if (remainingSec > 0) {
      return { type: 'before-school', label: firstBlock.label, holdCode: firstBlock.holdCode, remaining: remainingSec };
    }
  }

  if (nowMinutes >= lastBlock.end) {
    // Check if a cancelled class covers right now (after last active class)
    for (const c of cancelled) {
      if (nowMinutes >= c.start && nowMinutes < c.end) return makeCancelled(c);
    }
    return { type: 'after-school' };
  }

  for (const block of active) {
    if (nowMinutes >= block.start && nowMinutes < block.end) {
      const elapsedSec = (nowMinutes - block.start) * 60 + nowSeconds;
      const totalSec = (block.end - block.start) * 60;
      return {
        type: 'in-class', label: block.label, holdCode: block.holdCode,
        elapsed: elapsedSec, total: totalSec, remaining: Math.max(0, totalSec - elapsedSec),
      };
    }
  }

  // In a gap between active classes — check if a cancelled class covers this gap
  for (const c of cancelled) {
    if (nowMinutes >= c.start && nowMinutes < c.end) return makeCancelled(c);
  }

  for (const block of active) {
    if (block.start > nowMinutes) {
      return {
        type: 'break', label: block.label, holdCode: block.holdCode,
        remaining: Math.max(0, (block.start - nowMinutes) * 60 - nowSeconds),
      };
    }
  }

  return { type: 'after-school' };
}

// ── Friendly "done" messages ─────────────────────────────────────────────
// Message arrays are built inside the component to support translations.

/** Pick a random message that stays stable for the current page session */
function pickMessage(messages: { text: string; emoji: string }[]): { text: string; emoji: string } {
  // Use a session-stable index so it doesn't change on every re-render
  const win = window as typeof window & { __ilCdMsgIdx?: Record<string, number> };
  if (!win.__ilCdMsgIdx) {
    win.__ilCdMsgIdx = {};
  }
  const store = win.__ilCdMsgIdx;
  const key = messages[0].text;
  if (!(key in store)) {
    store[key] = Math.floor(Math.random() * messages.length);
  }
  return messages[store[key]];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function fmt(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTime(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

// ── Component ───────────────────────────────────────────────────────────

export function ScheduleCountdown({ schoolId }: { schoolId: string }) {
  const { t } = useTranslation();
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(() => getCachedSchedule(schoolId) || []);
  const [state, setState] = useState<CountdownState>({ type: 'loading' });
  const [loaded, setLoaded] = useState(false);
  const fetchedRef = useRef(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const prevStateRef = useRef<CountdownState>({ type: 'loading' });
  const firedForBlockRef = useRef<string | null>(null);
  const settings = getSettings();
  const subjectColorsEnabled = settings.schedule?.subjectColors ?? true;
  const endOfModuleEffectEnabled = settings.schedule?.endOfModuleEffect ?? true;

  const weekendMessages = [
    { text: t('scheduleCountdown.weekend.goodWeekend'), emoji: '🎉' },
    { text: t('scheduleCountdown.weekend.goodWeekend'), emoji: '☀️' },
    { text: t('scheduleCountdown.weekend.goodWeekend'), emoji: '🥳' },
    { text: t('scheduleCountdown.weekend.enjoyWeekend'), emoji: '✌️' },
    { text: t('scheduleCountdown.weekend.enjoyWeekend'), emoji: '🎊' },
    { text: t('scheduleCountdown.weekend.relaxItsWeekend'), emoji: '😌' },
  ];

  const afterSchoolMessages = [
    { text: t('scheduleCountdown.afterSchool.freeToday'), emoji: '✅' },
    { text: t('scheduleCountdown.afterSchool.doneToday'), emoji: '🙌' },
    { text: t('scheduleCountdown.afterSchool.youMadeIt'), emoji: '💪' },
    { text: t('scheduleCountdown.afterSchool.wellEarned'), emoji: '⭐' },
    { text: t('scheduleCountdown.afterSchool.dayOver'), emoji: '🎒' },
    { text: t('scheduleCountdown.afterSchool.freeRestOfDay'), emoji: '😊' },
  ];

  const noClassesMessages = [
    { text: t('scheduleCountdown.noClasses.noClassesToday'), emoji: '😎' },
    { text: t('scheduleCountdown.noClasses.freeToday'), emoji: '🌟' },
    { text: t('scheduleCountdown.noClasses.noScheduleToday'), emoji: '🛋️' },
    { text: t('scheduleCountdown.noClasses.dayWithoutClasses'), emoji: '✨' },
  ];

  const cancelledMessages = [
    { text: t('scheduleCountdown.cancelled.cancelledModule'), emoji: '🎉' },
    { text: t('scheduleCountdown.cancelled.classCancelled'), emoji: '🥳' },
    { text: t('scheduleCountdown.cancelled.freetimeUnlocked'), emoji: '🔓' },
    { text: t('scheduleCountdown.cancelled.surpriseFreetime'), emoji: '🎁' },
    { text: t('scheduleCountdown.cancelled.bonusBreak'), emoji: '🙌' },
    { text: t('scheduleCountdown.cancelled.cancelledEnjoyIt'), emoji: '😎' },
  ];

  function getDoneMessage(): { text: string; emoji: string } {
    const day = new Date().getDay();
    if (day === 5 || day === 6 || day === 0) return pickMessage(weekendMessages);
    return pickMessage(afterSchoolMessages);
  }

  function getNoClassesMessage(): { text: string; emoji: string } {
    const day = new Date().getDay();
    if (day === 6 || day === 0) return pickMessage(weekendMessages);
    return pickMessage(noClassesMessages);
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const cached = getCachedSchedule(schoolId);
    if (cached) { setBlocks(cached); setLoaded(true); return; }
    getTodaySchedule(schoolId)
      .then((b) => { setBlocks(b); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [schoolId]);

  useEffect(() => {
    if (!loaded) return;
    function tick() {
      const now = new Date();
      setState(getCountdownState(blocks, now.getHours() * 60 + now.getMinutes(), now.getSeconds()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [blocks, loaded]);

  // Fire confetti when transitioning from in-class to any non-in-class state.
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    if (
      endOfModuleEffectEnabled
      && prev.type === 'in-class'
      && state.type !== 'in-class'
      && state.type !== 'loading'
    ) {
      const blockKey = `${prev.label}::${prev.holdCode}::${new Date().toDateString()}`;
      if (firedForBlockRef.current === blockKey) return;
      firedForBlockRef.current = blockKey;

      fireConfetti();
    }
  }, [state]);

  function fireConfetti() {
    try {
      const rect = widgetRef.current?.getBoundingClientRect();
      const originX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const originY = rect ? rect.top + rect.height / 2 : window.innerHeight / 3;
      console.log('[BetterLectio] Firing end-of-module confetti at', originX, originY);
      confetti({ position: { x: originX, y: originY }, count: 160, size: 1.2, velocity: 260, fade: false });
      window.setTimeout(() => {
        confetti({ position: { x: originX, y: originY }, count: 80, size: 1, velocity: 200, fade: true });
      }, 250);
    } catch (err) {
      console.error('[BetterLectio] confetti failed:', err);
    }
  }

  // Debug trigger — call window.__blTestConfetti() in devtools to test.
  useEffect(() => {
    const w = window as typeof window & { __blTestConfetti?: () => void };
    w.__blTestConfetti = fireConfetti;
    return () => { delete w.__blTestConfetti; };
  }, []);

  if (state.type === 'loading') return null;

  const baseCd = "flex flex-col gap-1 rounded-lg border border-border px-2.5 py-1.5 font-sans bg-card";
  const baseTop = "flex items-baseline justify-between gap-1.5";
  const baseBar = "h-0.5 rounded-sm overflow-hidden bg-border";
  const baseFill = "h-full rounded-sm transition-[width] duration-1000 ease-linear";

  if (state.type === 'no-classes') {
    const msg = getNoClassesMessage();
    return (
      <div className={cn(baseCd, "il-cd-done")}>
        <div className={baseTop}>
          <span className="il-cd-done-text text-base font-medium">{msg.text}</span>
          <span className="shrink-0 text-base">{msg.emoji}</span>
        </div>
        <div className={baseBar}><div className={cn(baseFill, "il-cd-done-fill")} style={{ width: '100%' }} /></div>
      </div>
    );
  }

  const activeBlocks = blocks.filter(b => !b.cancelled);
  const hue = ('holdCode' in state && state.holdCode)
    ? (subjectColorsEnabled ? getHoldHue(state.holdCode) : 265)
    : 265;

  if (state.type === 'after-school') {
    const msg = getDoneMessage();
    return (
      <div className={cn(baseCd, "il-cd-done")}>
        <div className={baseTop}>
          <span className="il-cd-done-text text-base font-medium">{msg.text}</span>
          <span className="shrink-0 text-base">{msg.emoji}</span>
        </div>
        <div className={baseBar}><div className={cn(baseFill, "il-cd-done-fill")} style={{ width: '100%' }} /></div>
      </div>
    );
  }

  if (state.type === 'cancelled-class') {
    const msg = pickMessage(cancelledMessages);
    const cancelledHue = state.holdCode
      ? (subjectColorsEnabled ? getHoldHue(state.holdCode) : 25)
      : (subjectColorsEnabled ? 265 : 25);
    const nextHue = state.nextHoldCode
      ? (subjectColorsEnabled ? getHoldHue(state.nextHoldCode) : 265)
      : 265;
    return (
      <div
        className={cn(baseCd, "il-cd-cancelled")}
        style={{ '--cd-hue': cancelledHue, opacity: subjectColorsEnabled ? 0.38 : undefined } as React.CSSProperties}
      >
        <div className={baseTop}>
          <span className="il-cd-cancelled-text text-base font-medium">{msg.text}</span>
          <span className="shrink-0 text-base">{msg.emoji}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          <s className="decoration-destructive">{state.label}</s> — {t('scheduleCountdown.freeFor', { time: fmt(state.remaining) })}
        </div>
        {state.nextLabel && state.nextStart != null && (
          <div className="mt-1 flex items-center gap-1.5 border-t border-dashed border-border pt-1.5 text-sm">
            <span className="size-1.5 shrink-0 rounded-full il-cd-dot" style={{ '--cd-hue': nextHue } as React.CSSProperties} />
            <span className="min-w-0 flex-1 truncate font-semibold il-cd-subject" style={{ '--cd-hue': nextHue } as React.CSSProperties}>{state.nextLabel}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{t('scheduleCountdown.startingAt', { time: fmtTime(state.nextStart) })}</span>
          </div>
        )}
      </div>
    );
  }

  if (state.type === 'before-school') {
    return (
      <div className={cn(baseCd)} style={{ '--cd-hue': hue } as React.CSSProperties}>
        <div className={baseTop}>
          <span className="min-w-0 flex-1 truncate text-base font-semibold leading-tight il-cd-subject">{state.label}</span>
          <span className="shrink-0 text-lg font-bold tabular-nums tracking-tight text-foreground">{fmt(state.remaining)}</span>
        </div>
        <div className="text-sm text-muted-foreground">{t('scheduleCountdown.startingAt', { time: fmtTime(activeBlocks[0]?.start ?? 0) })}</div>
      </div>
    );
  }

  if (state.type === 'break') {
    const nextStart = activeBlocks.find(b => b.start > (new Date().getHours() * 60 + new Date().getMinutes()))?.start ?? 0;
    return (
      <div className={cn(baseCd, "border-dashed")} style={{ '--cd-hue': hue } as React.CSSProperties}>
        <div className={baseTop}>
          <span className="text-base font-semibold text-muted-foreground">{t('scheduleCountdown.pause')}</span>
          <span className="shrink-0 text-lg font-bold tabular-nums tracking-tight text-foreground">{fmt(state.remaining)}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="il-cd-subject font-semibold">{state.label}</span>
          {' '}{t('scheduleCountdown.startingAt', { time: fmtTime(nextStart) })}
        </div>
      </div>
    );
  }

  // In class
  const progress = state.elapsed / state.total;
  const endTime = activeBlocks.find(b => {
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    return b.start <= m && b.end > m;
  })?.end ?? 0;

  const stage = endOfModuleEffectEnabled ? endSoonStage(state.remaining) : 'none';
  const intensity = endOfModuleEffectEnabled ? endSoonIntensity(state.remaining) : 0;
  const endSoon = stage !== 'none';

  return (
    <div
      ref={widgetRef}
      className={cn(baseCd, endSoon && "il-cd-endsoon")}
      data-endsoon-stage={stage}
      style={{ '--cd-hue': hue, '--cd-intensity': intensity } as React.CSSProperties}
    >
      <div className={baseTop}>
        <span className="min-w-0 flex-1 truncate text-base font-semibold leading-tight il-cd-subject">{state.label}</span>
        <span className="shrink-0 text-lg font-bold tabular-nums tracking-tight il-cd-time">{fmt(state.remaining)}</span>
      </div>
      <div className={baseBar}>
        <div className={cn(baseFill, "il-cd-bar")} style={{ width: `${(progress * 100).toFixed(1)}%` }} />
      </div>
      <div className="text-sm text-muted-foreground">{t('scheduleCountdown.endsAt', { time: fmtTime(endTime) })}</div>
    </div>
  );
}
