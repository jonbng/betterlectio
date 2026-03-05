import { useState, useRef, useEffect, useCallback, useMemo } from 'preact/hooks';
import {
  Search, X, Plus, CheckCheck, Trash2, Flag, FlagOff,
  Mail, MailOpen, Paperclip, ChevronDown, ChevronRight,
  Inbox, Send, Star, Clock, AlertCircle, Users, FolderOpen,
  MoreHorizontal, MailWarning,
} from 'lucide-react';
import {
  parseBeskederFromDOM,
  selectFolder,
  openThread,
  toggleFlag,
  toggleRead,
  deleteThread,
  newMessage,
  markAllRead,
  executeSearch,
  executeBulkAction,
  toggleThreadCheckbox,
  type BeskederPageData,
  type BeskedThread,
  type BeskedFolder,
  type PersonRef,
} from '@/lib/beskeder-parser';
import { getTeacherName, loadTeacherNames, type TeacherCache } from '@/lib/teacher-cache';

// ── Helpers ────────────────────────────────────────────────────────────

const DANISH_DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const DANISH_MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'maj', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
];

function formatRelativeDate(dateText: string, date: Date | null): string {
  if (!date) return dateText;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (diffDays === 0) return timeStr;
  if (diffDays === 1) return `I går ${timeStr}`;
  if (diffDays > 1 && diffDays < 7) {
    return `${DANISH_DAYS[date.getDay()].charAt(0).toUpperCase() + DANISH_DAYS[date.getDay()].slice(1)} ${timeStr}`;
  }
  return `${date.getDate()}. ${DANISH_MONTHS[date.getMonth()]} ${date.getFullYear() !== now.getFullYear() ? date.getFullYear() : ''}`.trim();
}

function normalizePersonLabel(value: string): string {
  return value.replace(/\s*\n+\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
}

function getPersonLabel(person: PersonRef): string {
  return normalizePersonLabel(person.fullName || person.name || '');
}

/** Generate initials and a stable hue from a name. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
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
}

function FolderPill({ folder, isChild }: FolderPillProps) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    if (folder.isExpandable && folder.children.length > 0) {
      setExpanded(!expanded);
    } else {
      selectFolder(folder.commandArgument);
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
            <FolderPill key={child.id} folder={child} isChild />
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

function FolderNav({ folders }: { folders: BeskedFolder[] }) {
  const sorted = [...folders].sort((a, b) => {
    const oa = FOLDER_ORDER[a.id] ?? 100;
    const ob = FOLDER_ORDER[b.id] ?? 100;
    return oa - ob;
  });

  return (
    <nav className="il-beskeder-folders">
      {sorted.map(folder => (
        <FolderPill key={folder.id} folder={folder} />
      ))}
    </nav>
  );
}

// ── Sender Avatar ──────────────────────────────────────────────────────

function SenderAvatar({ person }: { person: PersonRef }) {
  const displayName = getPersonLabel(person) || person.name;
  const initials = getInitials(displayName);
  const hue = nameToHue(displayName);

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
  index: number;
}

function ThreadRow({ thread, isSelected, onToggleSelect, index }: ThreadRowProps) {
  const [showActions, setShowActions] = useState(false);

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

  const handleFlag = (e: MouseEvent) => {
    e.stopPropagation();
    toggleFlag(thread.threadId);
  };

  const handleRead = (e: MouseEvent) => {
    e.stopPropagation();
    toggleRead(thread.threadId, thread.isRead);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    deleteThread(thread.threadId);
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
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
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
      <SenderAvatar person={thread.latestSender} />

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
          title={thread.isFlagged ? 'Fjern flag' : 'Tilføj flag'}
        >
          {thread.isFlagged ? <FlagOff size={15} /> : <Flag size={15} />}
        </button>
        <button
          type="button"
          className="il-beskeder-action-btn"
          onClick={handleRead}
          title={thread.isRead ? 'Marker som ulæst' : 'Marker som læst'}
        >
          {thread.isRead ? <Mail size={15} /> : <MailOpen size={15} />}
        </button>
        <button
          type="button"
          className="il-beskeder-action-btn il-beskeder-action-danger"
          onClick={handleDelete}
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
  if (!fullName || fullName === person.name) return person;

  return {
    ...person,
    name: fullName,
    fullName,
  };
}

export function BeskederPage({ data, schoolId }: BeskederPageProps) {
  const [selectedThreads, setSelectedThreads] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState(data.toolbar.searchText);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [teacherCache, setTeacherCache] = useState<TeacherCache | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isCancelled = false;

    loadTeacherNames(schoolId).then((cache) => {
      if (isCancelled || !cache) return;
      setTeacherCache(cache);
    });

    return () => {
      isCancelled = true;
    };
  }, [schoolId]);

  const threads = useMemo(
    () =>
      data.threads.map((thread) => ({
        ...thread,
        latestSender: withResolvedTeacherName(thread.latestSender, teacherCache),
        firstSender: withResolvedTeacherName(thread.firstSender, teacherCache),
        recipients: withResolvedTeacherName(thread.recipients, teacherCache),
      })),
    [data.threads, teacherCache],
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

  const handleSearch = (e: Event) => {
    e.preventDefault();
    executeSearch(searchQuery);
  };

  const handleBulkAction = (action: string) => {
    setBulkMenuOpen(false);
    executeBulkAction(action);
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
      <FolderNav folders={data.folders} />

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
                onClick={() => markAllRead()}
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

      {/* ── Folder name label ──────────────────── */}
      <div className="il-beskeder-folder-label">
        <span className="il-beskeder-folder-label-text">{data.currentFolderName}</span>
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
              index={idx}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { parseBeskederFromDOM };
