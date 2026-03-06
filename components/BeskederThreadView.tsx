import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import {
  ArrowLeft, Paperclip, Send, Flag, Trash2,
  MoreHorizontal, Reply, Download, Users, X, Loader2,
} from 'lucide-react';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import {
  type BeskederThreadData,
  type ThreadMessage,
  sendReply as sendReplyNative,
  stripSignatures,
  shouldSkipSignature,
} from '@/lib/beskeder-thread-parser';
import { doPostBack, parseFormTokens } from '@/lib/beskeder-parser';
import {
  sendReplyViaIframe,
  uploadFileToLectio,
  attachFileViaIframe,
  type FormState,
  type SubmitError,
} from '@/lib/beskeder-submit';
import { fetchPictureUrl, getCachedPictureUrl } from '@/lib/findskema-storage';

// ── Helpers ────────────────────────────────────────────────────────────

const DANISH_MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'maj', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
];

function formatMessageDate(date: Date | null, timestamp: string): string {
  if (!date) return timestamp;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );

  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (diffDays === 0) return `I dag ${timeStr}`;
  if (diffDays === 1) return `I går ${timeStr}`;
  return `${date.getDate()}. ${DANISH_MONTHS[date.getMonth()]} ${date.getFullYear() !== now.getFullYear() ? date.getFullYear() + ' ' : ''}${timeStr}`;
}

function getInitials(name: string): string {
  const clean = name.replace(/\(.*?\)/g, '').trim();
  const parts = clean.split(/\s+/);
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

/** Extract short display name: "Jonathan Arthur Hojer Bangert(k) (1x 17)" → "Jonathan Bangert" */
function shortName(fullName: string): string {
  const clean = fullName.replace(/\([^)]*\)/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length <= 2) return clean;
  return `${parts[0]} ${parts[parts.length - 1]}`;
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
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!contextCardId || fetchedRef.current) return;
    fetchedRef.current = true;

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

interface MessageItemProps {
  message: ThreadMessage;
  schoolId: string;
  threadSubject: string;
  index: number;
}

function MessageItem({ message, schoolId, threadSubject, index }: MessageItemProps) {
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
          dangerouslySetInnerHTML={{ __html: strippedContent }}
        />

        {message.attachments.length > 0 && (
          <div className="il-thread-message-attachments">
            {message.attachments.map((att, i) => (
              <a
                key={i}
                href={att.url}
                className="il-thread-attachment"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download size={13} />
                <span>{att.name}</span>
              </a>
            ))}
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

export function BeskederThreadView({ data, schoolId }: BeskederThreadViewProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>(data.messages);
  const [replyBody, setReplyBody] = useState('');
  const [replyTitle, setReplyTitle] = useState(data.replyForm?.currentTitle || '');
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [formState, setFormState] = useState<FormState>({
    tokens: data.formTokens,
    action: data.formAction,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifyRef = useRef<HTMLDivElement>(null);

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

  // Derive input field names from the DOM IDs (convert _ to $ for ASP.NET field names)
  const titleFieldName = data.replyForm?.titleInputId?.replace(/_/g, '$') || '';
  const bodyFieldName = data.replyForm?.bodyTextareaId?.replace(/_/g, '$') || '';
  // Also compute the hidden input name for the attachment doc chooser
  const attachDocIdFieldName = data.replyForm?.attachDocumentIdInput?.getAttribute('name') || '';

  const handleFileSelect = useCallback((e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    const rf = data.replyForm;
    if (!rf?.attachPostbackTarget || !attachDocIdFieldName) return;

    setSelectedFile(file);
    setUploading(true);
    setError(null);

    // Upload file, then attach via iframe (no reload)
    uploadFileToLectio(file, schoolId)
      .then((serializedId) =>
        attachFileViaIframe(formState, serializedId, rf.attachPostbackTarget, attachDocIdFieldName),
      )
      .then((result) => {
        if (result.success) {
          setFormState(result.formState);
          setUploading(false);
          // File is now attached on the server side
        } else {
          throw new Error(result.error.kind);
        }
      })
      .catch((err) => {
        console.error('[BetterLectio] File upload failed:', err);
        setUploading(false);
        setSelectedFile(null);
        setError('Filupload fejlede. Prøv igen.');
      });
  }, [data.replyForm, schoolId, formState, attachDocIdFieldName]);

  const handleSend = useCallback(() => {
    if (!data.replyForm || !replyBody.trim() || sending) return;
    setSending(true);
    setError(null);

    const skipSig = shouldSkipSignature();

    sendReplyViaIframe(
      formState,
      data.replyForm.sendPostbackTarget,
      titleFieldName,
      bodyFieldName,
      replyTitle,
      replyBody,
      skipSig,
    ).then((result) => {
      if (result.success) {
        setFormState(result.formState);
        setMessages(result.data.messages);
        setReplyBody('');
        setReplyTitle(data.replyForm?.currentTitle || '');
        setSelectedFile(null);
        setEditorKey(k => k + 1);
        setSending(false);

        // Scroll to new message
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        setSending(false);
        if (result.error.kind === 'session_expired') {
          setError('Session udløbet. Log ind igen.');
        } else if (result.error.kind === 'timeout') {
          setError('Timeout. Prøv igen.');
        } else {
          // Fallback: use native postback
          console.warn('[BetterLectio] Reply iframe failed, falling back to native:', result.error);
          sendReplyNative(data.replyForm!, replyTitle, replyBody);
        }
      }
    });
  }, [data.replyForm, replyBody, replyTitle, sending, formState, titleFieldName, bodyFieldName]);

  const handleBack = () => {
    // Navigate back to message list
    const schoolMatch = window.location.pathname.match(/\/lectio\/(\d+)\//);
    const sid = schoolMatch?.[1] || schoolId;
    window.location.href = `${window.location.origin}/lectio/${sid}/beskeder2.aspx?mappeid=-70`;
  };

  const recipientNames = data.recipients.map((r) => shortName(r.name));

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
            key={idx}
            message={msg}
            schoolId={schoolId}
            threadSubject={data.threadSubject}
            index={idx}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Reply Area ─────────────────────────── */}
      {data.replyForm && (
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

          <div className="il-thread-reply-footer">
            <div className="il-thread-reply-footer-left">
              {data.replyForm.attachDocumentIdInput && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="il-sr-only"
                    onChange={handleFileSelect}
                  />
                  {uploading ? (
                    <span className="il-thread-reply-uploading">
                      <Loader2 size={14} className="il-spin" />
                      <span>Uploader {selectedFile?.name}...</span>
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
                disabled={!replyBody.trim() || sending || uploading}
              >
                <Send size={15} />
                <span>{sending ? 'Sender...' : 'Send'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
