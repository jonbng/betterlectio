import { useEffect, useState, useRef } from 'react';
import { getHoldHue } from '@/lib/hold-mapping';
import { type ScheduleBlock, getTodaySchedule, getCachedSchedule } from '@/lib/schedule-cache';
import { cn } from '@/lib/utils';

// ── State machine ──────────────────────────────────────────────────────

type CountdownState =
  | { type: 'loading' }
  | { type: 'in-class'; label: string; holdCode: string; elapsed: number; total: number; remaining: number }
  | { type: 'break'; label: string; holdCode: string; remaining: number }
  | { type: 'before-school'; label: string; holdCode: string; remaining: number }
  | { type: 'after-school' }
  | { type: 'no-classes' }
  | { type: 'cancelled-class'; label: string; holdCode: string; remaining: number; nextLabel?: string; nextHoldCode?: string; nextStart?: number };

function getCountdownState(blocks: ScheduleBlock[], nowMinutes: number, nowSeconds: number): CountdownState {
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

const weekendMessages = [
  { text: 'God weekend', emoji: '🎉' },
  { text: 'God weekend', emoji: '☀️' },
  { text: 'God weekend', emoji: '🥳' },
  { text: 'Nyd weekenden', emoji: '✌️' },
  { text: 'Nyd weekenden', emoji: '🎊' },
  { text: 'Slap af — det er weekend', emoji: '😌' },
];

const afterSchoolMessages = [
  { text: 'Fri for i dag', emoji: '✅' },
  { text: 'Færdig for i dag', emoji: '🙌' },
  { text: 'Du klarede det', emoji: '💪' },
  { text: 'Velfortjent fri', emoji: '⭐' },
  { text: 'Dagen er overstået', emoji: '🎒' },
  { text: 'Fri resten af dagen', emoji: '😊' },
];

const noClassesMessages = [
  { text: 'Ingen timer i dag', emoji: '😎' },
  { text: 'Fri i dag', emoji: '🌟' },
  { text: 'Ingen skema i dag', emoji: '🛋️' },
  { text: 'Dag uden timer', emoji: '✨' },
];

const cancelledMessages = [
  { text: 'Aflyst modul', emoji: '🎉' },
  { text: 'Timen er aflyst', emoji: '🥳' },
  { text: 'Fritime unlocked', emoji: '🔓' },
  { text: 'Surprise fritime', emoji: '🎁' },
  { text: 'Bonus frikvarter', emoji: '🙌' },
  { text: 'Aflyst — nyd det', emoji: '😎' },
];

/** Pick a random message that stays stable for the current page session */
function pickMessage(messages: { text: string; emoji: string }[]): { text: string; emoji: string } {
  // Use a session-stable index so it doesn't change on every re-render
  const store = ((window as any).__ilCdMsgIdx ??= {}) as Record<string, number>;
  const key = messages[0].text;
  if (!(key in store)) {
    store[key] = Math.floor(Math.random() * messages.length);
  }
  return messages[store[key]];
}

function getDoneMessage(): { text: string; emoji: string } {
  const day = new Date().getDay(); // 0=Sun, 5=Fri, 6=Sat
  if (day === 5 || day === 6 || day === 0) return pickMessage(weekendMessages);
  return pickMessage(afterSchoolMessages);
}

function getNoClassesMessage(): { text: string; emoji: string } {
  const day = new Date().getDay();
  if (day === 6 || day === 0) return pickMessage(weekendMessages);
  return pickMessage(noClassesMessages);
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
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(() => getCachedSchedule(schoolId) || []);
  const [state, setState] = useState<CountdownState>({ type: 'loading' });
  const [loaded, setLoaded] = useState(false);
  const fetchedRef = useRef(false);

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

  if (state.type === 'loading') return null;

  const baseCd = "flex flex-col gap-1 rounded-lg border px-2.5 py-1.5 font-sans";
  const baseTop = "flex items-baseline justify-between gap-1.5";
  const baseBar = "h-0.5 rounded-sm overflow-hidden bg-[oklch(0.92_0.012_265)] dark:bg-[oklch(0.25_0.004_285)]";
  const baseFill = "h-full rounded-sm transition-[width] duration-1000 ease-linear";

  if (state.type === 'no-classes') {
    const msg = getNoClassesMessage();
    return (
      <div className={cn(baseCd, "bg-[oklch(0.97_0.012_145)] border-[oklch(0.9_0.03_145)] dark:bg-[oklch(0.17_0.012_145)] dark:border-[oklch(0.24_0.02_145)]")}>
        <div className={baseTop}>
          <span className="text-sm font-medium text-[oklch(0.42_0.1_145)] dark:text-[oklch(0.7_0.1_145)]">{msg.text}</span>
          <span className="shrink-0 text-sm">{msg.emoji}</span>
        </div>
        <div className={baseBar}><div className={baseFill} style={{ width: '100%', background: 'oklch(0.6 0.14 145)' }} /></div>
      </div>
    );
  }

  const activeBlocks = blocks.filter(b => !b.cancelled);
  const hue = ('holdCode' in state && state.holdCode) ? getHoldHue(state.holdCode) : 265;

  if (state.type === 'after-school') {
    const msg = getDoneMessage();
    return (
      <div className={cn(baseCd, "bg-[oklch(0.97_0.012_145)] border-[oklch(0.9_0.03_145)] dark:bg-[oklch(0.17_0.012_145)] dark:border-[oklch(0.24_0.02_145)]")}>
        <div className={baseTop}>
          <span className="text-sm font-medium text-[oklch(0.42_0.1_145)] dark:text-[oklch(0.7_0.1_145)]">{msg.text}</span>
          <span className="shrink-0 text-sm">{msg.emoji}</span>
        </div>
        <div className={baseBar}><div className={baseFill} style={{ width: '100%', background: 'oklch(0.6 0.14 145)' }} /></div>
      </div>
    );
  }

  if (state.type === 'cancelled-class') {
    const msg = pickMessage(cancelledMessages);
    const nextHue = state.nextHoldCode ? getHoldHue(state.nextHoldCode) : 265;
    return (
      <div className={cn(baseCd, "bg-[oklch(0.97_0.015_85)] border-[oklch(0.88_0.04_85)] dark:bg-[oklch(0.18_0.015_85)] dark:border-[oklch(0.25_0.02_85)]")}>
        <div className={baseTop}>
          <span className="text-sm font-medium text-[oklch(0.42_0.1_85)] dark:text-[oklch(0.72_0.1_85)]">{msg.text}</span>
          <span className="shrink-0 text-sm">{msg.emoji}</span>
        </div>
        <div className="text-xs text-[oklch(0.5_0.04_85)] dark:text-[oklch(0.58_0.03_85)]">
          <s className="decoration-[oklch(0.6_0.08_25)] dark:decoration-[oklch(0.5_0.08_25)]">{state.label}</s> — fri i {fmt(state.remaining)}
        </div>
        {state.nextLabel && state.nextStart != null && (
          <div className="mt-1 flex items-center gap-1.5 border-t border-dashed border-[oklch(0.88_0.025_85)] pt-1.5 text-xs dark:border-[oklch(0.27_0.015_85)]">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: `oklch(0.55 0.15 ${nextHue})` }} />
            <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: `oklch(0.4 0.08 ${nextHue})` }}>{state.nextLabel}</span>
            <span className="shrink-0 tabular-nums text-[oklch(0.52_0.02_265)] dark:text-[oklch(0.55_0.005_285)]">kl. {fmtTime(state.nextStart)}</span>
          </div>
        )}
      </div>
    );
  }

  if (state.type === 'before-school') {
    return (
      <div className={cn(baseCd, "bg-[oklch(0.97_0.008_265)] border-[oklch(0.91_0.015_265)] dark:bg-[oklch(0.18_0.004_285)] dark:border-[oklch(0.25_0.004_285)]")}>
        <div className={baseTop}>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight" style={{ color: `oklch(0.38 0.1 ${hue})` }}>{state.label}</span>
          <span className="shrink-0 text-[15px] font-bold tabular-nums tracking-tight text-[oklch(0.25_0.03_265)] dark:text-[oklch(0.88_0.003_90)]">{fmt(state.remaining)}</span>
        </div>
        <div className="text-xs text-[oklch(0.52_0.02_265)] dark:text-[oklch(0.55_0.005_285)]">kl. {fmtTime(activeBlocks[0]?.start ?? 0)}</div>
      </div>
    );
  }

  if (state.type === 'break') {
    const nextStart = activeBlocks.find(b => b.start > (new Date().getHours() * 60 + new Date().getMinutes()))?.start ?? 0;
    return (
      <div className={cn(baseCd, "border-dashed border-[oklch(0.91_0.015_265)] bg-[oklch(0.98_0.005_265)] dark:border-[oklch(0.25_0.004_285)] dark:bg-[oklch(0.16_0.004_285)]")}>
        <div className={baseTop}>
          <span className="text-sm font-semibold text-[oklch(0.4_0.02_265)] dark:text-[oklch(0.65_0.005_285)]">Pause</span>
          <span className="shrink-0 text-[15px] font-bold tabular-nums tracking-tight text-[oklch(0.25_0.03_265)] dark:text-[oklch(0.88_0.003_90)]">{fmt(state.remaining)}</span>
        </div>
        <div className="text-xs text-[oklch(0.52_0.02_265)] dark:text-[oklch(0.55_0.005_285)]">
          <span style={{ color: `oklch(0.38 0.1 ${hue})`, fontWeight: 600 }}>{state.label}</span>
          {' '}kl. {fmtTime(nextStart)}
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

  return (
    <div className={cn(baseCd, "bg-[oklch(0.97_0.008_265)] border-[oklch(0.91_0.015_265)] dark:bg-[oklch(0.18_0.004_285)] dark:border-[oklch(0.25_0.004_285)]")}>
      <div className={baseTop}>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight" style={{ color: `oklch(0.35 0.1 ${hue})` }}>{state.label}</span>
        <span className="shrink-0 text-[15px] font-bold tabular-nums tracking-tight" style={{ color: `oklch(0.35 0.12 ${hue})` }}>{fmt(state.remaining)}</span>
      </div>
      <div className={baseBar}>
        <div className={baseFill} style={{ width: `${(progress * 100).toFixed(1)}%`, background: `oklch(0.55 0.15 ${hue})` }} />
      </div>
      <div className="text-xs text-[oklch(0.52_0.02_265)] dark:text-[oklch(0.55_0.005_285)]">slutter kl. {fmtTime(endTime)}</div>
    </div>
  );
}
