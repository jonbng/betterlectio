import { useState, useRef, useEffect, useCallback, useMemo } from 'preact/hooks';
import {
  Search, X, Plus, CheckCheck, Trash2, Flag, FlagOff,
  Mail, MailOpen, Paperclip, ChevronDown, ChevronRight,
  Inbox, Send, Star, Clock, AlertCircle, Users, FolderOpen,
  MoreHorizontal, MailWarning,
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
import { fetchPictureUrl, getCachedPictureUrl, lookupContextCardIdByName, ensureNameIdCache } from '@/lib/findskema-storage';
import { formatRelativeDate, getInitials, nameToHue } from '@/lib/beskeder-helpers';

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

  const pillClass = [
    'il-beskeder-folder-pill',
    folder.isSelected ? 'is-selected' : '',
    isChild ? 'is-child' : '',
    folder.isExpandable ? 'is-expandable' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="il-beskeder-folder-group">
      <button type="button" className={pillClass} onClick={handleClick}>
        {!isChild && getFolderIcon(folder.id)}
        <span className="il-beskeder-folder-name">{folder.name}</span>
        {folder.isExpandable && folder.children.length > 0 && (
          <span className="il-beskeder-folder-chevron">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </button>

      {folder.isExpandable && expanded && folder.children.length > 0 && (
        <div className="il-beskeder-folder-sublist">
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
    <nav className="il-beskeder-folders">
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
        className="il-beskeder-avatar il-beskeder-avatar-img"
        title={displayName}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className="il-beskeder-avatar"
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
  onFlag: (threadId: string) => void;
  onRead: (threadId: string, isRead: boolean) => void;
  onDelete: (threadId: string) => void;
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

function ThreadRow({ thread, isSelected, onToggleSelect, onFlag, onRead, onDelete, index, schoolId, nameIdReady, actionLoading }: ThreadRowProps) {
  const [showActions, setShowActions] = useState(false);
  const isBusy = actionIsLoading(actionLoading, thread.threadId);

  const rowClass = [
    'il-beskeder-row',
    thread.isUnread ? 'is-unread' : '',
    thread.isFlagged ? 'is-flagged' : '',
    isSelected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  const handleOpen = (e: MouseEvent) => {
    // Don't open if clicking on an action button or checkbox
    const target = e.target as HTMLElement;
    if (target.closest('.il-beskeder-row-actions') ||
        target.closest('.il-beskeder-row-check')) return;
    openThread(thread.threadId);
  };

  const handleOpenByKeyboard = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openThread(thread.threadId);
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
    onDelete(thread.threadId);
  };

  const handleCheck = (e: Event) => {
    e.stopPropagation();
    onToggleSelect(thread.threadId);
    toggleThreadCheckbox(thread.ctlIndex, !isSelected);
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
      <label className="il-beskeder-row-check" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheck}
        />
        <span className="il-beskeder-row-checkmark" />
      </label>

      {/* Unread indicator */}
      {thread.isUnread && <div className="il-beskeder-row-dot" />}

      {/* Avatar */}
      <SenderAvatar person={thread.latestSender} schoolId={schoolId} nameIdReady={nameIdReady} />

      {/* Content */}
      <div className="il-beskeder-row-content">
        <div className="il-beskeder-row-top">
          <span className="il-beskeder-row-sender">
            {getPersonLabel(thread.latestSender)}
          </span>
          <span className="il-beskeder-row-date">{dateDisplay}</span>
        </div>
        <div className="il-beskeder-row-middle">
          <span className="il-beskeder-row-subject">{thread.subject}</span>
          {thread.hasAttachment && (
            <Paperclip size={13} className="il-beskeder-row-attachment" />
          )}
          {thread.isFlagged && (
            <Flag size={13} className="il-beskeder-row-flag-icon" />
          )}
        </div>
        <div className="il-beskeder-row-bottom">
          <span className="il-beskeder-row-recipients">
            Til: {getPersonLabel(thread.recipients)}
          </span>
        </div>
      </div>

      {/* Hover actions */}
      <div className={`il-beskeder-row-actions ${showActions ? 'is-visible' : ''}`}>
        <button
          type="button"
          className="il-beskeder-action-btn"
          onClick={handleFlag}
          disabled={isBusy}
          title={thread.isFlagged ? 'Fjern flag' : 'Tilføj flag'}
        >
          {thread.isFlagged ? <FlagOff size={15} /> : <Flag size={15} />}
        </button>
        <button
          type="button"
          className="il-beskeder-action-btn"
          onClick={handleRead}
          disabled={isBusy}
          title={thread.isRead ? 'Marker som ulæst' : 'Marker som læst'}
        >
          {thread.isRead ? <Mail size={15} /> : <MailOpen size={15} />}
        </button>
        <button
          type="button"
          className="il-beskeder-action-btn il-beskeder-action-danger"
          onClick={handleDelete}
          disabled={isBusy}
          title="Slet besked"
        >
          <Trash2 size={15} />
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

  const unreadCount = threads.filter(t => t.isUnread).length;

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
    setActionLoading('markAllRead');
    setError(null);

    markAllReadViaIframe(formState).then((result) => {
      setActionLoading(null);
      if (result.success) {
        setFormState(result.formState);
        setRawThreads(result.data.threads);
      } else {
        console.warn('[BetterLectio] Mark all read iframe failed:', result.error);
        if (result.error.kind === 'session_expired') markAllReadNative();
        else setError(formatActionError(result.error));
      }
    });
  }, [formState]);

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
    // Optimistic update
    setRawThreads(prev => prev.map(t =>
      t.threadId === threadId ? { ...t, isRead: !currentlyRead, isUnread: currentlyRead } : t,
    ));
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
      }
    });
  }, [formState]);

  const handleDelete = useCallback((threadId: string) => {
    setActionLoading(`delete-${threadId}`);
    setError(null);

    deleteThreadViaIframe(formState, threadId).then((result) => {
      setActionLoading(null);
      if (result.success) {
        setFormState(result.formState);
        setRawThreads(prev => prev.filter(t => t.threadId !== threadId));
      } else {
        console.warn('[BetterLectio] Delete iframe failed:', result.error);
        if (result.error.kind === 'session_expired') deleteThreadNative(threadId);
        else setError(formatActionError(result.error));
      }
    });
  }, [formState]);

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
    <div className="il-beskeder-page">
      {/* ── Header ─────────────────────────────── */}
      <div className="il-beskeder-header">
        <div className="il-beskeder-header-left">
          <h1 className="il-beskeder-title">Beskeder</h1>
          {unreadCount > 0 && (
            <span className="il-beskeder-badge">{unreadCount}</span>
          )}
        </div>
        <button
          type="button"
          className="il-beskeder-new-btn"
          onClick={() => newMessage()}
        >
          <Plus size={16} />
          <span>Ny besked</span>
        </button>
      </div>

      {/* ── Folder navigation ──────────────────── */}
      <FolderNav folders={folders} onSelectFolder={handleSelectFolder} />

      {/* ── Toolbar ────────────────────────────── */}
      <div className="il-beskeder-toolbar">
        <div className="il-beskeder-toolbar-left">
          {/* Select all */}
          <label className="il-beskeder-select-all" title="Markér alle">
            <input
              type="checkbox"
              checked={allSelected}
              // @ts-ignore -- indeterminate is valid on input
              indeterminate={someSelected && !allSelected}
              onChange={handleSelectAll}
            />
            <span className="il-beskeder-select-checkmark" />
          </label>

          {someSelected && (
            <>
              <button
                type="button"
                className="il-beskeder-toolbar-btn"
                onClick={handleMarkAllRead}
                title="Alle læst"
              >
                <CheckCheck size={15} />
              </button>

              {/* Bulk actions dropdown */}
              <div className="il-beskeder-bulk-wrap" ref={bulkRef}>
                <button
                  type="button"
                  className="il-beskeder-toolbar-btn"
                  onClick={() => setBulkMenuOpen(!bulkMenuOpen)}
                  title="Flere handlinger"
                >
                  <MoreHorizontal size={15} />
                </button>
                {bulkMenuOpen && (
                  <div className="il-beskeder-bulk-menu">
                    {data.toolbar.bulkActions.map(action => (
                      <button
                        type="button"
                        key={action.value}
                        className="il-beskeder-bulk-item"
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
        <form className="il-beskeder-search" onSubmit={handleSearch}>
          <Search size={15} className="il-beskeder-search-icon" />
          <input
            ref={searchRef}
            type="text"
            className="il-beskeder-search-input"
            placeholder="Søg beskeder..."
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="il-beskeder-search-clear"
              onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
            >
              <X size={14} />
            </button>
          )}
          <kbd className="il-beskeder-search-kbd">/</kbd>
        </form>
      </div>
      {error && <div className="il-beskeder-reply-error">{error}</div>}

      {/* ── Folder name label ──────────────────── */}
      <div className="il-beskeder-folder-label">
        <span className="il-beskeder-folder-label-text">{currentFolderName}</span>
        <span className="il-beskeder-folder-label-count">
          {threads.length} {threads.length === 1 ? 'besked' : 'beskeder'}
        </span>
      </div>

      {/* ── Message list ───────────────────────── */}
      {threads.length === 0 ? (
        <div className="il-beskeder-empty">
          <Inbox className="il-beskeder-empty-icon" />
          <p className="il-beskeder-empty-title">Ingen beskeder</p>
          <p className="il-beskeder-empty-subtitle">
            Der er ingen beskeder i denne mappe
          </p>
        </div>
      ) : (
        <div className="il-beskeder-list">
          {threads.map((thread, idx) => (
            <ThreadRow
              key={thread.threadId}
              thread={thread}
              isSelected={selectedThreads.has(thread.threadId)}
              onToggleSelect={handleToggleSelect}
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
