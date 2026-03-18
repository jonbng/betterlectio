import { useState, useRef, useEffect, useCallback, useMemo } from 'preact/hooks';
import {
  Search, X, Plus, CheckCheck, Trash2, ArchiveRestore, Flag, FlagOff,
  Mail, MailOpen, Paperclip, ChevronDown, ChevronRight,
  Inbox, Send, Star, Clock, AlertCircle, Users, FolderOpen,
  MoreHorizontal, MailWarning, Check, Minus,
} from 'lucide-react';
import {
  parseBeskederFromDOM,
  selectFolder as selectFolderNative,
  openThread,
  toggleFlag as toggleFlagNative,
  toggleRead as toggleReadNative,
  deleteThread as deleteThreadNative,
  newMessage,
  markAllRead as markAllReadNative,
  executeSearch as executeSearchNative,
  executeBulkAction as executeBulkActionNative,
  toggleThreadCheckbox,
  parseFormTokens,
  type BeskederPageData,
  type BeskedThread,
  type BeskedFolder,
  type PersonRef,
} from '@/lib/beskeder-parser';
import {
  toggleFlagViaIframe,
  toggleReadViaIframe,
  deleteThreadViaIframe,
  selectFolderViaIframe,
  refreshThreadListViaIframe,
  executeSearchViaIframe,
  executeBulkActionViaIframe,
  markAllReadViaIframe,
  type FormState,
  type SubmitError,
} from '@/lib/beskeder-submit';
import { getTeacherName, getTeacherContextCardId, loadTeacherNames, type TeacherCache } from '@/lib/teacher-cache';
import {
  ensureNameIdCache,
  fetchPictureUrl,
  getCachedPictureUrl,
  getPersonScheduleUrlFromMessage,
  lookupContextCardIdByName,
} from '@/lib/findskema-storage';
import { formatRelativeDate, getInitials, nameToHue } from '@/lib/beskeder-helpers';
import { cn } from '@/lib/utils';
import { getUnreadCount, getCachedUnreadCount, broadcastUnreadCount } from '@/lib/unread-messages';
// ── Helpers ────────────────────────────────────────────────────────────

function normalizePersonLabel(value: string): string {
  return value.replace(/\s*\n+\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
}

function getPersonLabel(person: PersonRef): string {
  return normalizePersonLabel(person.fullName || person.name || '');
}

/** Map folder IDs to appropriate icons. */
function getFolderIcon(id: string) {
  switch (id) {
    case '-70': return <Clock size={15} />;
    case '-40': return <MailWarning size={15} />;
    case '-50': return <Flag size={15} />;
    case '-60': return <Trash2 size={15} />;
    case '-10': return <Inbox size={15} />;
    case '-80': return <Send size={15} />;
    case '-20': return <Users size={15} />;
    case '-30': return <Users size={15} />;
    case '-35': return <FolderOpen size={15} />;
    default: return <FolderOpen size={14} />;
  }
}

// ── Folder Navigation ──────────────────────────────────────────────────

interface FolderPillProps {
  folder: BeskedFolder;
  isChild?: boolean;
  onSelectFolder: (commandArgument: string) => void;
}

function FolderPill({ folder, isChild, onSelectFolder }: FolderPillProps) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    if (folder.isExpandable && folder.children.length > 0) {
      setExpanded(!expanded);
    } else {
      onSelectFolder(folder.commandArgument);
    }
  };

  const pillClass = cn(
    'inline-flex items-center gap-1.5 rounded-full border bg-background text-xs font-medium leading-tight text-muted-foreground transition-all',
    'px-3 py-1.5',
    'hover:border-muted-foreground hover:bg-muted hover:text-foreground',
    folder.isSelected && 'border-primary bg-primary text-primary-foreground font-semibold',
    isChild && 'px-2.5 py-1 text-xs',
    folder.isExpandable && 'pr-2',
  );

  return (
    <div className="relative">
      <button type="button" className={cn('group', pillClass)} onClick={handleClick}>
        {!isChild && getFolderIcon(folder.id)}
        <span className="truncate">{folder.name}</span>
        {folder.isExpandable && folder.children.length > 0 && (
          <span className="inline-flex items-center opacity-70 transition-opacity group-hover:opacity-100">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </button>

      {folder.isExpandable && expanded && folder.children.length > 0 && (
        <div className="animate-[beskeder-dropdown-in_0.15s_ease-out] absolute left-0 top-[calc(100%+6px)] z-50 flex max-h-72 min-w-56 max-w-96 flex-wrap gap-1 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-[0_4px_16px_oklch(0_0_0/0.08),0_1px_3px_oklch(0_0_0/0.04)]">
          {folder.children.map(child => (
            <FolderPill key={child.id} folder={child} isChild onSelectFolder={onSelectFolder} />
          ))}
        </div>
      )}
    </div>
  );
}

// Stable ordering for root folders
const FOLDER_ORDER: Record<string, number> = {
  '-70': 1, '-40': 2, '-50': 3, '-10': 4, '-80': 5, '-60': 6,
  '-20': 7, '-30': 8, '-35': 9,
};

function FolderNav({ folders, onSelectFolder }: { folders: BeskedFolder[]; onSelectFolder: (cmd: string) => void }) {
  const sorted = [...folders].sort((a, b) => {
    const oa = FOLDER_ORDER[a.id] ?? 100;
    const ob = FOLDER_ORDER[b.id] ?? 100;
    return oa - ob;
  });

  return (
    <nav className="flex flex-wrap gap-1.5">
      {sorted.map(folder => (
        <FolderPill key={folder.id} folder={folder} onSelectFolder={onSelectFolder} />
      ))}
    </nav>
  );
}

// ── Sender Avatar ──────────────────────────────────────────────────────

function SenderAvatar({ person, schoolId, nameIdReady }: { person: PersonRef; schoolId: string; nameIdReady: boolean }) {
  const displayName = getPersonLabel(person) || person.name;
  const initials = getInitials(displayName);
  const hue = nameToHue(displayName);

  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    // Resolve context card ID: direct from DOM, or by name lookup
    const ctxId = person.contextCardId || lookupContextCardIdByName(displayName, schoolId);
    if (!ctxId) return;

    const fetchKey = `${schoolId}:${ctxId}`;
    if (fetchedRef.current === fetchKey) return;
    fetchedRef.current = fetchKey;
    setImgError(false);
    setPictureUrl(null);

    const cached = getCachedPictureUrl(ctxId);
    if (cached !== undefined) {
      if (cached) setPictureUrl(cached);
      return;
    }

    fetchPictureUrl(ctxId, schoolId).then((url) => {
      if (url) setPictureUrl(url);
    });
  }, [person.contextCardId, displayName, schoolId, nameIdReady]);

  if (pictureUrl && !imgError) {
    return (
      <img
        src={pictureUrl}
        alt={displayName}
        className="size-8 rounded-full object-cover object-top"
        title={displayName}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold [background:oklch(0.92_0.03_var(--avatar-hue))] text-[oklch(0.35_0.08_var(--avatar-hue))] dark:[background:oklch(0.28_0.04_var(--avatar-hue))] dark:text-[oklch(0.76_0.08_var(--avatar-hue))]"
      style={{ '--avatar-hue': hue } as any}
      title={displayName}
    >
      {initials}
    </div>
  );
}

// ── Thread Row ─────────────────────────────────────────────────────────

interface ThreadRowProps {
  thread: BeskedThread;
  isSelected: boolean;
  onToggleSelect: (threadId: string) => void;
  onOpen: (thread: BeskedThread) => void;
  onFlag: (threadId: string) => void;
  onRead: (threadId: string, isRead: boolean) => void;
  onDelete: (threadId: string, isDeleted: boolean) => void;
  index: number;
  schoolId: string;
  nameIdReady: boolean;
  actionLoading: string | null;
}

function actionIsLoading(actionLoading: string | null, threadId: string): boolean {
  if (!actionLoading) return false;
  return actionLoading.endsWith(`-${threadId}`);
}

function formatActionError(error: SubmitError): string {
  if (error.kind === 'session_expired') return 'Session udløbet. Log ind igen.';
  if (error.kind === 'timeout') return 'Timeout. Opdatér siden for at bekræfte status, før du prøver igen.';
  return 'Kunne ikke bekræfte handlingen. Opdatér siden for at undgå dubletter.';
}

function ThreadRow({ thread, isSelected, onToggleSelect, onOpen, onFlag, onRead, onDelete, index, schoolId, nameIdReady, actionLoading }: ThreadRowProps) {
  const [showActions, setShowActions] = useState(false);
  const isBusy = actionIsLoading(actionLoading, thread.threadId);
  const latestSenderScheduleUrl = getPersonScheduleUrlFromMessage(
    thread.latestSender.contextCardId,
    getPersonLabel(thread.latestSender),
    schoolId,
  );
  const recipientsScheduleUrl = getPersonScheduleUrlFromMessage(
    thread.recipients.contextCardId,
    getPersonLabel(thread.recipients),
    schoolId,
  );

  const rowClass = cn(
    'animate-[beskeder-row-in_0.25s_ease-out_both] relative flex cursor-pointer items-center gap-3 border-b border-border/70 px-3 py-2.5 transition-colors last:border-b-0',
    'hover:bg-muted',
    thread.isUnread && 'bg-primary/5',
    isSelected && 'bg-primary/10 hover:bg-primary/15',
  );

  const handleOpen = (e: MouseEvent) => {
    // Don't open if clicking on an action button or checkbox
    const target = e.target as HTMLElement;
    if (target.closest('[data-row-actions]') ||
        target.closest('[data-row-check]')) return;
    onOpen(thread);
  };

  const handleOpenByKeyboard = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onOpen(thread);
  };

  const handleFlag = (e: MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    onFlag(thread.threadId);
  };

  const handleRead = (e: MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    onRead(thread.threadId, thread.isRead);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    onDelete(thread.threadId, thread.isDeleted);
  };

  const handleCheck = (e: Event) => {
    e.stopPropagation();
    onToggleSelect(thread.threadId);
    toggleThreadCheckbox(thread.ctlIndex, !isSelected);
  };

  const handlePersonNavigate = (e: MouseEvent, url: string | null) => {
    if (!url) return;
    e.stopPropagation();
    window.location.href = url;
  };

  const handlePersonNavigateByKeyboard = (e: KeyboardEvent, url: string | null) => {
    if (!url) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    window.location.href = url;
  };

  const dateDisplay = formatRelativeDate(thread.dateText, thread.date);

  return (
    <div
      className={rowClass}
      onClick={handleOpen}
      onKeyDown={handleOpenByKeyboard}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      role="button"
      tabIndex={0}
      style={{ animationDelay: `${index * 30}ms` } as any}
    >
      {/* Checkbox */}
      <div data-row-check className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheck}
          onClick={(e) => e.stopPropagation()}
          className="peer sr-only"
        />
        <span className="inline-flex size-4 items-center justify-center rounded-[4px] border border-border bg-background transition-colors peer-checked:border-primary peer-checked:bg-primary">
          <Check size={12} className="text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100" />
        </span>
      </div>

      {/* Unread indicator */}
      {thread.isUnread && <div className="absolute left-1 size-1.5 shrink-0 rounded-full bg-primary" />}

      {/* Avatar */}
      <button
        type="button"
        className={cn('shrink-0 rounded-full transition-transform hover:scale-[1.03]', !latestSenderScheduleUrl && 'cursor-default')}
        onClick={(e) => handlePersonNavigate(e, latestSenderScheduleUrl)}
        onKeyDown={(e) => handlePersonNavigateByKeyboard(e, latestSenderScheduleUrl)}
        disabled={!latestSenderScheduleUrl}
        title={latestSenderScheduleUrl ? `Vis ${getPersonLabel(thread.latestSender)}s skema` : undefined}
      >
        <SenderAvatar person={thread.latestSender} schoolId={schoolId} nameIdReady={nameIdReady} />
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1 pr-17">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
          <button
            type="button"
            className={cn(
              'line-clamp-2 wrap-anywhere overflow-hidden text-left text-base text-foreground transition-colors hover:text-primary',
              thread.isUnread ? 'font-semibold' : 'font-medium',
              !latestSenderScheduleUrl && 'cursor-default hover:text-foreground',
            )}
            onClick={(e) => handlePersonNavigate(e, latestSenderScheduleUrl)}
            onKeyDown={(e) => handlePersonNavigateByKeyboard(e, latestSenderScheduleUrl)}
            disabled={!latestSenderScheduleUrl}
            title={latestSenderScheduleUrl ? `Vis ${getPersonLabel(thread.latestSender)}s skema` : undefined}
          >
            {getPersonLabel(thread.latestSender)}
          </button>
          <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">{dateDisplay}</span>
        </div>
        <div className="mt-0.5 inline-flex items-center gap-1.5">
          <span className={cn("line-clamp-2 wrap-anywhere overflow-hidden text-base text-foreground/85", thread.isUnread && "font-semibold text-foreground")}>{thread.subject}</span>
          {thread.hasAttachment && (
            <Paperclip size={13} className="shrink-0 text-muted-foreground/70" />
          )}
          {thread.isFlagged && (
            <Flag size={13} className="shrink-0 text-[oklch(0.65_0.18_50)]" />
          )}
        </div>
        <div className="mt-0.5 flex items-center">
          <button
            type="button"
            className={cn(
              'line-clamp-2 wrap-anywhere overflow-hidden text-left text-base leading-tight text-muted-foreground transition-colors hover:text-primary',
              !recipientsScheduleUrl && 'cursor-default hover:text-muted-foreground',
            )}
            onClick={(e) => handlePersonNavigate(e, recipientsScheduleUrl)}
            onKeyDown={(e) => handlePersonNavigateByKeyboard(e, recipientsScheduleUrl)}
            disabled={!recipientsScheduleUrl}
            title={recipientsScheduleUrl ? `Vis ${getPersonLabel(thread.recipients)}s skema` : undefined}
          >
            Til: {getPersonLabel(thread.recipients)}
          </button>
        </div>
      </div>

      {/* Hover actions */}
      <div
        data-row-actions
        className={cn(
          'pointer-events-none absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md bg-card p-0.5 shadow-[-8px_0_8px_var(--card)] transition-opacity',
          showActions ? 'pointer-events-auto opacity-100' : 'opacity-0',
        )}
      >
        <button
          type="button"
          className="inline-flex size-6.5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={handleFlag}
          disabled={isBusy}
          title={thread.isFlagged ? 'Fjern flag' : 'Tilføj flag'}
        >
          {thread.isFlagged ? <FlagOff size={15} /> : <Flag size={15} />}
        </button>
        <button
          type="button"
          className="inline-flex size-6.5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={handleRead}
          disabled={isBusy}
          title={thread.isRead ? 'Marker som ulæst' : 'Marker som læst'}
        >
          {thread.isRead ? <Mail size={15} /> : <MailOpen size={15} />}
        </button>
        <button
          type="button"
          className={cn(
            'inline-flex size-6.5 items-center justify-center rounded transition-colors',
            thread.isDeleted
              ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'text-destructive hover:bg-[oklch(0.95_0.02_25)] hover:text-[oklch(0.55_0.2_25)] dark:hover:bg-[oklch(0.25_0.04_25)] dark:hover:text-[oklch(0.7_0.16_25)]',
          )}
          onClick={handleDelete}
          disabled={isBusy}
          title={thread.isDeleted ? 'Gendan besked' : 'Slet besked'}
        >
          {thread.isDeleted ? <ArchiveRestore size={15} /> : <Trash2 size={15} />}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

interface BeskederPageProps {
  data: BeskederPageData;
  schoolId: string;
}

function withResolvedTeacherName(person: PersonRef, teacherCache: TeacherCache | null): PersonRef {
  if (!teacherCache || person.type !== 'teacher') return person;

  const abbrev = person.name.trim();
  if (!abbrev) return person;

  const fullName = getTeacherName(teacherCache, abbrev);
  const contextCardId = person.contextCardId || getTeacherContextCardId(teacherCache, abbrev) || undefined;

  if ((!fullName || fullName === person.name) && !contextCardId) return person;

  return {
    ...person,
    name: fullName || person.name,
    fullName: fullName || person.fullName,
    contextCardId,
  };
}

export function BeskederPage({ data, schoolId }: BeskederPageProps) {
  const [rawThreads, setRawThreads] = useState<BeskedThread[]>(data.threads);
  const [folders, setFolders] = useState<BeskedFolder[]>(data.folders);
  const [currentFolderName, setCurrentFolderName] = useState(data.currentFolderName);
  const [selectedThreads, setSelectedThreads] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState(data.toolbar.searchText);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [teacherCache, setTeacherCache] = useState<TeacherCache | null>(null);
  const [nameIdReady, setNameIdReady] = useState(false);
  const [formState, setFormState] = useState<FormState>(() => {
    const { tokens, action } = parseFormTokens();
    return { tokens, action };
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLDivElement>(null);
  const pollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let isCancelled = false;

    loadTeacherNames(schoolId).then((cache) => {
      if (isCancelled || !cache) return;
      setTeacherCache(cache);
    });

    // Populate name→ID cache for profile picture resolution
    ensureNameIdCache(schoolId, () => {
      if (!isCancelled) setNameIdReady(true);
    });

    return () => {
      isCancelled = true;
    };
  }, [schoolId]);

  // Auto-open first thread when redirected from compose after sending
  useEffect(() => {
    const flag = sessionStorage.getItem('bl-autoopen-thread');
    if (flag === 'first' && data.threads.length > 0) {
      sessionStorage.removeItem('bl-autoopen-thread');
      // Delay to ensure ASP.NET form is in the DOM after content script moves it
      setTimeout(() => {
        openThread(data.threads[0].threadId);
      }, 100);
    }
  }, []);

  const threads = useMemo(
    () =>
      rawThreads.map((thread) => ({
        ...thread,
        latestSender: withResolvedTeacherName(thread.latestSender, teacherCache),
        firstSender: withResolvedTeacherName(thread.firstSender, teacherCache),
        recipients: withResolvedTeacherName(thread.recipients, teacherCache),
      })),
    [rawThreads, teacherCache],
  );

  const [globalUnreadCount, setGlobalUnreadCount] = useState<number>(() => getCachedUnreadCount(schoolId) ?? 0);

  const setSyncedGlobalUnreadCount = useCallback((next: number | ((current: number) => number)) => {
    setGlobalUnreadCount((current) => {
      const resolved = typeof next === 'function' ? (next as (value: number) => number)(current) : next;
      const normalized = Math.max(0, resolved);
      broadcastUnreadCount(schoolId, normalized);
      return normalized;
    });
  }, [schoolId]);

  // Fetch global unread count (from forside "N ulæste")
  useEffect(() => {
    let cancelled = false;
    getUnreadCount(schoolId).then((count) => {
      if (!cancelled) setSyncedGlobalUnreadCount(count);
    });
    return () => { cancelled = true; };
  }, [schoolId, setSyncedGlobalUnreadCount]);

  // Close bulk menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bulkRef.current && !bulkRef.current.contains(e.target as Node)) {
        setBulkMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcut: focus search on /
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey &&
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const clearPollTimeout = () => {
      if (pollTimeoutRef.current !== null) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };

    const scheduleNextPoll = () => {
      if (cancelled) return;
      const nextDelayMs = 30000 + Math.floor(Math.random() * 30000);
      pollTimeoutRef.current = window.setTimeout(() => {
        if (cancelled) return;
        if (document.visibilityState !== 'visible') {
          scheduleNextPoll();
          return;
        }
        if (actionLoading) {
          scheduleNextPoll();
          return;
        }

        refreshThreadListViaIframe(formState).then((result) => {
          if (cancelled) return;
          if (result.success) {
            setFormState(result.formState);
            setRawThreads(result.data.threads);
            setFolders(result.data.folders);
            setCurrentFolderName(result.data.currentFolderName);
            setSelectedThreads((prev) => {
              const available = new Set(result.data.threads.map((t) => t.threadId));
              const next = new Set<string>();
              prev.forEach((id) => {
                if (available.has(id)) next.add(id);
              });
              return next;
            });
          } else if (result.error.kind === 'session_expired') {
            // Let native page/session flow handle expiration.
            return;
          }
          scheduleNextPoll();
        });
      }, nextDelayMs);
    };

    scheduleNextPoll();
    return () => {
      cancelled = true;
      clearPollTimeout();
    };
  }, [formState, actionLoading]);

  const handleSelectFolder = useCallback((commandArgument: string) => {
    setActionLoading('folder');
    setError(null);

    selectFolderViaIframe(formState, commandArgument).then((result) => {
      setActionLoading(null);
      if (result.success) {
        setFormState(result.formState);
        setRawThreads(result.data.threads);
        setFolders(result.data.folders);
        setCurrentFolderName(result.data.currentFolderName);
        setSelectedThreads(new Set());
      } else {
        console.warn('[BetterLectio] Folder switch iframe failed, falling back:', result.error);
        if (result.error.kind === 'session_expired') selectFolderNative(commandArgument);
        else setError(formatActionError(result.error));
      }
    });
  }, [formState]);

  const handleMarkAllRead = useCallback(() => {
    const unreadInView = rawThreads.filter((thread) => thread.isUnread).length;
    setActionLoading('markAllRead');
    setError(null);

    markAllReadViaIframe(formState).then((result) => {
      setActionLoading(null);
      if (result.success) {
        setFormState(result.formState);
        setRawThreads(result.data.threads);
        if (unreadInView > 0) {
          setSyncedGlobalUnreadCount((count) => count - unreadInView);
        }
      } else {
        console.warn('[BetterLectio] Mark all read iframe failed:', result.error);
        if (result.error.kind === 'session_expired') markAllReadNative();
        else setError(formatActionError(result.error));
      }
    });
  }, [formState, rawThreads, setSyncedGlobalUnreadCount]);

  const handleToggleSelect = useCallback((threadId: string) => {
    setSelectedThreads(prev => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }, []);

  const handleSelectAll = () => {
    if (selectedThreads.size === threads.length) {
      // Deselect all
      for (const t of threads) {
        toggleThreadCheckbox(t.ctlIndex, false);
      }
      setSelectedThreads(new Set());
    } else {
      // Select all
      const all = new Set<string>();
      for (const t of threads) {
        all.add(t.threadId);
        toggleThreadCheckbox(t.ctlIndex, true);
      }
      setSelectedThreads(all);
    }
  };

  const handleFlag = useCallback((threadId: string) => {
    const currentlyFlagged = rawThreads.find(t => t.threadId === threadId)?.isFlagged ?? false;

    // Optimistic update
    setRawThreads(prev => prev.map(t =>
      t.threadId === threadId ? { ...t, isFlagged: !t.isFlagged } : t,
    ));
    setActionLoading(`flag-${threadId}`);
    setError(null);

    toggleFlagViaIframe(formState, threadId, currentlyFlagged).then((result) => {
      setActionLoading(null);
      if (result.success) {
        setFormState(result.formState);
        // Confirm or correct optimistic update
        setRawThreads(prev => prev.map(t =>
          t.threadId === threadId ? { ...t, isFlagged: result.data.isFlagged } : t,
        ));
      } else {
        console.warn('[BetterLectio] Flag iframe failed:', result.error);
        if (result.error.kind === 'session_expired') toggleFlagNative(threadId, currentlyFlagged);
        else setError(formatActionError(result.error));
        setRawThreads(prev => prev.map(t =>
          t.threadId === threadId ? { ...t, isFlagged: !t.isFlagged } : t,
        ));
      }
    });
  }, [formState, rawThreads]);

  const handleRead = useCallback((threadId: string, currentlyRead: boolean) => {
    const delta = currentlyRead ? 1 : -1;
    // Optimistic update
    setRawThreads(prev => prev.map(t =>
      t.threadId === threadId ? { ...t, isRead: !currentlyRead, isUnread: currentlyRead } : t,
    ));
    setSyncedGlobalUnreadCount((count) => count + delta);
    setActionLoading(`read-${threadId}`);
    setError(null);

    toggleReadViaIframe(formState, threadId, currentlyRead).then((result) => {
      setActionLoading(null);
      if (result.success) {
        setFormState(result.formState);
      } else {
        console.warn('[BetterLectio] Read/unread iframe failed:', result.error);
        if (result.error.kind === 'session_expired') toggleReadNative(threadId, currentlyRead);
        else setError(formatActionError(result.error));
        setRawThreads(prev => prev.map(t =>
          t.threadId === threadId ? { ...t, isRead: currentlyRead, isUnread: !currentlyRead } : t,
        ));
        setSyncedGlobalUnreadCount((count) => count - delta);
      }
    });
  }, [formState, setSyncedGlobalUnreadCount]);

  const handleOpenThread = useCallback((thread: BeskedThread) => {
    if (thread.isUnread) {
      setRawThreads((prev) => prev.map((item) =>
        item.threadId === thread.threadId ? { ...item, isRead: true, isUnread: false } : item,
      ));
      setSyncedGlobalUnreadCount((count) => count - 1);
    }
    openThread(thread.threadId);
  }, [setSyncedGlobalUnreadCount]);

  const handleDelete = useCallback((threadId: string, isDeleted: boolean) => {
    const thread = rawThreads.find((item) => item.threadId === threadId);
    const unreadDelta = thread?.isUnread ? (isDeleted ? 1 : -1) : 0;

    setActionLoading(`delete-${threadId}`);
    setError(null);
    if (unreadDelta !== 0) {
      setSyncedGlobalUnreadCount((count) => count + unreadDelta);
    }

    deleteThreadViaIframe(formState, threadId, isDeleted).then((result) => {
      setActionLoading(null);
      if (result.success) {
        setFormState(result.formState);
        if (isDeleted) {
          // Restored — toggle isDeleted off
          setRawThreads(prev => prev.map(t =>
            t.threadId === threadId ? { ...t, isDeleted: false } : t,
          ));
        } else {
          // Deleted — remove from list
          setRawThreads(prev => prev.filter(t => t.threadId !== threadId));
        }
      } else {
        console.warn('[BetterLectio] Delete iframe failed:', result.error);
        if (result.error.kind === 'session_expired') deleteThreadNative(threadId, isDeleted);
        else setError(formatActionError(result.error));
        if (unreadDelta !== 0) {
          setSyncedGlobalUnreadCount((count) => count - unreadDelta);
        }
      }
    });
  }, [formState, rawThreads, setSyncedGlobalUnreadCount]);

  const handleSearch = (e: Event) => {
    e.preventDefault();
    setActionLoading('search');
    setError(null);

    executeSearchViaIframe(formState, searchQuery).then((result) => {
      setActionLoading(null);
      if (result.success) {
        setFormState(result.formState);
        setRawThreads(result.data.threads);
      } else {
        console.warn('[BetterLectio] Search iframe failed, falling back:', result.error);
        if (result.error.kind === 'session_expired') executeSearchNative(searchQuery);
        else setError(formatActionError(result.error));
      }
    });
  };

  const handleBulkAction = (action: string) => {
    setBulkMenuOpen(false);
    setActionLoading('bulk');
    setError(null);

    executeBulkActionViaIframe(formState, action).then((result) => {
      setActionLoading(null);
      if (result.success) {
        setFormState(result.formState);
        setRawThreads(result.data.threads);
        setSelectedThreads(new Set());
      } else {
        console.warn('[BetterLectio] Bulk action iframe failed:', result.error);
        if (result.error.kind === 'session_expired') executeBulkActionNative(action);
        else setError(formatActionError(result.error));
      }
    });
  };

  const allSelected = threads.length > 0 && selectedThreads.size === threads.length;
  const someSelected = selectedThreads.size > 0;

  return (
    <div className="mx-auto max-w-[960px] space-y-4 px-8 pb-12 pt-10 max-sm:px-4 max-sm:pb-8 max-sm:pt-6">
      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-5 mb-3">
        <div className="inline-flex items-center gap-2">
          <h1 className="text-[2rem] font-[800] tracking-[-0.03em] text-foreground">Beskeder</h1>
          {globalUnreadCount > 0 && (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{globalUnreadCount}</span>
          )}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97]"
          onClick={() => newMessage()}
        >
          <Plus size={16} />
          <span>Ny besked</span>
        </button>
      </div>

      {/* ── Folder navigation ──────────────────── */}
      <FolderNav folders={folders} onSelectFolder={handleSelectFolder} />

      {/* ── Toolbar ────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          {/* Select all */}
          <label className="inline-flex size-8 cursor-pointer items-center justify-center" title="Markér alle">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              className="peer sr-only"
            />
            <span className="inline-flex size-4 items-center justify-center rounded-[4px] border border-border bg-background text-primary-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary">
              {someSelected && !allSelected ? (
                <Minus size={12} className="text-primary" />
              ) : (
                <Check size={12} className={cn('transition-opacity', allSelected ? 'opacity-100' : 'opacity-0')} />
              )}
            </span>
          </label>

          {someSelected && (
            <>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={handleMarkAllRead}
                title="Alle læst"
              >
                <CheckCheck size={15} />
              </button>

              {/* Bulk actions dropdown */}
              <div className="relative" ref={bulkRef}>
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setBulkMenuOpen(!bulkMenuOpen)}
                  title="Flere handlinger"
                >
                  <MoreHorizontal size={15} />
                </button>
                {bulkMenuOpen && (
                  <div className="animate-[beskeder-dropdown-in_0.12s_ease-out] absolute left-0 top-[calc(100%+6px)] z-40 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-[0_4px_16px_oklch(0_0_0/0.08),0_1px_3px_oklch(0_0_0/0.04)]">
                    {data.toolbar.bulkActions.map(action => (
                      <button
                        type="button"
                        key={action.value}
                        className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
                        onClick={() => handleBulkAction(action.value)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Search */}
        <form className="relative min-w-[240px] flex-1" onSubmit={handleSearch}>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            className="peer h-10 w-full rounded-lg border border-border bg-background pl-9 pr-16 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            placeholder="Søg beskeder..."
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-10 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
            >
              <X size={14} />
            </button>
          )}
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground opacity-70 transition-opacity peer-focus:opacity-0">/</kbd>
        </form>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Folder name label ──────────────────── */}
      <div className="mb-1.5 inline-flex items-baseline gap-2">
        <span className="text-sm font-semibold text-foreground">{currentFolderName}</span>
        <span className="text-xs text-muted-foreground">
          {threads.length} {threads.length === 1 ? 'besked' : 'beskeder'}
        </span>
      </div>

      {/* ── Message list ───────────────────────── */}
      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-8 py-16 text-center">
          <Inbox className="mb-4 size-12 text-muted-foreground/40" />
          <p className="text-base font-semibold text-foreground">Ingen beskeder</p>
          <p className="text-sm text-muted-foreground">
            Der er ingen beskeder i denne mappe
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {threads.map((thread, idx) => (
              <ThreadRow
                key={thread.threadId}
                thread={thread}
                isSelected={selectedThreads.has(thread.threadId)}
                onToggleSelect={handleToggleSelect}
                onOpen={handleOpenThread}
                onFlag={handleFlag}
                onRead={handleRead}
                onDelete={handleDelete}
              index={idx}
              schoolId={schoolId}
              nameIdReady={nameIdReady}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { parseBeskederFromDOM };
