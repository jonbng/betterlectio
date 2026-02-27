import { useEffect, useState, useRef } from 'react';
import { getHoldHue } from '@/lib/hold-mapping';
import { type ScheduleBlock, getTodaySchedule, getCachedSchedule } from '@/lib/schedule-cache';

// ── State machine ──────────────────────────────────────────────────────

type CountdownState =
  | { type: 'loading' }
  | { type: 'in-class'; label: string; holdCode: string; elapsed: number; total: number; remaining: number }
  | { type: 'break'; label: string; holdCode: string; remaining: number }
  | { type: 'before-school'; label: string; holdCode: string; remaining: number }
  | { type: 'after-school' }
  | { type: 'no-classes' };

function getCountdownState(blocks: ScheduleBlock[], nowMinutes: number, nowSeconds: number): CountdownState {
  if (blocks.length === 0) return { type: 'no-classes' };

  const firstBlock = blocks[0];
  const lastBlock = blocks[blocks.length - 1];

  if (nowMinutes < firstBlock.start) {
    const remainingSec = (firstBlock.start - nowMinutes) * 60 - nowSeconds;
    if (remainingSec > 0) {
      return { type: 'before-school', label: firstBlock.label, holdCode: firstBlock.holdCode, remaining: remainingSec };
    }
  }

  if (nowMinutes >= lastBlock.end) {
    return { type: 'after-school' };
  }

  for (const block of blocks) {
    if (nowMinutes >= block.start && nowMinutes < block.end) {
      const elapsedSec = (nowMinutes - block.start) * 60 + nowSeconds;
      const totalSec = (block.end - block.start) * 60;
      return {
        type: 'in-class', label: block.label, holdCode: block.holdCode,
        elapsed: elapsedSec, total: totalSec, remaining: Math.max(0, totalSec - elapsedSec),
      };
    }
  }

  for (const block of blocks) {
    if (block.start > nowMinutes) {
      return {
        type: 'break', label: block.label, holdCode: block.holdCode,
        remaining: Math.max(0, (block.start - nowMinutes) * 60 - nowSeconds),
      };
    }
  }

  return { type: 'after-school' };
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
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(() => getCachedSchedule() || []);
  const [state, setState] = useState<CountdownState>({ type: 'loading' });
  const [loaded, setLoaded] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const cached = getCachedSchedule();
    if (cached) { setBlocks(cached); setLoaded(true); return; }
    getTodaySchedule(schoolId)
      .then((b) => { setBlocks(b); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [schoolId]);

  useEffect(() => {
    if (blocks.length > 0 && !loaded) setLoaded(true);
  }, [blocks, loaded]);

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

  if (state.type === 'loading' || state.type === 'no-classes') return null;

  const hue = ('holdCode' in state && state.holdCode) ? getHoldHue(state.holdCode) : 265;

  if (state.type === 'after-school') {
    return (
      <div className="il-cd" data-state="done">
        <div className="il-cd-top">
          <span className="il-cd-done-text">Fri for i dag</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="il-cd-check">
            <path d="M3.5 7.5L5.5 9.5L10.5 4.5" stroke="oklch(0.45 0.14 145)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="il-cd-bar"><div className="il-cd-fill" style={{ width: '100%', background: `oklch(0.6 0.14 145)` }} /></div>
      </div>
    );
  }

  if (state.type === 'before-school') {
    return (
      <div className="il-cd" data-state="waiting" style={{ '--cd-hue': hue } as React.CSSProperties}>
        <div className="il-cd-top">
          <span className="il-cd-subject" style={{ color: `oklch(0.38 0.1 ${hue})` }}>{state.label}</span>
          <span className="il-cd-time">{fmt(state.remaining)}</span>
        </div>
        <div className="il-cd-sub">kl. {fmtTime(blocks[0]?.start ?? 0)}</div>
      </div>
    );
  }

  if (state.type === 'break') {
    const nextStart = blocks.find(b => b.start > (new Date().getHours() * 60 + new Date().getMinutes()))?.start ?? 0;
    return (
      <div className="il-cd" data-state="break" style={{ '--cd-hue': hue } as React.CSSProperties}>
        <div className="il-cd-top">
          <span className="il-cd-pause">Pause</span>
          <span className="il-cd-time">{fmt(state.remaining)}</span>
        </div>
        <div className="il-cd-sub">
          <span style={{ color: `oklch(0.38 0.1 ${hue})`, fontWeight: 600 }}>{state.label}</span>
          {' '}kl. {fmtTime(nextStart)}
        </div>
      </div>
    );
  }

  // In class
  const progress = state.elapsed / state.total;
  const endTime = blocks.find(b => {
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    return b.start <= m && b.end > m;
  })?.end ?? 0;

  return (
    <div className="il-cd" data-state="active" style={{ '--cd-hue': hue } as React.CSSProperties}>
      <div className="il-cd-top">
        <span className="il-cd-subject" style={{ color: `oklch(0.35 0.1 ${hue})` }}>{state.label}</span>
        <span className="il-cd-time" style={{ color: `oklch(0.35 0.12 ${hue})` }}>{fmt(state.remaining)}</span>
      </div>
      <div className="il-cd-bar">
        <div className="il-cd-fill" style={{ width: `${(progress * 100).toFixed(1)}%`, background: `oklch(0.55 0.15 ${hue})` }} />
      </div>
      <div className="il-cd-sub">slutter kl. {fmtTime(endTime)}</div>
    </div>
  );
}
