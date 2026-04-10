import { useState, useMemo, useRef, useCallback, useEffect } from 'preact/hooks';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Clock,
  Upload,
  Download,
  Pencil,
  Trash2,
  UserMinus,
  BookOpen,
  CalendarDays,
  FolderTree,
  FolderPlus,
  ArrowUpDown,
  Users,
  Loader2,
} from 'lucide-react';
import {
  type DocFolder,
  type DocFile,
  type CurrentFolder,
  type BreadcrumbItem,
  type FileCategory,
  buildBreadcrumbs,
  findFolderById,
  getFileCategory,
  getSubfoldersOfSelected,
  isPreviewable,
} from '@/lib/dokumenter-parser';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';
import {
  triggerDocumentSearch,
  uploadDocumentToFolder,
  createDocumentFolder,
  fetchDocumentDetail,
  saveDocumentEdits,
  deleteDocument,
  removeAffiliation,
  fetchFolderDetail,
  saveFolderEdits,
  deleteFolder,
  type DocumentDetail,
  type DocAffiliation,
  type FolderDetail,
} from '@/lib/dokumenter-actions';
import { useSchoolStudents } from '@/lib/supabase/student-lookup';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── File icon mapping ───────────────────────────────────────────────────

const FILE_ICON_CONFIG: Record<
  FileCategory,
  { icon: typeof File; className: string }
> = {
  document: { icon: FileText, className: 'text-[oklch(0.55_0.15_250)]' },
  spreadsheet: { icon: FileSpreadsheet, className: 'text-[oklch(0.55_0.15_145)]' },
  presentation: { icon: FileText, className: 'text-[oklch(0.55_0.15_40)]' },
  pdf: { icon: FileText, className: 'text-[oklch(0.55_0.15_25)]' },
  image: { icon: FileImage, className: 'text-[oklch(0.55_0.15_300)]' },
  video: { icon: FileVideo, className: 'text-[oklch(0.55_0.15_330)]' },
  audio: { icon: FileAudio, className: 'text-[oklch(0.55_0.15_280)]' },
  archive: { icon: FileArchive, className: 'text-[oklch(0.55_0.12_80)]' },
  code: { icon: FileCode, className: 'text-[oklch(0.55_0.15_180)]' },
  text: { icon: FileText, className: 'text-muted-foreground' },
  other: { icon: File, className: 'text-muted-foreground' },
};

function FileTypeIcon({
  extension,
  size = 18,
}: {
  extension: string;
  size?: number;
}) {
  const category = getFileCategory(extension);
  const config = FILE_ICON_CONFIG[category];
  const Icon = config.icon;
  return <Icon size={size} className={config.className} />;
}

// ── Extension badge ─────────────────────────────────────────────────────

const EXT_BADGE_COLORS: Partial<Record<string, string>> = {
  pdf: 'bg-[oklch(0.92_0.04_25)] text-[oklch(0.45_0.15_25)]',
  doc: 'bg-[oklch(0.92_0.04_250)] text-[oklch(0.45_0.15_250)]',
  docx: 'bg-[oklch(0.92_0.04_250)] text-[oklch(0.45_0.15_250)]',
  xls: 'bg-[oklch(0.92_0.04_145)] text-[oklch(0.45_0.15_145)]',
  xlsx: 'bg-[oklch(0.92_0.04_145)] text-[oklch(0.45_0.15_145)]',
  ppt: 'bg-[oklch(0.92_0.04_40)] text-[oklch(0.45_0.15_40)]',
  pptx: 'bg-[oklch(0.92_0.04_40)] text-[oklch(0.45_0.15_40)]',
  jpg: 'bg-[oklch(0.92_0.04_300)] text-[oklch(0.45_0.15_300)]',
  jpeg: 'bg-[oklch(0.92_0.04_300)] text-[oklch(0.45_0.15_300)]',
  png: 'bg-[oklch(0.92_0.04_300)] text-[oklch(0.45_0.15_300)]',
  gif: 'bg-[oklch(0.92_0.04_300)] text-[oklch(0.45_0.15_300)]',
  zip: 'bg-[oklch(0.92_0.04_80)] text-[oklch(0.45_0.12_80)]',
};

function ExtBadge({ ext }: { ext: string }) {
  if (!ext) return null;
  const colors =
    EXT_BADGE_COLORS[ext] ?? 'bg-muted text-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        colors,
      )}
    >
      {ext}
    </span>
  );
}

// ── Folder tree item ────────────────────────────────────────────────────

function FolderTreeItem({
  folder,
  selectedId,
  schoolId,
  expandedIds,
  onToggle,
  possessivePersonalLabel,
}: {
  folder: DocFolder;
  selectedId: string | null;
  schoolId: string;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  /** When viewing another student's documents, replaces "Egne dokumenter" */
  possessivePersonalLabel: string | null;
}) {
  const isSelected = folder.id === selectedId;
  const isExpanded = expandedIds.has(folder.id);
  const hasChildren = folder.children.length > 0;

  const treeLabel =
    possessivePersonalLabel && folder.icon === 'personal'
      ? possessivePersonalLabel
      : folder.icon === 'hold' && folder.holdCode
        ? getHoldDisplayName(folder.holdCode)
        : folder.name;

  // Hold color dot
  let holdHue: number | null = null;
  if (folder.icon === 'hold' && folder.holdCode) {
    holdHue = getHoldHue(folder.holdCode);
  }

  const folderUrl = `${window.location.pathname}?elevid=${new URL(window.location.href).searchParams.get('elevid') ?? ''}&folderid=${folder.id}`;

  const handleClick = (e: Event) => {
    e.preventDefault();
    // Navigate to this folder
    const url = new URL(window.location.href);
    url.searchParams.set('folderid', folder.id);
    window.location.href = url.toString();
  };

  const handleToggle = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle(folder.id);
  };

  const iconElement = (() => {
    switch (folder.icon) {
      case 'recent':
        return <Clock size={16} className="text-[oklch(0.6_0.15_50)]" />;
      case 'personal':
        return <FolderOpen size={16} className="text-[oklch(0.6_0.15_265)]" />;
      case 'hold':
        return holdHue != null ? (
          <div
            className="size-3.5 rounded-full shrink-0"
            style={{ backgroundColor: `oklch(0.65 0.15 ${holdHue})` }}
          />
        ) : (
          <BookOpen size={16} className="text-muted-foreground" />
        );
      case 'activity':
        return <CalendarDays size={16} className="text-muted-foreground" />;
      case 'materials':
        return <BookOpen size={16} className="text-muted-foreground" />;
      case 'group':
        return <Users size={16} className="text-muted-foreground" />;
      default:
        return <Folder size={16} className="text-muted-foreground" />;
    }
  })();

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-[color,background-color] duration-150',
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-foreground/80 hover:bg-muted',
        )}
        style={{ paddingLeft: `${8 + folder.depth * 16}px` }}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="shrink-0 p-0.5 rounded hover:bg-muted-foreground/10 transition-[color,background-color] duration-150"
          >
            {isExpanded ? (
              <ChevronDown size={15} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={15} className="text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-[18px] shrink-0" />
        )}

        {/* Folder icon */}
        <span className="shrink-0 flex items-center">{iconElement}</span>

        {/* Folder name */}
        <a
          href={folderUrl}
          onClick={handleClick}
          className="truncate min-w-0 flex-1"
          title={folder.comment || treeLabel}
        >
          {treeLabel}
        </a>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="animate-in slide-in-from-top-1 duration-150">
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              selectedId={selectedId}
              schoolId={schoolId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              possessivePersonalLabel={possessivePersonalLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Breadcrumbs ─────────────────────────────────────────────────────────

function Breadcrumbs({
  items,
  resolveLabel,
}: {
  items: BreadcrumbItem[];
  resolveLabel?: (item: BreadcrumbItem) => string;
}) {
  if (items.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const label = resolveLabel ? resolveLabel(item) : item.label;
        return (
          <span key={item.folderId} className="flex items-center gap-1 min-w-0">
            {i > 0 && (
              <ChevronRight size={12} className="shrink-0 text-muted-foreground/50" />
            )}
            {isLast ? (
              <span className="truncate font-medium text-foreground">
                {label}
              </span>
            ) : (
              <a
                href={`${window.location.pathname}?elevid=${new URL(window.location.href).searchParams.get('elevid') ?? ''}&folderid=${item.folderId}`}
                className="truncate hover:text-foreground transition-[color,background-color] duration-150"
                onClick={(e) => {
                  e.preventDefault();
                  const url = new URL(window.location.href);
                  url.searchParams.set('folderid', item.folderId);
                  window.location.href = url.toString();
                }}
              >
                {label}
              </a>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// ── File row ────────────────────────────────────────────────────────────

function FileRow({
  file,
  schoolId,
}: {
  file: DocFile;
  schoolId: string;
}) {
  const canPreview = isPreviewable(file.extension);

  const handleFileClick = (e: Event) => {
    if (canPreview) {
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent('bl-doc-preview', { detail: { file } }),
      );
    }
    // else: default link behavior (download)
  };

  return (
    <div className="group flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-[color,background-color] duration-150 border border-transparent hover:border-border/50">
      {/* File icon */}
      <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-muted/60">
        <FileTypeIcon extension={file.extension} size={22} />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <a
            href={file.downloadUrl}
            target={canPreview ? undefined : '_blank'}
            rel={canPreview ? undefined : 'noopener'}
            onClick={handleFileClick}
            className={cn(
              'truncate text-sm font-medium text-foreground hover:text-primary transition-[color,background-color] duration-150',
              canPreview && 'cursor-pointer',
            )}
            title={file.name}
          >
            {file.name}
          </a>
          <ExtBadge ext={file.extension} />
        </div>
        {file.comment && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {file.comment}
          </p>
        )}
      </div>

      {/* Changed by */}
      <div className="hidden md:flex items-center gap-1.5 shrink-0 min-w-[110px]">
        {file.changedBy && (
          <>
            <div
              className={cn(
                'size-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                file.changedBy.isTeacher
                  ? 'bg-[oklch(0.55_0.12_265)]'
                  : 'bg-[oklch(0.6_0.1_145)]',
              )}
            >
              {file.changedBy.initials.slice(0, 2).toUpperCase()}
            </div>
            <span
              className="text-xs text-muted-foreground truncate"
              title={file.changedBy.name}
            >
              {file.changedBy.initials}
            </span>
          </>
        )}
      </div>

      {/* Date */}
      <span className="hidden sm:block text-xs text-muted-foreground shrink-0 w-[75px] text-right tabular-nums">
        {file.date}
      </span>

      {/* Size */}
      <span className="hidden lg:block text-xs text-muted-foreground shrink-0 w-[75px] text-right tabular-nums">
        {file.size}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={file.downloadUrl}
          target="_blank"
          rel="noopener"
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150"
          title="Download"
        >
          <Download size={15} />
        </a>
        {file.editUrl && (
          <button
            onClick={(e) => {
              e.preventDefault();
              window.dispatchEvent(
                new CustomEvent('bl-doc-edit', { detail: { file } }),
              );
            }}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150"
            title="Rediger"
          >
            <Pencil size={15} />
          </button>
        )}
        {file.editUrl && (
          <DeleteFileButton file={file} />
        )}
      </div>
    </div>
  );
}

// ── Inline delete button with confirmation ──────────────────────────────

function DeleteFileButton({ file }: { file: DocFile }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const success = await deleteDocument(file.editUrl);
    if (success) {
      toast.success(`${file.name} slettet`);
      window.location.reload();
    } else {
      toast.error('Kunne ikke slette dokument');
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1 h-6 px-2 rounded bg-destructive text-white text-xs font-medium hover:bg-destructive/90 transition-[color,background-color] duration-150 disabled:opacity-60"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          {deleting ? 'Sletter' : 'Slet'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="h-6 px-1.5 rounded text-xs text-muted-foreground hover:bg-muted transition-[color,background-color] duration-150"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setConfirming(true);
      }}
      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-[color,background-color] duration-150"
      title="Slet"
    >
      <Trash2 size={15} />
    </button>
  );
}

// ── Subfolder row in file list ──────────────────────────────────────────

function SubfolderRow({
  folder,
  onEdit,
}: {
  folder: DocFolder;
  onEdit?: (folderId: string, name: string) => void;
}) {
  const holdHue =
    folder.icon === 'hold' && folder.holdCode
      ? getHoldHue(folder.holdCode)
      : null;

  const handleClick = (e: Event) => {
    e.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('folderid', folder.id);
    window.location.href = url.toString();
  };

  // Only personal subfolders (starting with S or _FS) can be edited
  const canEdit = onEdit && (folder.id.startsWith('S') || folder.id.includes('_FS'));
  const displayName = folder.icon === 'hold' && folder.holdCode
    ? getHoldDisplayName(folder.holdCode)
    : folder.name;

  return (
    <div className="group flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-[color,background-color] duration-150 border border-transparent hover:border-border/50">
      <a
        href={`${window.location.pathname}?folderid=${folder.id}`}
        onClick={handleClick}
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
      >
        <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-muted/60">
          {holdHue != null ? (
            <div
              className="size-4 rounded-full"
              style={{ backgroundColor: `oklch(0.65 0.15 ${holdHue})` }}
            />
          ) : (
            <Folder size={22} className="text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-[color,background-color] duration-150 truncate block">
            {displayName}
          </span>
          {folder.comment && folder.comment !== folder.name && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {folder.comment}
            </p>
          )}
        </div>
      </a>
      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(folder.id, displayName);
            }}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150"
            title="Rediger mappe"
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
      <a
        href={`${window.location.pathname}?folderid=${folder.id}`}
        onClick={handleClick}
        className="shrink-0"
      >
        <ChevronRight size={16} className="text-muted-foreground/50" />
      </a>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────

function EmptyState({ folderName }: { folderName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
        <FolderOpen size={28} className="text-muted-foreground/60" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        Ingen dokumenter
      </h3>
      <p className="text-xs text-muted-foreground max-w-[240px]">
        Der er ingen dokumenter i &ldquo;{folderName}&rdquo; endnu.
      </p>
    </div>
  );
}

// ── Preview dialog ──────────────────────────────────────────────────────

// ── PDF preview (fetches blob to bypass Content-Disposition: attachment) ─

function PdfPreview({ url, title }: { url: string; title: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch PDF');
        return r.blob();
      })
      .then((blob) => {
        if (revoked) return;
        const objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => setError(true));

    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-8">
        <FileText size={48} className="text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Kunne ikke indlæse PDF</p>
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-[color,background-color] duration-150"
        >
          <Download size={14} />
          Download i stedet
        </a>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      className="w-full h-full rounded-lg border"
      title={title}
    />
  );
}

function PreviewOverlay({
  file,
  schoolId,
  onClose,
}: {
  file: DocFile;
  schoolId: string;
  onClose: () => void;
}) {
  const category = getFileCategory(file.extension);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!file.editUrl) return;
    setDeleting(true);
    const success = await deleteDocument(file.editUrl);
    if (success) {
      toast.success(`${file.name} slettet`);
      window.location.reload();
    } else {
      toast.error('Kunne ikke slette dokument');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-background rounded-xl shadow-2xl border w-[95vw] max-w-[1200px] h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <FileTypeIcon extension={file.extension} size={18} />
            <span className="text-sm font-medium truncate">{file.name}</span>
            <ExtBadge ext={file.extension} />
          </div>
          <div className="flex items-center gap-1">
            {file.editUrl && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-[color,background-color] duration-150"
                title="Slet"
              >
                <Trash2 size={16} />
              </button>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-destructive text-white text-xs font-medium hover:bg-destructive/90 transition-[color,background-color] duration-150 disabled:opacity-60"
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  {deleting ? 'Sletter...' : 'Slet'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-[color,background-color] duration-150"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <a
              href={file.downloadUrl}
              target="_blank"
              rel="noopener"
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150"
              title="Download"
            >
              <Download size={16} />
            </a>
            {file.editUrl && (
              <button
                onClick={() => {
                  onClose();
                  window.dispatchEvent(
                    new CustomEvent('bl-doc-edit', { detail: { file } }),
                  );
                }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150"
                title="Rediger"
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-0">
          {category === 'image' ? (
            <img
              src={file.downloadUrl}
              alt={file.name}
              className="max-w-full max-h-[75vh] object-contain rounded-lg"
            />
          ) : category === 'pdf' ? (
            <PdfPreview url={file.downloadUrl} title={file.name} />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center py-8">
              <FileTypeIcon extension={file.extension} size={48} />
              <p className="text-sm text-muted-foreground">
                Forhåndsvisning er ikke tilgængelig for denne filtype.
              </p>
              <a
                href={file.downloadUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-[color,background-color] duration-150"
              >
                <Download size={14} />
                Download fil
              </a>
            </div>
          )}
        </div>

        {/* Footer metadata */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t text-xs text-muted-foreground">
          {file.size && <span>{file.size}</span>}
          {file.date && <span>{file.date}</span>}
          {file.changedBy && (
            <span>Ændret af {file.changedBy.name || file.changedBy.initials}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Affiliation row in edit modal ────────────────────────────────────────

function AffiliationRow({
  affiliation,
  detail,
  onRemoved,
}: {
  affiliation: DocAffiliation;
  detail: DocumentDetail;
  onRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    const success = await removeAffiliation(detail, affiliation.rowIndex);
    if (success) {
      onRemoved();
    } else {
      toast.error('Kunne ikke fjerne deling');
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40 text-xs">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground truncate block">
          {affiliation.name}
        </span>
        <span className="text-muted-foreground">
          {affiliation.canEdit ? 'Kan redigere' : 'Kun læse'}
          {affiliation.folder !== '\\' && ` · ${affiliation.folder}`}
        </span>
      </div>
      <button
        onClick={handleRemove}
        disabled={removing}
        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-[color,background-color] duration-150 shrink-0 disabled:opacity-50"
        title="Fjern deling"
      >
        {removing ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <UserMinus size={13} />
        )}
      </button>
    </div>
  );
}

// ── Document edit modal ──────────────────────────────────────────────────

function EditDocumentModal({
  file,
  schoolId,
  onClose,
  onSaved,
  onDeleted,
}: {
  file: DocFile;
  schoolId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Clean up iframe when modal closes
  useEffect(() => {
    return () => {
      if (detail?._iframe) {
        detail._iframe.remove();
      }
    };
  }, [detail]);

  useEffect(() => {
    if (!file.editUrl) {
      setLoading(false);
      return;
    }
    fetchDocumentDetail(file.editUrl).then((d) => {
      setDetail(d);
      if (d) {
        setComment(d.comment);
        setIsPublic(d.isPublic);
      }
      setLoading(false);
    });
  }, [file.editUrl]);

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    const success = await saveDocumentEdits(detail, comment, isPublic);
    if (success) {
      toast.success('Dokument gemt');
      onSaved();
    } else {
      toast.error('Kunne ikke gemme');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!file.editUrl) return;
    setDeleting(true);
    const success = await deleteDocument(file.editUrl);
    if (success) {
      toast.success('Dokument slettet');
      onDeleted();
    } else {
      toast.error('Kunne ikke slette dokument');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-2xl border w-full max-w-[480px] mx-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <FileTypeIcon extension={file.extension} size={20} />
            <h2 className="text-sm font-semibold truncate">{file.name}</h2>
            <ExtBadge ext={file.extension} />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <>
              {/* File info */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {detail.size && (
                  <div>
                    <span className="text-muted-foreground">Størrelse</span>
                    <p className="font-medium">{detail.size}</p>
                  </div>
                )}
                {detail.createdBy && (
                  <div>
                    <span className="text-muted-foreground">Oprettet af</span>
                    <p className="font-medium">{detail.createdBy}</p>
                  </div>
                )}
                {detail.changedBy && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Ændret</span>
                    <p className="font-medium">{detail.changedBy}</p>
                  </div>
                )}
              </div>

              {/* Comment */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Kommentar
                </label>
                <textarea
                  value={comment}
                  onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Tilføj kommentar..."
                  className="w-full px-3 py-2 rounded-lg border border-border/60 bg-muted/30 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 resize-none transition-[color,background-color] duration-150"
                />
              </div>

              {/* Public checkbox */}
              <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <span
                  className={cn(
                    'flex items-center justify-center size-[18px] rounded border-2 transition-[color,background-color] duration-150 shrink-0 pointer-events-none',
                    isPublic
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/40 bg-transparent',
                  )}
                >
                  {isPublic && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className="text-foreground">Offentlig</span>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic((e.target as HTMLInputElement).checked)}
                  className="sr-only"
                />
              </label>

              {/* Affiliations / Deling */}
              {detail.affiliations.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                    Delt med
                  </label>
                  <div className="space-y-1">
                    {detail.affiliations.map((aff) => (
                      <AffiliationRow
                        key={`${aff.name}-${aff.rowIndex}`}
                        affiliation={aff}
                        detail={detail}
                        onRemoved={() => {
                          // Refresh — remove from local state
                          setDetail((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              affiliations: prev.affiliations.filter(
                                (a) => a.rowIndex !== aff.rowIndex,
                              ),
                            };
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Kunne ikke hente dokumentdetaljer.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t">
          <div>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-[color,background-color] duration-150"
              >
                <Trash2 size={14} />
                Slet
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-destructive text-white text-xs font-medium hover:bg-destructive/90 transition-[color,background-color] duration-150 disabled:opacity-60"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {deleting ? 'Sletter...' : 'Bekræft slet'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-[color,background-color] duration-150"
                >
                  Annuller
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={file.downloadUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 text-xs font-medium hover:bg-muted transition-[color,background-color] duration-150"
            >
              <Download size={14} />
              Download
            </a>
            {detail && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-[color,background-color] duration-150 disabled:opacity-60"
              >
                {saving ? 'Gemmer...' : 'Gem'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Folder edit modal ────────────────────────────────────────────────────

function EditFolderModal({
  folderId,
  folderDisplayName,
  schoolId,
  onClose,
  onSaved,
  onDeleted,
}: {
  folderId: string;
  folderDisplayName: string;
  schoolId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [detail, setDetail] = useState<FolderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    return () => {
      if (detail?._iframe) detail._iframe.remove();
    };
  }, [detail]);

  useEffect(() => {
    fetchFolderDetail(folderId, schoolId).then((d) => {
      setDetail(d);
      if (d) {
        setName(d.name);
        setComment(d.comment);
        setIsPublic(d.isPublic);
      }
      setLoading(false);
    });
  }, [folderId, schoolId]);

  const handleSave = async () => {
    if (!detail || !name.trim()) return;
    setSaving(true);
    const success = await saveFolderEdits(detail, name.trim(), comment, isPublic);
    if (success) {
      toast.success('Mappe gemt');
      onSaved();
    } else {
      toast.error('Kunne ikke gemme mappe');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    setDeleting(true);
    const success = await deleteFolder(detail);
    if (success) {
      toast.success('Mappe slettet');
      onDeleted();
    } else {
      toast.error('Kunne ikke slette mappe');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-2xl border w-full max-w-[420px] mx-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <Folder size={18} className="text-muted-foreground shrink-0" />
            <h2 className="text-sm font-semibold truncate">Rediger mappe</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Mappenavn
                </label>
                <input
                  type="text"
                  value={name}
                  onInput={(e) => setName((e.target as HTMLInputElement).value)}
                  maxLength={50}
                  className="w-full h-9 px-3 rounded-lg border border-border/60 bg-muted/30 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-[color,background-color] duration-150"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Kommentar
                </label>
                <textarea
                  value={comment}
                  onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
                  rows={2}
                  placeholder="Valgfrit..."
                  className="w-full px-3 py-2 rounded-lg border border-border/60 bg-muted/30 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 resize-none transition-[color,background-color] duration-150"
                />
              </div>

              <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <span
                  className={cn(
                    'flex items-center justify-center size-[18px] rounded border-2 transition-[color,background-color] duration-150 shrink-0 pointer-events-none',
                    isPublic
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/40 bg-transparent',
                  )}
                >
                  {isPublic && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className="text-foreground">Offentlig</span>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic((e.target as HTMLInputElement).checked)}
                  className="sr-only"
                />
              </label>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Kunne ikke hente mappedetaljer.
            </p>
          )}
        </div>

        {/* Footer */}
        {detail && (
          <div className="flex items-center justify-between px-5 py-3 border-t">
            <div>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-[color,background-color] duration-150"
                >
                  <Trash2 size={14} />
                  Slet mappe
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-destructive text-white text-xs font-medium hover:bg-destructive/90 transition-[color,background-color] duration-150 disabled:opacity-60"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {deleting ? 'Sletter...' : 'Bekræft slet'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-[color,background-color] duration-150"
                  >
                    Annuller
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-[color,background-color] duration-150 disabled:opacity-60"
            >
              {saving ? 'Gemmer...' : 'Gem'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sort header ─────────────────────────────────────────────────────────

type SortColumn = 'Name' | 'Comments' | 'ChangedBy' | 'UploadedDate' | 'Bytes';

function SortHeader({
  label,
  column,
  className,
}: {
  label: string;
  column: SortColumn;
  className?: string;
}) {
  const handleSort = () => {
    // Trigger sort via ASP.NET postback
    const target = `s$m$Content$Content$DocumentGridView`;
    const arg = `Sort$${column}`;
    // Use Lectio's native __doPostBack
    if (typeof (window as any).__doPostBack === 'function') {
      (window as any).__doPostBack(target, arg);
    }
  };

  return (
    <button
      onClick={handleSort}
      className={cn(
        'flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150 font-medium',
        className,
      )}
    >
      {label}
      <ArrowUpDown size={10} />
    </button>
  );
}

// ── Drop zone overlay ───────────────────────────────────────────────────

function DropZone({
  folderId,
  schoolId,
  onUploadComplete,
}: {
  folderId: string;
  schoolId: string;
  onUploadComplete: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      setIsUploading(true);
      setUploadFileName(file.name);

      const success = await uploadDocumentToFolder(file, folderId, schoolId);
      if (success) {
        toast.success(`${file.name} uploadet`);
        window.location.reload();
      } else {
        toast.error('Upload fejlede');
        setIsUploading(false);
        setUploadFileName('');
      }
    },
    [folderId, schoolId],
  );

  useEffect(() => {
    const el = document.getElementById('il-dokumenter-page');
    if (!el) return;

    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);

    return () => {
      el.removeEventListener('dragenter', handleDragEnter);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  if (isUploading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-background border shadow-lg">
          <Loader2 size={24} className="animate-spin text-primary" />
          <p className="text-sm font-medium">Uploader {uploadFileName}...</p>
        </div>
      </div>
    );
  }

  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-primary/5 backdrop-blur-[2px] border-2 border-dashed border-primary/40 rounded-xl m-2 pointer-events-none">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Upload size={24} className="text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">
          Slip filen her for at uploade
        </p>
        <p className="text-xs text-muted-foreground">
          Filen vil blive uploadet til den aktuelle mappe
        </p>
      </div>
    </div>
  );
}

// ── Main page component ─────────────────────────────────────────────────

export function DokumenterPage({
  folders,
  files,
  currentFolder,
  selectedFolderId,
  schoolId,
  hasCheckboxes,
  viewedStudentElevid,
  viewedStudentNameHint,
}: {
  folders: DocFolder[];
  files: DocFile[];
  currentFolder: CurrentFolder;
  selectedFolderId: string | null;
  schoolId: string;
  hasCheckboxes: boolean;
  /** Set when URL `elevid` is another student (not logged-in user) */
  viewedStudentElevid?: string | null;
  /** From `extractViewedEntity()` page title; Supabase name preferred when loaded */
  viewedStudentNameHint?: string | null;
}) {
  const { studentsMap } = useSchoolStudents(schoolId);

  const viewedDisplayName =
    (viewedStudentElevid && studentsMap?.get(viewedStudentElevid)?.name) ??
    viewedStudentNameHint ??
    null;

  const possessivePersonalLabel =
    viewedStudentElevid != null && viewedStudentElevid !== ''
      ? viewedDisplayName
        ? `${viewedDisplayName}s dokumenter`
        : 'Elevens dokumenter'
      : null;

  const sidebarFolders = useMemo(() => {
    if (!viewedStudentElevid) return folders;
    return folders.filter((f) => f.icon !== 'recent');
  }, [folders, viewedStudentElevid]);

  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<DocFile | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderComment, setFolderComment] = useState('');
  const [editFile, setEditFile] = useState<DocFile | null>(null);
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Build initial expanded IDs — expand the path to the selected folder
  const initialExpanded = useMemo(() => {
    const ids = new Set<string>();

    function walk(nodes: DocFolder[]): boolean {
      for (const node of nodes) {
        if (node.id === selectedFolderId) {
          ids.add(node.id);
          return true;
        }
        if (node.children.length > 0) {
          ids.add(node.id);
          if (walk(node.children)) return true;
          ids.delete(node.id);
        }
      }
      return false;
    }

    walk(folders);
    // Also expand top-level nodes
    for (const f of folders) {
      if (f.children.length > 0) ids.add(f.id);
    }
    return ids;
  }, [folders, selectedFolderId]);

  const [expandedIds, setExpandedIds] = useState(initialExpanded);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Breadcrumbs
  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(folders, selectedFolderId),
    [folders, selectedFolderId],
  );

  const resolveBreadcrumbLabel = useCallback(
    (item: BreadcrumbItem) => {
      if (!possessivePersonalLabel) return item.label;
      const node = findFolderById(folders, item.folderId);
      if (node?.icon === 'personal') return possessivePersonalLabel;
      return item.label;
    },
    [folders, possessivePersonalLabel],
  );

  const emptyStateFolderName = useMemo(() => {
    if (!possessivePersonalLabel || !selectedFolderId) return currentFolder.label;
    const node = findFolderById(folders, selectedFolderId);
    if (node?.icon === 'personal') return possessivePersonalLabel;
    return currentFolder.label;
  }, [currentFolder.label, folders, possessivePersonalLabel, selectedFolderId]);

  // Subfolders of the current folder (to show in file list)
  const subfolders = useMemo(
    () => getSubfoldersOfSelected(folders, selectedFolderId),
    [folders, selectedFolderId],
  );

  // Filtered files (client-side instant filter)
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase().trim();
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.comment.toLowerCase().includes(q) ||
        f.extension.includes(q) ||
        (f.changedBy?.name.toLowerCase().includes(q) ?? false) ||
        (f.changedBy?.initials.toLowerCase().includes(q) ?? false),
    );
  }, [files, searchQuery]);

  // Filtered subfolders (only show matching ones during search)
  const filteredSubfolders = useMemo(() => {
    if (!searchQuery.trim()) return subfolders;
    const q = searchQuery.toLowerCase().trim();
    return subfolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [subfolders, searchQuery]);

  // Listen for preview events from FileRow
  const handlePreviewEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.file) setPreviewFile(detail.file);
  }, []);

  const handleEditEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.file) setEditFile(detail.file);
  }, []);

  // Register/cleanup event listeners
  useEffect(() => {
    window.addEventListener('bl-doc-preview', handlePreviewEvent);
    window.addEventListener('bl-doc-edit', handleEditEvent);
    return () => {
      window.removeEventListener('bl-doc-preview', handlePreviewEvent);
      window.removeEventListener('bl-doc-edit', handleEditEvent);
    };
  }, [handlePreviewEvent, handleEditEvent]);

  // Keyboard shortcut: Escape to close preview, Cmd+K to focus search
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewFile) {
        setPreviewFile(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    },
    [previewFile],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Debounced Lectio server search — fires automatically after typing stops
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleServerSearch = useCallback(
    (query: string) => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!query.trim()) return;
      searchTimerRef.current = setTimeout(() => {
        triggerDocumentSearch(query);
      }, 600);
    },
    [],
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // File upload via native file picker
  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!currentFolder.folderId) return;
      setIsUploading(true);
      const success = await uploadDocumentToFolder(
        file,
        currentFolder.folderId,
        schoolId,
        (status) => {
          if (status === 'error') {
            toast.error('Upload fejlede');
            setIsUploading(false);
          }
        },
      );
      if (success) {
        toast.success(`${file.name} uploadet`);
        window.location.reload();
      } else {
        setIsUploading(false);
      }
    },
    [currentFolder.folderId, schoolId],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file) {
        handleFileUpload(file);
        input.value = ''; // Reset so same file can be selected again
      }
    },
    [handleFileUpload],
  );

  // Folder creation
  const handleCreateFolder = useCallback(async () => {
    if (!folderName.trim() || !currentFolder.folderId) return;
    setIsCreatingFolder(true);
    const success = await createDocumentFolder(
      folderName.trim(),
      currentFolder.folderId,
      schoolId,
      folderComment.trim() || undefined,
    );
    if (success) {
      toast.success(`Mappe "${folderName.trim()}" oprettet`);
      window.location.reload();
    } else {
      toast.error('Kunne ikke oprette mappe');
      setIsCreatingFolder(false);
    }
  }, [folderName, folderComment, currentFolder.folderId, schoolId]);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150"
          title={sidebarCollapsed ? 'Vis mapper' : 'Skjul mapper'}
        >
          <FolderTree size={16} />
        </button>

        {/* Breadcrumbs */}
        <div className="flex-1 min-w-0">
          <Breadcrumbs
            items={breadcrumbs}
            resolveLabel={possessivePersonalLabel ? resolveBreadcrumbLabel : undefined}
          />
        </div>

        {/* Search */}
        <div className="relative w-[260px]">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            ref={searchRef}
            type="text"
            placeholder="Søg dokumenter..."
            value={searchQuery}
            onInput={(e) => {
              const val = (e.target as HTMLInputElement).value;
              setSearchQuery(val);
              scheduleServerSearch(val);
            }}
            className="w-full h-9 pl-8 pr-8 rounded-lg border border-border/60 bg-muted/30 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-[color,background-color] duration-150"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Folder & file action buttons */}
        {hasCheckboxes && (
          <div className="flex items-center gap-1.5 relative">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileInputChange}
            />

            {/* New folder button */}
            <button
              onClick={() => setShowFolderDialog(!showFolderDialog)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/60 text-sm font-medium text-foreground hover:bg-muted transition-[color,background-color] duration-150"
              title="Opret ny mappe"
            >
              <FolderPlus size={15} />
              <span className="hidden lg:inline">Ny mappe</span>
            </button>

            {/* Upload button */}
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-[color,background-color] duration-150 disabled:opacity-60"
            >
              {isUploading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Upload size={15} />
              )}
              {isUploading ? 'Uploader...' : 'Upload'}
            </button>

            {/* Folder creation popover */}
            {showFolderDialog && (
              <div className="absolute top-full right-0 mt-2 w-[300px] p-3 rounded-xl bg-background border shadow-lg z-20 animate-in fade-in slide-in-from-top-2 duration-150">
                <p className="text-sm font-medium mb-2">Ny mappe</p>
                <input
                  type="text"
                  placeholder="Mappenavn..."
                  value={folderName}
                  onInput={(e) =>
                    setFolderName((e.target as HTMLInputElement).value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && folderName.trim()) {
                      e.preventDefault();
                      handleCreateFolder();
                    }
                    if (e.key === 'Escape') {
                      setShowFolderDialog(false);
                      setFolderName('');
                      setFolderComment('');
                    }
                  }}
                  autoFocus
                  className="w-full h-9 px-3 rounded-lg border border-border/60 bg-muted/30 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-[color,background-color] duration-150 mb-2"
                />
                <textarea
                  placeholder="Kommentar (valgfrit)..."
                  value={folderComment}
                  onInput={(e) =>
                    setFolderComment((e.target as HTMLTextAreaElement).value)
                  }
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-border/60 bg-muted/30 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 resize-none transition-[color,background-color] duration-150 mb-2"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowFolderDialog(false);
                      setFolderName('');
                      setFolderComment('');
                    }}
                    className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-[color,background-color] duration-150"
                  >
                    Annuller
                  </button>
                  <button
                    onClick={handleCreateFolder}
                    disabled={!folderName.trim() || isCreatingFolder}
                    className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-[color,background-color] duration-150 disabled:opacity-60"
                  >
                    {isCreatingFolder ? 'Opretter...' : 'Opret'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Folder tree sidebar */}
        {!sidebarCollapsed && (
          <aside className="w-[260px] shrink-0 border-r border-border/50 overflow-y-auto py-2 px-2">
            {sidebarFolders.map((folder) => (
              <FolderTreeItem
                key={folder.id}
                folder={folder}
                selectedId={selectedFolderId}
                schoolId={schoolId}
                expandedIds={expandedIds}
                onToggle={handleToggle}
                possessivePersonalLabel={possessivePersonalLabel}
              />
            ))}
          </aside>
        )}

        {/* File list */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {(filteredSubfolders.length > 0 || filteredFiles.length > 0) ? (
            <div className="px-3 py-2">
              {/* Column headers */}
              <div className="flex items-center gap-3 px-3 py-1.5 mb-1">
                <div className="w-10 shrink-0" />
                <div className="flex-1 min-w-0">
                  <SortHeader label="Navn" column="Name" />
                </div>
                <div className="hidden md:block min-w-[110px]">
                  <SortHeader label="Ændret af" column="ChangedBy" />
                </div>
                <div className="hidden sm:block w-[75px] text-right">
                  <SortHeader
                    label="Dato"
                    column="UploadedDate"
                    className="justify-end"
                  />
                </div>
                <div className="hidden lg:block w-[75px] text-right">
                  <SortHeader
                    label="Størrelse"
                    column="Bytes"
                    className="justify-end"
                  />
                </div>
                {/* Space for action buttons */}
                <div className="w-[76px] shrink-0" />
              </div>

              {/* Subfolder rows */}
              {filteredSubfolders.map((folder) => (
                <SubfolderRow
                  key={folder.id}
                  folder={folder}
                  onEdit={(id, name) => {
                    setEditFolderId(id);
                    setEditFolderName(name);
                  }}
                />
              ))}

              {/* File rows */}
              {filteredFiles.map((file) => (
                <FileRow key={file.id} file={file} schoolId={schoolId} />
              ))}

              {/* File count */}
              <div className="px-3 py-3 text-xs text-muted-foreground">
                {filteredSubfolders.length > 0 && (
                  <span>{filteredSubfolders.length} {filteredSubfolders.length === 1 ? 'mappe' : 'mapper'}, </span>
                )}
                {filteredFiles.length === files.length
                  ? `${files.length} ${files.length === 1 ? 'dokument' : 'dokumenter'}`
                  : `${filteredFiles.length} af ${files.length} dokumenter`}
              </div>
            </div>
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search size={28} className="text-muted-foreground/40 mb-3" />
              <h3 className="text-sm font-medium text-foreground mb-1">
                Ingen resultater
              </h3>
              <p className="text-xs text-muted-foreground">
                Ingen filer matcher &ldquo;{searchQuery}&rdquo;
              </p>
            </div>
          ) : (
            <EmptyState folderName={emptyStateFolderName} />
          )}
        </main>
      </div>

      {/* Drag & drop upload zone */}
      {hasCheckboxes && (
        <DropZone
          folderId={currentFolder.folderId}
          schoolId={schoolId}
          onUploadComplete={() => {}}
        />
      )}

      {/* Preview overlay */}
      {previewFile && (
        <PreviewOverlay
          file={previewFile}
          schoolId={schoolId}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Edit document modal */}
      {editFile && (
        <EditDocumentModal
          file={editFile}
          schoolId={schoolId}
          onClose={() => setEditFile(null)}
          onSaved={() => window.location.reload()}
          onDeleted={() => window.location.reload()}
        />
      )}

      {/* Edit folder modal */}
      {editFolderId && (
        <EditFolderModal
          folderId={editFolderId}
          folderDisplayName={editFolderName}
          schoolId={schoolId}
          onClose={() => { setEditFolderId(null); setEditFolderName(''); }}
          onSaved={() => window.location.reload()}
          onDeleted={() => window.location.reload()}
        />
      )}

      {/* Upload loading overlay */}
      {isUploading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-background border shadow-lg">
            <Loader2 size={24} className="animate-spin text-primary" />
            <p className="text-sm font-medium">Uploader fil...</p>
          </div>
        </div>
      )}
    </div>
  );
}
