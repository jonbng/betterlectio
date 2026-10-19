import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { ExternalLink, Lightbulb, Megaphone, MessageCircle, Sparkles, TriangleAlert, Wrench, X } from 'lucide-react';
import { claimNextAnnouncement, flushPendingAnnouncementEvents, recordAnnouncementEvent, safeAnnouncementUrl, type ExtensionAnnouncement, type RichTextNode } from '@/lib/announcements';
import { getCachedProfile } from '@/lib/profile-cache';
import { getPageSlug } from '@/lib/posthog';
import { ensureSupabaseSession } from '@/lib/supabase/session';
import { getCachedSchedule, getTodaySchedule } from '@/lib/schedule-cache';
import { getCountdownState } from '@/components/ScheduleCountdown';
import { cn } from '@/lib/utils';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
function blocked() {
  const active = document.activeElement;
  return document.visibilityState !== 'visible' || !!document.querySelector('[role="dialog"][aria-modal="true"]')
    || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement
    || (active instanceof HTMLElement && active.isContentEditable);
}
function quiet() { const hour = new Date().getHours(); return hour >= 2 && hour < 9; }
async function inClass(schoolId: string) {
  const blocks = getCachedSchedule(schoolId) ?? await getTodaySchedule(schoolId).catch(() => []);
  const now = new Date();
  return getCountdownState(blocks, now.getHours() * 60 + now.getMinutes(), now.getSeconds()).type === 'in-class';
}
function RichText({ node }: { node: RichTextNode }) {
  if (node.type === 'text') {
    let value: ComponentChildren = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = <strong>{value}</strong>;
      else if (mark.type === 'italic') value = <em>{value}</em>;
      else if (mark.type === 'link') {
        const href = safeAnnouncementUrl(mark.attrs?.href ?? null);
        if (href) value = <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">{value}</a>;
      }
    }
    return <>{value}</>;
  }
  if (node.type === 'hardBreak') return <br />;
  const children = (node.content ?? []).map((child, index) => <RichText key={index} node={child} />);
  if (node.type === 'paragraph') return <p className="m-0 [&+p]:mt-2">{children}</p>;
  if (node.type === 'bulletList') return <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>;
  if (node.type === 'orderedList') return <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>;
  if (node.type === 'listItem') return <li>{children}</li>;
  return <>{children}</>;
}
const looks = {
  feature: ['Nyhed', Sparkles, 'bg-primary/10 text-primary'], tip: ['Tip', Lightbulb, 'bg-sky-500/10 text-sky-700 dark:text-sky-300'],
  news: ['Nyt fra BetterLectio', Megaphone, 'bg-primary/10 text-primary'], maintenance: ['Drift', Wrench, 'bg-amber-500/10 text-amber-700 dark:text-amber-300'],
  survey: ['Vi vil gerne høre dig', MessageCircle, 'bg-violet-500/10 text-violet-700 dark:text-violet-300'], important: ['Vigtigt', TriangleAlert, 'bg-destructive/10 text-destructive'],
} as const;
const themes = {
  brand: ['text-primary', 'bg-primary/10 text-primary', 'bg-primary text-primary-foreground', 'bg-primary'],
  blue: ['text-sky-700 dark:text-sky-300', 'bg-sky-500/10 text-sky-700 dark:text-sky-300', 'bg-sky-600 text-white', 'bg-sky-500'],
  violet: ['text-violet-700 dark:text-violet-300', 'bg-violet-500/10 text-violet-700 dark:text-violet-300', 'bg-violet-600 text-white', 'bg-violet-500'],
  amber: ['text-amber-700 dark:text-amber-300', 'bg-amber-500/10 text-amber-700 dark:text-amber-300', 'bg-amber-600 text-white', 'bg-amber-500'],
  neutral: ['text-foreground', 'bg-muted text-foreground', 'bg-foreground text-background', 'bg-foreground'],
} as const;
function internalAction(action: string | null) {
  if (action === 'open_settings') window.dispatchEvent(new CustomEvent('betterlectio:openSettings'));
  else if (action === 'open_feedback') window.dispatchEvent(new CustomEvent('betterlectio:openFeedback'));
  else if (action === 'open_mobile_app') window.dispatchEvent(new CustomEvent('betterlectio:open-mobile-app-invite', { detail: { source: 'announcement' } }));
}

export function AnnouncementHost() {
  const profile = getCachedProfile();
  const [item, setItem] = useState<ExtensionAnnouncement | null>(null);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [reduced, setReduced] = useState(false);
  const seen = useRef(false);
  const contextId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!profile?.schoolId || !profile.studentId) return;
    let cancelled = false; let resolved = false; let timer: number | undefined;
    const check = async () => {
      if (cancelled || blocked()) { timer = window.setTimeout(check, 5000); return; }
      const authenticated = await ensureSupabaseSession(profile.schoolId!, 'bootstrap', profile.studentId!);
      if (!authenticated) {
        timer = window.setTimeout(check, 30_000);
        return;
      }
      await flushPendingAnnouncementEvents();
      try {
        const next = await claimNextAnnouncement(profile.studentId!, getPageSlug(), contextId);
        if (cancelled) return;
        if (!next) {
          timer = window.setTimeout(check, 15 * 60_000);
          return;
        }
        if ((next.avoidQuietHours && quiet()) || (next.avoidClassTime && await inClass(profile.schoolId!))) {
          timer = window.setTimeout(check, 10 * 60_000); return;
        }
        resolved = true; setItem(next); requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      } catch { timer = window.setTimeout(check, 30_000); }
    };
    timer = window.setTimeout(check, 3500);
    const visible = () => { if (!resolved && document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', visible);
    return () => { cancelled = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [profile?.schoolId, profile?.studentId, contextId]);
  useEffect(() => {
    if (!item || !entered || seen.current) return;
    const timer = window.setTimeout(() => { seen.current = true; void recordAnnouncementEvent(item, 'seen'); }, 1000);
    return () => clearTimeout(timer);
  }, [item, entered]);
  useEffect(() => {
    if (!item) return; const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close('dismissed'); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [item]);
  if (!item) return null;
  const [defaultEyebrow, Icon] = looks[item.kind];
  const design = item.design ?? 'standard';
  const [accentText, iconTone, buttonTone, accentBar] = themes[item.theme ?? 'brand'];
  function close(event: 'dismissed' | 'clicked') {
    if (!item || exiting) return; void recordAnnouncementEvent(item, event); setExiting(true);
    window.setTimeout(() => setItem(null), reduced ? 0 : 160);
  }
  function action() {
    if (!item) return;
    if (item.ctaKind === 'url') { const url = safeAnnouncementUrl(item.ctaTarget); if (url) window.open(url, '_blank', 'noopener,noreferrer'); }
    else if (item.ctaKind === 'event') internalAction(item.ctaTarget);
    close('clicked');
  }
  const authorAvatar = safeAnnouncementUrl(item.authorAvatarUrl);
  const cover = item.coverUrl ? (
    <div className={cn('overflow-hidden bg-muted', design === 'professional' ? 'mx-5 mt-5 aspect-[16/7] rounded-xl outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10' : 'aspect-[16/7] border-b')}>
      <img src={item.coverUrl} alt={item.coverAlt ?? ''} className="size-full object-cover" />
    </div>
  ) : null;
  const author = item.authorName ? (
    <div className="mt-4 flex items-center gap-2.5 border-t pt-4">
      {authorAvatar ? <img src={authorAvatar} alt="" className="size-8 rounded-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
        : <span className={cn('flex size-8 items-center justify-center rounded-full text-xs font-semibold', iconTone)}>{item.authorName.slice(0, 1).toUpperCase()}</span>}
      <div className="min-w-0"><p className="m-0 truncate text-xs font-semibold text-foreground">{item.authorName}</p>{item.authorRole ? <p className="m-0 truncate text-[11px] text-muted-foreground">{item.authorRole}</p> : null}</div>
    </div>
  ) : null;
  const card = <section role="dialog" aria-modal={item.presentation === 'modal' ? 'true' : 'false'} aria-labelledby="bl-announcement-title"
    className={cn('relative overflow-hidden border bg-background text-foreground shadow-[0_2px_8px_oklch(0_0_0/0.08),0_24px_72px_oklch(0_0_0/0.22)]', design === 'professional' ? 'rounded-xl' : design === 'compact' ? 'rounded-2xl' : 'rounded-3xl', item.presentation === 'modal' ? 'w-full max-w-[500px]' : design === 'compact' ? 'w-[min(380px,calc(100vw-2rem))]' : 'w-[min(410px,calc(100vw-2rem))]')}
    style={{ opacity: entered && !exiting ? 1 : 0, transform: reduced || (entered && !exiting) ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.97)', transition: reduced ? 'opacity 120ms ease' : `opacity 200ms ${EASE_OUT}, transform 220ms ${EASE_OUT}` }}>
    {design === 'professional' ? <div className={cn('h-1', accentBar)} /> : null}
    {design !== 'compact' ? cover : null}
    <div className={design === 'compact' ? 'p-4' : 'p-5'}>
      <div className="flex items-start gap-3">
        {design !== 'editorial' ? <div className={cn('flex shrink-0 items-center justify-center', design === 'professional' ? 'size-9 rounded-lg' : design === 'compact' ? 'size-9 rounded-xl' : 'size-10 rounded-2xl', iconTone)}><Icon className={design === 'compact' ? 'size-4' : 'size-5'} /></div> : null}
        <div className="min-w-0 flex-1"><p className={cn('m-0 text-[11px] font-semibold uppercase tracking-[0.08em]', accentText)}>{item.eyebrow || defaultEyebrow}</p><h2 id="bl-announcement-title" className={cn('m-0 mt-0.5 font-semibold tracking-tight text-balance', design === 'editorial' ? 'text-xl' : design === 'compact' ? 'text-base' : 'text-lg')}>{item.title}</h2></div>
        <button type="button" onClick={() => close('dismissed')} aria-label="Luk" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.96]"><X className="size-4" /></button>
      </div>
      {design === 'compact' && item.coverUrl ? <div className="mt-3 aspect-[16/6] overflow-hidden rounded-xl bg-muted outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"><img src={item.coverUrl} alt={item.coverAlt ?? ''} className="size-full object-cover" /></div> : null}
      <div className={cn('text-sm leading-relaxed text-muted-foreground text-pretty', design === 'compact' ? 'mt-3' : 'mt-4')}><RichText node={item.body} /></div>
      {author}
      {item.ctaKind !== 'none' && item.ctaLabel ? <button type="button" onClick={action} className={cn('mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 text-sm font-semibold transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.96]', design === 'professional' ? 'rounded-lg' : 'rounded-xl', buttonTone)}>{item.ctaLabel}{item.ctaKind === 'url' ? <ExternalLink className="size-4" /> : null}</button> : null}
    </div>
  </section>;
  return createPortal(item.presentation === 'modal'
    ? <div className="fixed inset-0 z-[2147483100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" onClick={(event) => { if (event.target === event.currentTarget) close('dismissed'); }}>{card}</div>
    : <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[2147483000] flex justify-center sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-20"><div className="pointer-events-auto">{card}</div></div>, document.body);
}
