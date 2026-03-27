import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Calendar, ArrowUpRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────

interface DayNote {
  title: string;
  time: string; // e.g. "10:05-11:45" or "" for "Hele dagen"
  url: string;
}

export interface DayData {
  date: string;
  label: string;
  containerHtml: string;
  moduleHtml: string;
  containerHeight: string;
  notes: DayNote[];
}

export interface WeekData {
  days: DayData[];
  weekLabel: string;
  prevWeekParam: string | null;
  nextWeekParam: string | null;
}

// ── Schedule Fetcher & Parser ────────────────────────────────────────

function extractWeekParam(href: string | null): string | null {
  if (!href) return null;
  const match = href.match(/[?&]week=(\d+)/);
  return match ? match[1] : null;
}

function parseDaysFromDoc(doc: Document): DayData[] {
  const table = doc.querySelector<HTMLTableElement>('.s2skema');
  if (!table) return [];

  const dayHeaderRow = table.querySelector('tr.s2dayHeader');
  if (!dayHeaderRow) return [];
  const dayHeaders = Array.from(dayHeaderRow.children);

  const infoHeaderRow = table.querySelector('tr:has(.s2infoHeader)');
  const infoHeaderCells = infoHeaderRow ? Array.from(infoHeaderRow.children) as HTMLTableCellElement[] : [];

  const contentRow = table.querySelector('tr:has(td[data-date])');
  if (!contentRow) return [];
  const contentCells = Array.from(contentRow.children) as HTMLTableCellElement[];

  const timeCell = contentCells[0];
  const timeContainer = timeCell?.querySelector<HTMLElement>('.s2skemabrikcontainer');
  const moduleHtml = timeContainer ? timeContainer.innerHTML : '';

  const days: DayData[] = [];

  for (let i = 0; i < contentCells.length; i++) {
    const cell = contentCells[i];
    const date = cell.getAttribute('data-date');
    if (!date) continue;

    const headerCell = dayHeaders[i];
    const label = headerCell?.textContent?.trim() || date;

    const container = cell.querySelector<HTMLElement>('.s2skemabrikcontainer');
    if (!container) continue;

    const heightMatch = container.getAttribute('style')?.match(/height:\s*([\d.]+em)/);
    const containerHeight = heightMatch ? heightMatch[1] : '42em';

    const infoCell = infoHeaderCells[i];
    const notes: DayNote[] = [];
    if (infoCell) {
      infoCell.querySelectorAll<HTMLElement>('.s2skemabrik').forEach((brick) => {
        const undervalue = brick.querySelector('.separator-undervalue');
        const value = brick.querySelector('.separator-value');
        const title = undervalue?.textContent?.trim() || '';
        const time = value?.textContent?.trim() || '';
        const href = brick.getAttribute('href') || '';
        const url = href.startsWith('/') ? `${window.location.origin}${href}` : href;
        if (title) notes.push({ title, time, url });
      });
    }

    days.push({ date, label, containerHtml: container.innerHTML, moduleHtml, containerHeight, notes });
  }

  return days;
}

export async function fetchScheduleWeek(schoolId: string, weekParam?: string): Promise<WeekData | null> {
  const base = new URL(`/lectio/${schoolId}/SkemaNy.aspx`, window.location.origin);
  if (weekParam) base.searchParams.set('week', weekParam);
  const response = await fetch(base.href, { credentials: 'include' });
  if (!response.ok) return null;

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const days = parseDaysFromDoc(doc);
  if (days.length === 0) return null;

  // Week label from datepicker input
  const datepickerInput = doc.querySelector<HTMLInputElement>('.ls-datepickerbox');
  const weekLabel = datepickerInput?.value || '';

  // Prev/next week params from nav links
  const prevLink = doc.querySelector<HTMLAnchorElement>('a[data-nav="previous"]');
  const nextLink = doc.querySelector<HTMLAnchorElement>('a[data-nav="next"]');
  const prevWeekParam = extractWeekParam(prevLink?.getAttribute('href') ?? null);
  const nextWeekParam = extractWeekParam(nextLink?.getAttribute('href') ?? null);

  return { days, weekLabel, prevWeekParam, nextWeekParam };
}

// ── Component ────────────────────────────────────────────────────────

interface Props {
  initialWeekData: WeekData;
  schoolId: string;
  onBricksInjected?: (container: HTMLElement) => void;
  showTimeIndicator?: boolean;
  showTimeLabel?: boolean;
}

const DANISH_DAYS_FULL = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const DANISH_DAYS_SHORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

export function ForsideSchedulePanel({ initialWeekData, schoolId, onBricksInjected, showTimeIndicator = true, showTimeLabel = false }: Props) {
  const todayISO = new Date().toISOString().split('T')[0];
  const [weekData, setWeekData] = useState<WeekData>(initialWeekData);
  const [weekLoading, setWeekLoading] = useState(false);

  const days = weekData.days;
  const todayIndex = days.findIndex(d => d.date === todayISO);
  const [dayIndex, setDayIndex] = useState(todayIndex >= 0 ? todayIndex : 0);
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const timeModuleRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentDay = days[dayIndex];
  const isToday = currentDay?.date === todayISO;

  // Check if current week contains today
  const isCurrentWeek = days.some(d => d.date === todayISO);

  // Inject brick HTML and set up time indicator
  useEffect(() => {
    if (!currentDay || !brickContainerRef.current || !timeModuleRef.current) return;

    const brickEl = brickContainerRef.current;
    brickEl.innerHTML = currentDay.containerHtml;
    brickEl.style.height = currentDay.containerHeight;

    const timeEl = timeModuleRef.current;
    timeEl.innerHTML = currentDay.moduleHtml;
    timeEl.style.height = currentDay.containerHeight;

    // Parse time indicator data BEFORE cleaning up module labels
    const timePoints: { minutes: number; em: number }[] = [];
    const moduleBgs = Array.from(timeEl.querySelectorAll<HTMLElement>('.s2module-bg'));
    const moduleInfos = Array.from(timeEl.querySelectorAll<HTMLElement>('.s2module-info'));
    for (let m = 0; m < moduleBgs.length; m++) {
      const mod = moduleBgs[m];
      const info = moduleInfos[m];
      const topMatch = mod.getAttribute('style')?.match(/top:\s*([\d.]+)em/);
      const heightMatch = mod.getAttribute('style')?.match(/height:\s*([\d.]+)em/);
      if (!topMatch || !heightMatch) continue;
      const topEm = parseFloat(topMatch[1]);
      const heightEm = parseFloat(heightMatch[1]);

      const text = info?.textContent || '';
      const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      if (!timeMatch) continue;
      const startMin = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
      const endMin = parseInt(timeMatch[3]) * 60 + parseInt(timeMatch[4]);

      timePoints.push({ minutes: startMin, em: topEm });
      timePoints.push({ minutes: endMin, em: topEm + heightEm });
    }
    timePoints.sort((a, b) => a.minutes - b.minutes);

    // Clean up module labels — same as cleanUpModuleLabels() on SkemaNy page
    // Replaces "1. modul\n8:10 - 9:50" with flex column start/end times
    moduleInfos.forEach((info) => {
      const innerDiv = info.querySelector<HTMLElement>('div');
      if (!innerDiv) return;

      const text = innerDiv.textContent || '';
      const m = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (!m) return;

      const top = info.style.top;
      const matchingBg = timeEl.querySelector<HTMLElement>(
        `.s2module-bg[style*="top:${top}"], .s2module-bg[style*="top: ${top}"]`,
      );
      const bgHeight = matchingBg?.style.height || '6.364em';

      info.style.height = bgHeight;
      innerDiv.style.cssText = 'display:flex;flex-direction:column;justify-content:space-between;height:108%;padding:0.15em 0.2em 0;box-sizing:border-box;';
      innerDiv.innerHTML = `<span class="il-module-time">${m[1]}</span><span class="il-module-time il-module-time-end">${m[2]}</span>`;
    });

    if (onBricksInjected) {
      onBricksInjected(brickEl);
    }

    // Time indicator (today only)
    const isCurrentDayToday = currentDay.date === new Date().toISOString().split('T')[0];
    let intervalId: number | undefined;

    if (isCurrentDayToday && showTimeIndicator) {

      timePoints.sort((a, b) => a.minutes - b.minutes);

      const interpolate = (currentMinutes: number): number | null => {
        if (timePoints.length < 2) return null;
        const first = timePoints[0];
        const last = timePoints[timePoints.length - 1];
        if (currentMinutes < first.minutes - 10 || currentMinutes > last.minutes + 10) return null;
        if (currentMinutes <= first.minutes) return first.em;
        if (currentMinutes >= last.minutes) return last.em;

        let lower = first;
        let upper = last;
        for (const pt of timePoints) {
          if (pt.minutes <= currentMinutes) lower = pt;
          if (pt.minutes >= currentMinutes && pt.minutes < upper.minutes) upper = pt;
        }
        if (upper.minutes === lower.minutes) return lower.em;
        const t = (currentMinutes - lower.minutes) / (upper.minutes - lower.minutes);
        return lower.em + t * (upper.em - lower.em);
      };

      // Create persistent indicator elements (reuse across ticks)
      const brickIndicator = document.createElement('div');
      brickIndicator.className = 'il-panel-time-indicator';
      brickIndicator.style.cssText = 'position:absolute;left:0;right:0;height:2px;background:oklch(0.63 0.21 25);z-index:5;pointer-events:none;';
      const dot = document.createElement('div');
      dot.style.cssText = 'position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:oklch(0.63 0.21 25);';
      brickIndicator.appendChild(dot);

      brickEl.appendChild(brickIndicator);

      // Time label in the time column (only when setting enabled)
      let timeIndicator: HTMLElement | null = null;
      let timeLabel: HTMLElement | null = null;
      if (showTimeLabel) {
        timeIndicator = document.createElement('div');
        timeIndicator.className = 'il-panel-time-indicator';
        timeIndicator.style.cssText = 'position:absolute;right:0;z-index:5;pointer-events:none;';

        timeLabel = document.createElement('span');
        timeLabel.style.cssText = 'position:absolute;right:0.3em;top:-0.45em;font-size:0.6875rem;font-weight:600;color:oklch(0.63 0.21 25);white-space:nowrap;background:var(--card);padding:0 0.15em;';
        timeIndicator.appendChild(timeLabel);
        timeEl.appendChild(timeIndicator);
      }

      const tick = () => {
        const now = new Date();
        const mins = now.getHours() * 60 + now.getMinutes();
        const topEm = interpolate(mins);
        if (topEm === null) {
          brickIndicator.style.display = 'none';
          if (timeIndicator) timeIndicator.style.display = 'none';
        } else {
          brickIndicator.style.display = '';
          brickIndicator.style.top = `${topEm}em`;
          if (timeIndicator) {
            timeIndicator.style.display = '';
            timeIndicator.style.top = `${topEm}em`;
          }
          if (timeLabel) {
            timeLabel.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          }
        }
      };

      tick();
      intervalId = window.setInterval(tick, 60_000);
    }

    // Auto-scroll to bring the time indicator into view on today
    if (isCurrentDayToday && scrollRef.current) {
      requestAnimationFrame(() => {
        const indicatorEl = brickEl.querySelector('.il-panel-time-indicator') as HTMLElement | null;
        const scrollEl = scrollRef.current;
        if (!indicatorEl || !scrollEl) return;
        const targetScroll = Math.max(0, indicatorEl.offsetTop - scrollEl.clientHeight / 3);
        scrollEl.scrollTo({ top: targetScroll, behavior: 'smooth' });
      });
    }

    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [dayIndex, currentDay]);

  const goToToday = useCallback(() => {
    if (weekLoading) return;
    // If today is already in the current week, just jump to it
    const idx = weekData.days.findIndex(d => d.date === todayISO);
    if (idx >= 0) {
      setDayIndex(idx);
      return;
    }
    // Fetch current week (no param = this week)
    setWeekLoading(true);
    fetchScheduleWeek(schoolId).then(data => {
      setWeekLoading(false);
      if (data) {
        setWeekData(data);
        const ti = data.days.findIndex(d => d.date === todayISO);
        setDayIndex(ti >= 0 ? ti : 0);
      }
    });
  }, [weekData.days, weekLoading, schoolId, todayISO]);

  const navigate = useCallback((delta: number) => {
    setDayIndex(prev => {
      const next = prev + delta;
      // Cross-week navigation
      if (next < 0 && weekData.prevWeekParam && !weekLoading) {
        setWeekLoading(true);
        fetchScheduleWeek(schoolId, weekData.prevWeekParam).then(data => {
          setWeekLoading(false);
          if (data) {
            setWeekData(data);
            setDayIndex(data.days.length - 1);
          }
        });
        return prev;
      }
      if (next >= days.length && weekData.nextWeekParam && !weekLoading) {
        setWeekLoading(true);
        fetchScheduleWeek(schoolId, weekData.nextWeekParam).then(data => {
          setWeekLoading(false);
          if (data) {
            setWeekData(data);
            setDayIndex(0);
          }
        });
        return prev;
      }
      if (next < 0 || next >= days.length) return prev;
      return next;
    });
  }, [days.length, weekData.prevWeekParam, weekData.nextWeekParam, weekLoading, schoolId]);

  if (days.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Calendar size={32} className="opacity-30" />
        <span className="text-sm">Kunne ikke hente skema</span>
      </div>
    );
  }

  // Build day label like "Mandag 2. mar."
  const currentDate = new Date(currentDay.date + 'T12:00:00');
  const dayNameFull = DANISH_DAYS_FULL[currentDate.getDay()];
  const dayLabel = `${dayNameFull.charAt(0).toUpperCase() + dayNameFull.slice(1)} ${currentDate.getDate()}/${currentDate.getMonth() + 1}`;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Skema</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isToday ? 'I dag' : isCurrentWeek ? dayLabel : weekData.weekLabel.replace(/\s*\(.*/, '') + ' — ' + dayLabel}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {!isCurrentWeek && (
              <button
                onClick={goToToday}
                disabled={weekLoading}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary transition-[color,background-color] duration-150 hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
                style={{ background: 'none', border: 'none' }}
                title="Gå til i dag"
              >
                <span className="inline-block size-1.5 rounded-full bg-primary" />
                I dag
              </button>
            )}
            <a
              href={`/lectio/${schoolId}/SkemaNy.aspx`}
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color] duration-150 hover:bg-accent hover:text-foreground"
              title="Se fuld skema"
            >
              <ArrowUpRight size={18} />
            </a>
          </div>
        </div>
      </div>

      {/* Day picker */}
      <div className="mx-5 mb-5 flex items-center gap-1.5 rounded-xl bg-muted/60 p-1.5">
        <button
          disabled={(dayIndex <= 0 && !weekData.prevWeekParam) || weekLoading}
          onClick={() => navigate(-1)}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color] duration-150 hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex flex-1 justify-center gap-1">
          {days.map((day, i) => {
            const d = new Date(day.date + 'T12:00:00');
            const dayAbbr = DANISH_DAYS_SHORT[d.getDay()];
            const dayNum = d.getDate();
            const isActive = i === dayIndex;
            const isDayToday = day.date === todayISO;
            return (
              <button
                key={day.date}
                onClick={() => setDayIndex(i)}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center rounded-lg py-2 transition-all",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : isDayToday
                      ? "text-primary font-semibold hover:bg-background/60"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
                style={{ border: 'none', background: isActive ? undefined : 'none' }}
                title={day.label}
              >
                <span className="text-xs uppercase tracking-wide opacity-60">{dayAbbr}</span>
                <span className="text-base font-semibold leading-tight">{dayNum}</span>
              </button>
            );
          })}
        </div>

        <button
          disabled={(dayIndex >= days.length - 1 && !weekData.nextWeekParam) || weekLoading}
          onClick={() => navigate(1)}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color] duration-150 hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day-level info notes (e.g. "Hele dagen" events) */}
      {currentDay.notes.length > 0 && (
        <div className="mx-5 mb-3 flex shrink-0 flex-col gap-1">
          {currentDay.notes.map((note, i) => (
            <a
              key={i}
              href={note.url || undefined}
              onClick={(e) => {
                if (!note.url) return;
                e.preventDefault();
                window.dispatchEvent(
                  new CustomEvent('betterlectio:openActivityModal', { detail: { url: note.url } }),
                );
              }}
              className={cn(
                "rounded-md bg-muted/50 px-3 py-1.5 text-[0.8125rem] no-underline transition-[color,background-color] duration-150",
                note.url && "cursor-pointer hover:bg-muted",
              )}
            >
              {note.time && (
                <span className="mr-1.5 text-xs text-muted-foreground">{note.time}</span>
              )}
              <span className="font-medium text-foreground">{note.title}</span>
              {!note.time && (
                <span className="ml-1.5 text-xs text-muted-foreground">Hele dagen</span>
              )}
            </a>
          ))}
        </div>
      )}

      {/* Schedule grid — uses 1rem (16px) font-size so Lectio em-based positioning works correctly */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 pb-5">
        {weekLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="flex text-base">
          {/* Time column */}
          <div
            ref={timeModuleRef}
            className="s2skemabrikcontainer relative shrink-0"
            style={{ width: '3.5em' }}
          />
          {/* Brick column */}
          <div
            ref={brickContainerRef}
            className="s2skemabrikcontainer relative flex-1"
          />
        </div>
      </div>
    </div>
  );
}
