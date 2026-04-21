import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import {
  ArrowLeft, Paperclip, Send, Flag, Trash2,
  MoreHorizontal, Reply, Download, Users, X, Loader2, RefreshCw,
  File, FileText, FileImage, FileSpreadsheet, FileArchive, FileCode, FileAudio, FileVideo,
} from 'lucide-react';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import {
  type BeskederThreadData,
  type ThreadMessage,
  stripSignatures,
  shouldSkipSignature,
} from '@/lib/beskeder-thread-parser';
import {
  sendReplyViaIframe,
  refreshThreadViaIframe,
  uploadFileToLectio,
  attachFileViaIframe,
  removeAttachmentViaIframe,
  type FormState,
  type SubmitError,
  type AttachedFile,
  type ReplyFormTargets,
} from '@/lib/beskeder-submit';
import {
  ensureNameIdCache,
  fetchPictureUrl,
  getCachedPictureUrl,
  getPersonScheduleUrlFromMessage,
} from '@/lib/findskema-storage';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { formatMessageDate, getInitials, nameToHue } from '@/lib/beskeder-helpers';
import { fetchUnreadCount, broadcastUnreadCount } from '@/lib/unread-messages';
import { cn } from '@/lib/utils';
import { getDisplayNameFromLookupId, getPictureUrlFromLookupId, useSchoolStudents, type StudentsMap } from '@/lib/supabase/student-lookup';
import { useTranslation } from '@/lib/i18n';

/** Extract short display name: "Jonathan Arthur Hojer Bangert(k) (1x 17)" → "Jonathan Bangert" */
function shortName(fullName: string): string {
  const clean = fullName.replace(/\([^)]*\)/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length <= 2) return clean;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

type AttachmentKind =
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'archive'
  | 'code'
  | 'audio'
  | 'video'
  | 'file';

const ATTACHMENT_EXTENSION_KIND: Record<string, AttachmentKind> = {
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  heic: 'image',
  heif: 'image',
  bmp: 'image',
  tif: 'image',
  tiff: 'image',
  svg: 'image',

  // Documents
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  txt: 'document',
  md: 'document',
  pages: 'document',

  // Spreadsheets
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  tsv: 'spreadsheet',
  numbers: 'spreadsheet',

  // Presentations as document-type visuals
  ppt: 'document',
  pptx: 'document',
  odp: 'document',
  key: 'document',

  // Archives
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  bz2: 'archive',
  xz: 'archive',
  zst: 'archive',

  // Audio
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
  opus: 'audio',
  wma: 'audio',

  // Video
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  avi: 'video',
  m4v: 'video',
  wmv: 'video',

  // Code / data
  js: 'code',
  jsx: 'code',
  ts: 'code',
  tsx: 'code',
  html: 'code',
  css: 'code',
  scss: 'code',
  less: 'code',
  json: 'code',
  xml: 'code',
  yml: 'code',
  yaml: 'code',
  py: 'code',
  java: 'code',
  c: 'code',
  cc: 'code',
  cpp: 'code',
  cxx: 'code',
  cs: 'code',
  go: 'code',
  rs: 'code',
  php: 'code',
  sh: 'code',
  bash: 'code',
  sql: 'code',
};

function getAttachmentExtension(name: string, url: string): string {
  const source = name.trim() || url;
  const cleanSource = source.split('?')[0].split('#')[0];
  const extMatch = cleanSource.match(/\.([a-zA-Z0-9]{1,10})$/);
  return extMatch ? extMatch[1].toLowerCase() : '';
}

function getAttachmentKind(name: string, url: string): AttachmentKind {
  const ext = getAttachmentExtension(name, url);
  return ATTACHMENT_EXTENSION_KIND[ext] || 'file';
}

function getAttachmentIcon(kind: AttachmentKind) {
  switch (kind) {
    case 'image':
      return FileImage;
    case 'document':
      return FileText;
    case 'spreadsheet':
      return FileSpreadsheet;
    case 'archive':
      return FileArchive;
    case 'code':
      return FileCode;
    case 'audio':
      return FileAudio;
    case 'video':
      return FileVideo;
    default:
      return File;
  }
}

const ATTACHMENT_ICON_CLASS: Record<AttachmentKind, string> = {
  image: 'text-[oklch(0.59_0.11_215)] bg-[oklch(0.94_0.03_215/0.7)]',
  document: 'text-[oklch(0.54_0.13_265)] bg-[oklch(0.93_0.03_265/0.75)]',
  spreadsheet: 'text-[oklch(0.56_0.11_150)] bg-[oklch(0.93_0.028_150/0.75)]',
  archive: 'text-[oklch(0.56_0.09_75)] bg-[oklch(0.94_0.026_75/0.75)]',
  code: 'text-[oklch(0.58_0.1_245)] bg-[oklch(0.93_0.028_245/0.75)]',
  audio: 'text-[oklch(0.6_0.1_330)] bg-[oklch(0.93_0.026_330/0.75)]',
  video: 'text-[oklch(0.58_0.12_20)] bg-[oklch(0.93_0.028_20/0.75)]',
  file: 'text-muted-foreground bg-muted/80',
};

// ── PDF Preview (fetches blob to bypass Content-Disposition: attachment) ─

function PdfPreview({ url, title }: { url: string; title: string }) {
  const { t } = useTranslation();
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
        setBlobUrl(URL.createObjectURL(blob));
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
        <p className="text-sm text-muted-foreground">{t('beskeder.thread.pdfLoadError')}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-[color,background-color] duration-150"
        >
          <Download size={14} />
          {t('beskeder.thread.downloadInstead')}
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

// ── Avatar Component ────────────────────────────────────────────────────

interface AvatarProps {
  name: string;
  contextCardId: string;
  schoolId: string;
  size?: number;
  studentsMap: StudentsMap | null;
}

function SenderAvatar({ name, contextCardId, schoolId, size = 36, studentsMap }: AvatarProps) {
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const fetchedRef = useRef<string | null>(null);
  const preferredPictureUrl = getPictureUrlFromLookupId(studentsMap, contextCardId);

  useEffect(() => {
    if (preferredPictureUrl) {
      setError(false);
      setPictureUrl(preferredPictureUrl);
      fetchedRef.current = null;
      return;
    }

    if (!contextCardId) return;
    const fetchKey = `${schoolId}:${contextCardId}`;
    if (fetchedRef.current === fetchKey) return;
    fetchedRef.current = fetchKey;
    setError(false);
    setPictureUrl(null);

    // Try cache first
    const cached = getCachedPictureUrl(contextCardId);
    if (cached !== undefined) {
      if (cached) setPictureUrl(cached);
      else setError(true);
      return;
    }

    fetchPictureUrl(contextCardId, schoolId).then((url) => {
      if (url) setPictureUrl(url);
      else setError(true);
    });
  }, [contextCardId, preferredPictureUrl, schoolId]);

  const initials = getInitials(name);
  const hue = nameToHue(name);

  if (pictureUrl && !error) {
    return (
      <img
        src={pictureUrl}
        alt={name}
        className="shrink-0 rounded-full object-cover object-top"
        style={{ width: size, height: size }}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[0.02em] select-none [background:oklch(0.92_0.03_var(--avatar-hue))] text-[oklch(0.35_0.08_var(--avatar-hue))] dark:[background:oklch(0.25_0.04_var(--avatar-hue))] dark:text-[oklch(0.75_0.08_var(--avatar-hue))]"
      style={{
        width: size,
        height: size,
        '--avatar-hue': hue,
        fontSize: size * 0.38,
      } as any}
      title={name}
    >
      {initials}
    </div>
  );
}

// ── Message Component ────────────────────────────────────────────────────

interface LightboxItem {
  url: string;
  name: string;
  sizeLabel?: string;
  ext: string;
  kind: 'image' | 'pdf';
}

interface MessageItemProps {
  message: ThreadMessage;
  schoolId: string;
  threadSubject: string;
  index: number;
  onImageClick: (img: LightboxItem) => void;
  studentsMap: StudentsMap | null;
}

function MessageItem({ message, schoolId, threadSubject, index, onImageClick, studentsMap }: MessageItemProps) {
  const { t } = useTranslation();
  const displaySenderName = getDisplayNameFromLookupId(
    studentsMap,
    message.senderContextCardId,
    message.senderName,
  );
  const strippedContent = stripSignatures(message.content);
  const personScheduleUrl = getPersonScheduleUrlFromMessage(
    message.senderContextCardId,
    displaySenderName,
    schoolId,
  );

  // Check if message title adds info beyond "Re: <subject>"
  const showTitle =
    message.title &&
    message.title !== threadSubject &&
    message.title !== `Re: ${threadSubject}`;

  const dateStr = formatMessageDate(message.date, message.timestamp);

  return (
    <div
      className={cn(
        'animate-[thread-msg-in_0.3s_ease_both] flex gap-3.5 border-b border-border/50 py-4 last:border-b-0',
        message.isOwnMessage && '-mx-4 rounded-lg border-b-transparent bg-primary/6 px-4',
      )}
      style={{ animationDelay: `${index * 40}ms` } as any}
    >
      <div className="shrink-0">
        <SenderAvatar
          name={displaySenderName}
          contextCardId={message.senderContextCardId}
          schoolId={schoolId}
          studentsMap={studentsMap}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          {personScheduleUrl ? (
            <button
              type="button"
              className="truncate text-left text-xl font-semibold tracking-tight text-foreground transition-[color] duration-150 hover:text-primary"
              onClick={() => {
                window.location.href = personScheduleUrl;
              }}
              title={t('beskeder.thread.viewSchedule', { name: shortName(displaySenderName) })}
            >
              {shortName(displaySenderName)}
            </button>
          ) : (
            <span className="truncate text-xl font-semibold tracking-tight text-foreground">
              {shortName(displaySenderName)}
            </span>
          )}
          <span className="shrink-0 text-base text-muted-foreground">{dateStr}</span>
        </div>

        {showTitle && (
          <div className="mb-1 mt-1 text-xl font-medium text-muted-foreground">{message.title}</div>
        )}

        <div
          className="mt-2 wrap-anywhere text-xl leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:decoration-2"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(strippedContent) }}
        />

        {message.attachments.length > 0 && (
          <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
            {message.attachments.map((att, i) => {
              const kind = getAttachmentKind(att.name, att.url);
              const ext = getAttachmentExtension(att.name, att.url);
              const Icon = getAttachmentIcon(kind);

              if (kind === 'image') {
                return (
                  <div key={i} className="col-span-full max-w-[420px] overflow-hidden rounded-xl border border-border/90 bg-card/70">
                    <button
                      type="button"
                      className="block w-full cursor-zoom-in bg-muted/30 p-0"
                      onClick={() => onImageClick({ url: att.url, name: att.name, sizeLabel: att.sizeLabel, ext, kind: 'image' })}
                    >
                      <img
                        src={att.url}
                        alt={att.name}
                        className="block max-h-80 w-full object-contain"
                        loading="lazy"
                      />
                    </button>
                    <div className="flex items-center gap-1.5 border-t border-border/60 px-2.5 py-1.5 text-sm">
                      <FileImage size={14} className="shrink-0 text-[oklch(0.59_0.11_215)]" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{att.name}</span>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {att.sizeLabel || (ext ? ext.toUpperCase() : '')}
                      </span>
                      <a
                        href={att.url}
                        download={att.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex size-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent hover:text-foreground"
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download size={13} />
                      </a>
                    </div>
                  </div>
                );
              }

              const isPdf = ext === 'pdf';
              const sharedClassName = "inline-flex max-w-full items-center gap-2 rounded-xl border border-border/90 bg-card/70 px-2.5 py-2 text-foreground no-underline transition-[background-color,border-color] duration-150 hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring/60 focus-visible:outline-offset-2";
              const inner = (
                <>
                  <span className={cn('inline-flex size-[1.9rem] shrink-0 items-center justify-center rounded-lg', ATTACHMENT_ICON_CLASS[kind])}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{att.name}</span>
                    <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {att.sizeLabel || (ext ? ext.toUpperCase() : t('beskeder.thread.fileLabel'))}
                    </span>
                  </span>
                  <Download size={14} className="shrink-0 text-muted-foreground/80" />
                </>
              );

              if (isPdf) {
                return (
                  <button
                    key={i}
                    type="button"
                    className={cn(sharedClassName, 'cursor-pointer')}
                    title={att.name}
                    onClick={() => onImageClick({ url: att.url, name: att.name, sizeLabel: att.sizeLabel, ext, kind: 'pdf' })}
                  >
                    {inner}
                  </button>
                );
              }

              return (
                <a
                  key={i}
                  href={att.url}
                  className={sharedClassName}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={att.name}
                >
                  {inner}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

interface BeskederThreadViewProps {
  data: BeskederThreadData;
  schoolId: string;
}

function formatSubmitErrorForRetry(err: SubmitError, t: ReturnType<typeof useTranslation>['t']): string {
  if (err.kind === 'session_expired') return t('beskeder.errors.sessionExpired');
  if (err.kind === 'timeout') return t('beskeder.errors.replyTimeout');
  return t('beskeder.errors.replyFailed');
}

export function BeskederThreadView({ data, schoolId }: BeskederThreadViewProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ThreadMessage[]>(data.messages);
  const [recipients, setRecipients] = useState(data.recipients);
  const [replyBody, setReplyBody] = useState('');
  const [replyTitle, setReplyTitle] = useState(data.replyForm?.currentTitle || '');
  const [sending, setSending] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [lightboxItem, setLightboxItem] = useState<LightboxItem | null>(null);
  const [formState, setFormState] = useState<FormState>({
    tokens: data.formTokens,
    action: data.formAction,
  });
  const { studentsMap } = useSchoolStudents(schoolId);
  // Reply form postback targets — tracked in state because ASP.NET ctl indices
  // shift after each send (new row added to the messages table).
  const [replyTargets, setReplyTargets] = useState<ReplyFormTargets | null>(() => {
    if (!data.replyForm) return null;
    const rf = data.replyForm;
    return {
      sendPostbackTarget: rf.sendPostbackTarget,
      titleFieldName: rf.titleInputId?.replace(/_/g, '$') || '',
      bodyFieldName: rf.bodyTextareaId?.replace(/_/g, '$') || '',
      attachPostbackTarget: rf.attachPostbackTarget,
      attachDocIdFieldName: rf.attachDocumentIdInput?.getAttribute('name') || '',
      currentTitle: rf.currentTitle,
    };
  });
  const [refreshing, setRefreshing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifyRef = useRef<HTMLDivElement>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);

  // Scroll to bottom on mount
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Move native notify dropdown into our reply footer
  useEffect(() => {
    if (notifyRef.current && data.replyForm?.notifyDropdownEl) {
      notifyRef.current.appendChild(data.replyForm.notifyDropdownEl);
    }
  }, []);

  useEffect(() => {
    void ensureNameIdCache(schoolId);
  }, [schoolId]);

  useEffect(() => {
    let cancelled = false;

    fetchUnreadCount(schoolId).then((count) => {
      if (!cancelled) broadcastUnreadCount(schoolId, count);
    });

    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const performRefresh = useCallback(async (opts?: { manual?: boolean }) => {
    if (refreshInFlightRef.current) {
      console.debug('[BetterLectio] refresh skipped — already in flight', { manual: !!opts?.manual });
      return;
    }
    refreshInFlightRef.current = true;
    if (opts?.manual) setRefreshing(true);
    const startedAt = performance.now();
    console.debug('[BetterLectio] refresh start', { manual: !!opts?.manual, currentMessages: messages.length });
    try {
      const result = await refreshThreadViaIframe(formState, data.threadSubject);
      const ms = Math.round(performance.now() - startedAt);
      if (result.success) {
        const before = messages.length;
        const after = result.data.messages.length;
        console.debug('[BetterLectio] refresh ok', {
          ms,
          before,
          after,
          delta: after - before,
        });
        setFormState(result.formState);
        setMessages(result.data.messages);
        setRecipients(result.data.recipients);
        if (result.data.replyFormTargets) {
          setReplyTargets(result.data.replyFormTargets);
          setReplyTitle((current) =>
            current.trim() ? current : result.data.replyFormTargets?.currentTitle || current,
          );
        }
      } else {
        console.warn('[BetterLectio] refresh failed', { ms, error: result.error });
      }
    } catch (err) {
      console.error('[BetterLectio] refresh threw', err);
    } finally {
      refreshInFlightRef.current = false;
      if (opts?.manual) setRefreshing(false);
    }
  }, [formState, messages.length]);

  useEffect(() => {
    let cancelled = false;

    const clearPollTimeout = () => {
      if (pollTimeoutRef.current !== null) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };

    const isBusyComposing = () =>
      sending || !!uploadingFileName || removingIndex !== null || !!replyBody.trim() || attachedFiles.length > 0;

    const scheduleNextPoll = () => {
      if (cancelled) return;
      pollTimeoutRef.current = window.setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState !== 'visible' || isBusyComposing()) {
          scheduleNextPoll();
          return;
        }
        await performRefresh();
        if (!cancelled) scheduleNextPoll();
      }, 7500);
    };

    const handleVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible' || isBusyComposing()) return;
      clearPollTimeout();
      void performRefresh().finally(() => {
        if (!cancelled) scheduleNextPoll();
      });
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    scheduleNextPoll();
    return () => {
      cancelled = true;
      clearPollTimeout();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [performRefresh, sending, uploadingFileName, removingIndex, replyBody, attachedFiles.length]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxItem) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxItem(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightboxItem]);

  const handleFileSelect = useCallback((e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    if (!replyTargets?.attachPostbackTarget || !replyTargets?.attachDocIdFieldName) return;

    setUploadingFileName(file.name);
    setError(null);

    // Upload file, then attach via iframe (no reload)
    uploadFileToLectio(file, schoolId)
      .then((serializedId) =>
        attachFileViaIframe(formState, serializedId, replyTargets.attachPostbackTarget, replyTargets.attachDocIdFieldName),
      )
      .then((result) => {
        if (result.success) {
          setFormState(result.formState);
          setAttachedFiles(result.data.attachments);
          setUploadingFileName(null);
        } else {
          throw new Error(result.error.kind);
        }
      })
      .catch((err) => {
        console.error('[BetterLectio] File upload failed:', err);
        setUploadingFileName(null);
        setError(t('beskeder.errors.fileUpload'));
      });
  }, [replyTargets, schoolId, formState, t]);

  const handleRemoveFile = useCallback((file: AttachedFile, index: number) => {
    if (removingIndex !== null) return;
    setRemovingIndex(index);
    setError(null);

    removeAttachmentViaIframe(formState, file.deleteTarget, file.deleteArgument)
      .then((result) => {
        if (result.success) {
          setFormState(result.formState);
          setAttachedFiles(result.data.attachments);
        } else {
          setError(t('beskeder.errors.removeAttachment'));
        }
        setRemovingIndex(null);
      });
  }, [formState, removingIndex, t]);

  const handleSend = useCallback(() => {
    if (!replyTargets || !replyBody.trim() || sending) return;
    setSending(true);
    setError(null);

    const skipSig = shouldSkipSignature();

    sendReplyViaIframe(
      formState,
      replyTargets.sendPostbackTarget,
      replyTargets.titleFieldName,
      replyTargets.bodyFieldName,
      replyTitle,
      replyBody,
      skipSig,
    ).then((result) => {
      if (result.success) {
        setFormState(result.formState);
        setMessages(result.data.messages);
        setReplyBody('');
        setAttachedFiles([]);
        setEditorKey(k => k + 1);
        setSending(false);

        // Update reply form targets — ASP.NET ctl indices shift after adding a row
        if (result.data.replyFormTargets) {
          setReplyTargets(result.data.replyFormTargets);
          setReplyTitle(result.data.replyFormTargets.currentTitle);
        }

        // Scroll to new message
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        setSending(false);
        setError(formatSubmitErrorForRetry(result.error, t));
      }
    });
  }, [replyTargets, replyBody, replyTitle, sending, formState, t]);

  const handleBack = () => {
    // Navigate back to message list
    const schoolMatch = window.location.pathname.match(/\/lectio\/(\d+)\//);
    const sid = schoolMatch?.[1] || schoolId;
    window.location.href = `${window.location.origin}/lectio/${sid}/beskeder2.aspx?mappeid=-70`;
  };

  const recipientEntries = recipients.map((recipient) => {
    const displayName = getDisplayNameFromLookupId(
      studentsMap,
      recipient.contextCardId,
      recipient.name,
    );
    return {
      ...recipient,
      displayName,
      shortLabel: shortName(displayName),
      scheduleUrl: getPersonScheduleUrlFromMessage(recipient.contextCardId, displayName, schoolId),
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-10 pb-12 pt-8">
      {/* ── Header ─────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-10 flex items-center gap-3 border-b border-border bg-background/80 px-10 pb-5 pt-5 mb-3 backdrop-blur-md">
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.95]"
          onClick={handleBack}
          title={t('beskeder.thread.backTitle')}
        >
          <ArrowLeft size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.5rem] font-[800] tracking-[-0.02em] text-foreground">{data.threadSubject}</h1>
          <div className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users size={13} className="text-muted-foreground" />
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {recipientEntries.map((recipient, index) => (
                recipient.scheduleUrl ? (
                  <button
                    key={`${recipient.contextCardId}-${recipient.name}-${index}`}
                    type="button"
                    className="truncate text-left transition-[color] duration-150 hover:text-primary"
                    onClick={() => {
                      window.location.href = recipient.scheduleUrl!;
                    }}
                    title={t('beskeder.thread.viewSchedule', { name: recipient.shortLabel })}
                  >
                    {recipient.shortLabel}
                    {index < recipientEntries.length - 1 ? ',' : ''}
                  </button>
                ) : (
                  <span key={`${recipient.contextCardId}-${recipient.name}-${index}`} className="truncate">
                    {recipient.shortLabel}
                    {index < recipientEntries.length - 1 ? ',' : ''}
                  </span>
                )
              ))}
            </div>
          </div>
        </div>

        <div className="inline-flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {messages.length} {messages.length === 1 ? t('beskeder.thread.message') : t('beskeder.thread.messages')}
          </span>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => { void performRefresh({ manual: true }); }}
            disabled={refreshing}
            title={t('beskeder.thread.refreshTitle')}
            aria-label={t('beskeder.thread.refreshTitle')}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Messages ───────────────────────────── */}
      <div className="flex-1 space-y-2 py-3 pb-4">
        {messages.map((msg, idx) => (
          <MessageItem
            key={`${msg.timestamp}-${msg.senderContextCardId}-${idx}`}
            message={msg}
            schoolId={schoolId}
            threadSubject={data.threadSubject}
            index={idx}
            onImageClick={setLightboxItem}
            studentsMap={studentsMap}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Reply Area ─────────────────────────── */}
      {replyTargets && (
        <div className="sticky bottom-0 z-10 pt-4 pb-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_-4px_16px_oklch(0_0_0/0.06)]">
          <div className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Reply size={13} className="text-muted-foreground/50" />
            <span>{t('beskeder.thread.replyLabel')}</span>
          </div>

          <WysiwygEditor
            key={editorKey}
            placeholder={t('beskeder.thread.replyPlaceholder')}
            onBBCodeChange={(bbcode) => setReplyBody(bbcode)}
            onSubmit={handleSend}
            className="border-0 rounded-none shadow-none focus-within:ring-0 focus-within:border-0"
          />

          {error && (
            <div className="mx-4 mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-sm text-destructive">{error}</div>
          )}

          {/* Attached files list */}
          {attachedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 px-4 pt-2">
              {attachedFiles.map((file, i) => (
                <span key={`${file.deleteArgument}-${i}`} className="inline-flex items-center gap-1.5 rounded-md bg-primary/8 px-2 py-1 text-sm text-foreground">
                  {removingIndex === i ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Paperclip size={12} />
                  )}
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="inline-flex size-5 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent hover:text-foreground"
                    onClick={() => handleRemoveFile(file, i)}
                    disabled={removingIndex !== null}
                    title={t('beskeder.thread.removeAttachmentTitle')}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-4 py-2.5">
            <div className="inline-flex items-center gap-2">
              {replyTargets.attachPostbackTarget && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    onChange={handleFileSelect}
                  />
                  {uploadingFileName ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      <span>{t('beskeder.thread.uploading', { fileName: uploadingFileName })}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-[border-color,color] duration-150 hover:border-foreground hover:text-foreground"
                      onClick={() => fileInputRef.current?.click()}
                      title={t('beskeder.thread.attachFile')}
                    >
                      <Paperclip size={14} />
                      <span>{t('beskeder.thread.attachFile')}</span>
                    </button>
                  )}
                </>
              )}
              <div
                ref={notifyRef}
                className="empty:hidden [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-2 [&_select]:py-1.5 [&_select]:text-sm [&_select]:text-foreground [&_select]:outline-none [&_select]:focus:border-primary [&_select]:focus:ring-2 [&_select]:focus:ring-primary/15"
              />
            </div>
            <div className="ml-auto inline-flex items-center gap-2">
              <span className="text-sm text-muted-foreground/60">
                {t('beskeder.thread.keyboardHint')}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleSend}
                disabled={!replyBody.trim() || sending || !!uploadingFileName || removingIndex !== null}
              >
                <Send size={15} />
                <span>{sending ? t('beskeder.thread.sending') : t('beskeder.thread.send')}</span>
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ── Lightbox (image + PDF) ───────────────────────── */}
      {lightboxItem && (
        <div
          className="animate-[lightbox-fade-in_0.15s_ease-out] fixed inset-0 z-100 flex cursor-pointer items-center justify-center bg-[oklch(0_0_0/0.6)] backdrop-blur-sm"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className={cn(
              "animate-[lightbox-scale-in_0.2s_ease-out] flex cursor-default flex-col overflow-hidden rounded-xl bg-card shadow-[0_24px_80px_-12px_oklch(0_0_0/0.5),0_0_0_1px_oklch(1_0_0/0.08)]",
              lightboxItem.kind === 'pdf'
                ? 'w-[95vw] max-w-[1200px] h-[92vh]'
                : 'max-h-[85vh] max-w-[min(85vw,900px)]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxItem.kind === 'pdf' ? (
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-0">
                <PdfPreview url={lightboxItem.url} title={lightboxItem.name} />
              </div>
            ) : (
              <img
                src={lightboxItem.url}
                alt={lightboxItem.name}
                className="block max-h-[calc(85vh-3rem)] max-w-full object-contain bg-[oklch(0.12_0_0)]"
              />
            )}
            <div className="flex min-h-11 items-center gap-2 border-t border-border/50 px-3 py-2">
              {lightboxItem.kind === 'pdf'
                ? <FileText size={15} className="shrink-0 text-[oklch(0.54_0.13_265)]" />
                : <FileImage size={15} className="shrink-0 text-[oklch(0.59_0.11_215)]" />
              }
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{lightboxItem.name}</span>
                {(lightboxItem.sizeLabel || lightboxItem.ext) && (
                  <span className="block text-xs font-medium uppercase tracking-[0.01em] text-muted-foreground">
                    {lightboxItem.sizeLabel || lightboxItem.ext.toUpperCase()}
                  </span>
                )}
              </div>
              <a
                href={lightboxItem.url}
                download={lightboxItem.name}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex size-8 items-center justify-center rounded-lg bg-transparent text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent/60 hover:text-foreground"
                title="Download"
              >
                <Download size={15} />
              </a>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-lg bg-transparent text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent/60 hover:text-foreground"
                onClick={() => setLightboxItem(null)}
                title={t('beskeder.thread.close')}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
