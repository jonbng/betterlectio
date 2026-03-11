import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import {
  ArrowLeft, Paperclip, Send, Flag, Trash2,
  MoreHorizontal, Reply, Download, Users, X, Loader2,
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
import { fetchPictureUrl, getCachedPictureUrl } from '@/lib/findskema-storage';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { formatMessageDate, getInitials, nameToHue } from '@/lib/beskeder-helpers';

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

// ── Avatar Component ────────────────────────────────────────────────────

interface AvatarProps {
  name: string;
  contextCardId: string;
  schoolId: string;
  size?: number;
}

function SenderAvatar({ name, contextCardId, schoolId, size = 36 }: AvatarProps) {
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
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
  }, [contextCardId, schoolId]);

  const initials = getInitials(name);
  const hue = nameToHue(name);

  if (pictureUrl && !error) {
    return (
      <img
        src={pictureUrl}
        alt={name}
        className="il-thread-avatar"
        style={{ width: size, height: size }}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div
      className="il-thread-avatar il-thread-avatar-initials"
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

interface LightboxImage {
  url: string;
  name: string;
  sizeLabel?: string;
  ext: string;
}

interface MessageItemProps {
  message: ThreadMessage;
  schoolId: string;
  threadSubject: string;
  index: number;
  onImageClick: (img: LightboxImage) => void;
}

function MessageItem({ message, schoolId, threadSubject, index, onImageClick }: MessageItemProps) {
  const strippedContent = stripSignatures(message.content);

  // Check if message title adds info beyond "Re: <subject>"
  const showTitle =
    message.title &&
    message.title !== threadSubject &&
    message.title !== `Re: ${threadSubject}`;

  const dateStr = formatMessageDate(message.date, message.timestamp);

  return (
    <div
      className={`il-thread-message ${message.isOwnMessage ? 'is-own' : ''}`}
      style={{ animationDelay: `${index * 40}ms` } as any}
    >
      <div className="il-thread-message-avatar">
        <SenderAvatar
          name={message.senderName}
          contextCardId={message.senderContextCardId}
          schoolId={schoolId}
        />
      </div>

      <div className="il-thread-message-body">
        <div className="il-thread-message-meta">
          <span className="il-thread-message-sender">
            {shortName(message.senderName)}
          </span>
          <span className="il-thread-message-time">{dateStr}</span>
        </div>

        {showTitle && (
          <div className="il-thread-message-title">{message.title}</div>
        )}

        <div
          className="il-thread-message-content"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(strippedContent) }}
        />

        {message.attachments.length > 0 && (
          <div className="il-thread-message-attachments">
            {message.attachments.map((att, i) => {
              const kind = getAttachmentKind(att.name, att.url);
              const ext = getAttachmentExtension(att.name, att.url);
              const Icon = getAttachmentIcon(kind);

              if (kind === 'image') {
                return (
                  <div key={i} className="il-thread-image-attachment">
                    <button
                      type="button"
                      className="il-thread-image-preview-link"
                      onClick={() => onImageClick({ url: att.url, name: att.name, sizeLabel: att.sizeLabel, ext })}
                    >
                      <img
                        src={att.url}
                        alt={att.name}
                        className="il-thread-image-preview"
                        loading="lazy"
                      />
                    </button>
                    <div className="il-thread-image-info">
                      <FileImage size={14} className="il-thread-image-info-icon" />
                      <span className="il-thread-image-info-name">{att.name}</span>
                      <span className="il-thread-image-info-size">
                        {att.sizeLabel || (ext ? ext.toUpperCase() : '')}
                      </span>
                      <a
                        href={att.url}
                        download={att.name}
                        className="il-thread-image-info-download"
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download size={13} />
                      </a>
                    </div>
                  </div>
                );
              }

              return (
                <a
                  key={i}
                  href={att.url}
                  className={`il-thread-attachment is-${kind}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={att.name}
                >
                  <span className="il-thread-attachment-icon">
                    <Icon size={16} />
                  </span>
                  <span className="il-thread-attachment-meta">
                    <span className="il-thread-attachment-name">{att.name}</span>
                    <span className="il-thread-attachment-detail">
                      {att.sizeLabel || (ext ? ext.toUpperCase() : 'Fil')}
                    </span>
                  </span>
                  <Download size={14} className="il-thread-attachment-download" />
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

function formatSubmitErrorForRetry(err: SubmitError): string {
  if (err.kind === 'session_expired') return 'Session udløbet. Log ind igen.';
  if (err.kind === 'timeout') return 'Kunne ikke bekræfte om svaret blev sendt (timeout). Opdatér tråden før du prøver igen.';
  return 'Kunne ikke bekræfte om svaret blev sendt. Opdatér tråden før du prøver igen for at undgå dubletter.';
}

export function BeskederThreadView({ data, schoolId }: BeskederThreadViewProps) {
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
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);
  const [formState, setFormState] = useState<FormState>({
    tokens: data.formTokens,
    action: data.formAction,
  });
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifyRef = useRef<HTMLDivElement>(null);
  const pollTimeoutRef = useRef<number | null>(null);

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
        if (sending || uploadingFileName || removingIndex !== null || !!replyBody.trim() || attachedFiles.length > 0) {
          scheduleNextPoll();
          return;
        }

        refreshThreadViaIframe(formState).then((result) => {
          if (cancelled) return;
          if (result.success) {
            setFormState(result.formState);
            setMessages(result.data.messages);
            setRecipients(result.data.recipients);
            if (result.data.replyFormTargets) {
              setReplyTargets(result.data.replyFormTargets);
              setReplyTitle((current) =>
                current.trim() ? current : result.data.replyFormTargets?.currentTitle || current,
              );
            }
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
  }, [formState, sending, uploadingFileName, removingIndex, replyBody, attachedFiles.length]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxImage) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightboxImage]);

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
        setError('Filupload fejlede. Prøv igen.');
      });
  }, [replyTargets, schoolId, formState]);

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
          setError('Kunne ikke fjerne vedhæftning.');
        }
        setRemovingIndex(null);
      });
  }, [formState, removingIndex]);

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
        setError(formatSubmitErrorForRetry(result.error));
      }
    });
  }, [replyTargets, replyBody, replyTitle, sending, formState]);

  const handleBack = () => {
    // Navigate back to message list
    const schoolMatch = window.location.pathname.match(/\/lectio\/(\d+)\//);
    const sid = schoolMatch?.[1] || schoolId;
    window.location.href = `${window.location.origin}/lectio/${sid}/beskeder2.aspx?mappeid=-70`;
  };

  const recipientNames = recipients.map((r) => shortName(r.name));

  return (
    <div className="il-thread-view">
      {/* ── Header ─────────────────────────────── */}
      <div className="il-thread-header">
        <button
          type="button"
          className="il-thread-back"
          onClick={handleBack}
          title="Tilbage til beskeder"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="il-thread-header-content">
          <h1 className="il-thread-subject">{data.threadSubject}</h1>
          <div className="il-thread-recipients">
            <Users size={13} className="il-thread-recipients-icon" />
            <span>{recipientNames.join(', ')}</span>
          </div>
        </div>

        <div className="il-thread-header-actions">
          <span className="il-thread-message-count">
            {messages.length} {messages.length === 1 ? 'besked' : 'beskeder'}
          </span>
        </div>
      </div>

      {/* ── Messages ───────────────────────────── */}
      <div className="il-thread-messages">
        {messages.map((msg, idx) => (
          <MessageItem
            key={`${msg.timestamp}-${msg.senderContextCardId}-${idx}`}
            message={msg}
            schoolId={schoolId}
            threadSubject={data.threadSubject}
            index={idx}
            onImageClick={setLightboxImage}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Reply Area ─────────────────────────── */}
      {replyTargets && (
        <div className="il-thread-reply">
          <div className="il-thread-reply-header">
            <Reply size={14} className="il-thread-reply-icon" />
            <span>Svar</span>
          </div>

          <WysiwygEditor
            key={editorKey}
            placeholder="Skriv dit svar..."
            onBBCodeChange={(bbcode) => setReplyBody(bbcode)}
            onSubmit={handleSend}
          />

          {error && (
            <div className="il-thread-reply-error">{error}</div>
          )}

          {/* Attached files list */}
          {attachedFiles.length > 0 && (
            <div className="il-thread-attached-files">
              {attachedFiles.map((file, i) => (
                <span key={`${file.deleteArgument}-${i}`} className={`il-thread-attached-file ${removingIndex === i ? 'is-removing' : ''}`}>
                  {removingIndex === i ? (
                    <Loader2 size={12} className="il-spin" />
                  ) : (
                    <Paperclip size={12} />
                  )}
                  <span className="il-thread-attached-file-name">{file.name}</span>
                  <button
                    type="button"
                    className="il-thread-attached-file-remove"
                    onClick={() => handleRemoveFile(file, i)}
                    disabled={removingIndex !== null}
                    title="Fjern vedhæftning"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="il-thread-reply-footer">
            <div className="il-thread-reply-footer-left">
              {replyTargets.attachPostbackTarget && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="il-sr-only"
                    onChange={handleFileSelect}
                  />
                  {uploadingFileName ? (
                    <span className="il-thread-reply-uploading">
                      <Loader2 size={14} className="il-spin" />
                      <span>Uploader {uploadingFileName}...</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="il-thread-reply-attach-btn"
                      onClick={() => fileInputRef.current?.click()}
                      title="Vedhæft fil"
                    >
                      <Paperclip size={14} />
                      <span>Vedhæft fil</span>
                    </button>
                  )}
                </>
              )}
              <div ref={notifyRef} className="il-thread-reply-notify" />
            </div>
            <div className="il-thread-reply-footer-right">
              <span className="il-thread-reply-hint">
                Ctrl+Enter for at sende
              </span>
              <button
                type="button"
                className="il-thread-send-btn"
                onClick={handleSend}
                disabled={!replyBody.trim() || sending || !!uploadingFileName || removingIndex !== null}
              >
                <Send size={15} />
                <span>{sending ? 'Sender...' : 'Send'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Lightbox ───────────────────────── */}
      {lightboxImage && (
        <div
          className="il-image-lightbox"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="il-image-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.url}
              alt={lightboxImage.name}
              className="il-image-lightbox-img"
            />
            <div className="il-image-lightbox-bar">
              <FileImage size={15} className="il-image-lightbox-bar-icon" />
              <div className="il-image-lightbox-bar-meta">
                <span className="il-image-lightbox-bar-name">{lightboxImage.name}</span>
                {(lightboxImage.sizeLabel || lightboxImage.ext) && (
                  <span className="il-image-lightbox-bar-size">
                    {lightboxImage.sizeLabel || lightboxImage.ext.toUpperCase()}
                  </span>
                )}
              </div>
              <a
                href={lightboxImage.url}
                download={lightboxImage.name}
                className="il-image-lightbox-download"
                title="Download"
              >
                <Download size={15} />
              </a>
              <button
                type="button"
                className="il-image-lightbox-close"
                onClick={() => setLightboxImage(null)}
                title="Luk"
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
