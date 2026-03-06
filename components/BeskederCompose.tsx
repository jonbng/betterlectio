import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { ArrowLeft, X, Paperclip, Send, Loader2 } from 'lucide-react';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import { type ComposeFormData, type ComposeRecipient, shouldSkipSignature } from '@/lib/beskeder-thread-parser';
import { doPostBack, parseFormTokens } from '@/lib/beskeder-parser';
import {
  sendMessageViaIframe,
  removeRecipientViaIframe,
  type FormState,
} from '@/lib/beskeder-submit';

interface BeskederComposePageProps {
  data: ComposeFormData;
  schoolId: string;
}

export function BeskederComposePage({ data, schoolId }: BeskederComposePageProps) {
  const [title, setTitle] = useState(data.currentTitle);
  const [bodyBBCode, setBodyBBCode] = useState(data.currentBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<ComposeRecipient[]>(data.recipients);
  const [removingRecipient, setRemovingRecipient] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(() => {
    const { tokens, action } = parseFormTokens();
    return { tokens, action };
  });

  const autocompleteRef = useRef<HTMLDivElement>(null);
  const attachRef = useRef<HTMLDivElement>(null);
  const noReplyRef = useRef<HTMLDivElement>(null);
  const editorSyncRef = useRef<(() => string) | null>(null);

  // Derive field names from native inputs
  const titleFieldName = data.nativeTitleInput.getAttribute('name') || '';
  const bodyFieldName = data.nativeBodyTextarea.getAttribute('name') || '';

  // Move native autocomplete container into our UI
  useEffect(() => {
    if (!autocompleteRef.current || !data.autocompleteContainerEl) return;
    autocompleteRef.current.appendChild(data.autocompleteContainerEl);

    // Lectio initializes autocomplete via data-dropdowninit at window.onload.
    // Our content script runs at document_idle (before onload), so the
    // autocomplete may not be initialized yet. Re-trigger it after a short
    // delay via a main-world script (content scripts can't access page globals).
    const input = data.autocompleteContainerEl.querySelector(
      'input[data-dropdowninit]',
    ) as HTMLInputElement | null;
    if (input) {
      const initCode = input.getAttribute('data-dropdowninit');
      if (initCode) {
        const script = document.createElement('script');
        script.textContent = `
          try {
            // Wait for Lectio's Autocomplete global to be available
            var _blInitAC = function() {
              if (typeof Autocomplete !== 'undefined') {
                ${initCode}
              } else {
                setTimeout(_blInitAC, 50);
              }
            };
            _blInitAC();
          } catch(e) { console.warn('[BetterLectio] AC init:', e); }
        `;
        document.documentElement.appendChild(script);
        script.remove();
      }
    }
  }, []);

  // Move native attach panel into our footer
  useEffect(() => {
    if (attachRef.current && data.attachPanelEl) {
      attachRef.current.appendChild(data.attachPanelEl);
    }
  }, []);

  // Move native no-reply checkbox into our UI
  useEffect(() => {
    if (noReplyRef.current && data.noReplyCheckbox) {
      const wrapper = data.noReplyCheckbox.closest('span[title]');
      if (wrapper) {
        noReplyRef.current.appendChild(wrapper);
      }
    }
  }, []);

  const handleBack = useCallback(() => {
    if (data.cancelPostbackTarget) {
      doPostBack(data.cancelPostbackTarget, '');
    } else {
      window.location.href = `${window.location.origin}/lectio/${schoolId}/beskeder2.aspx?mappeid=-70`;
    }
  }, [data.cancelPostbackTarget, schoolId]);

  const handleSend = useCallback(() => {
    if (sending) return;
    setSending(true);
    setError(null);

    // Force-sync WYSIWYG editor
    let finalBody = bodyBBCode;
    if (editorSyncRef.current) {
      finalBody = editorSyncRef.current();
    }

    const skipSig = shouldSkipSignature();

    sendMessageViaIframe(
      formState,
      data.sendPostbackTarget,
      titleFieldName,
      bodyFieldName,
      title,
      finalBody,
      skipSig,
    ).then((result) => {
      if (result.success) {
        // Navigate to thread list on success
        window.location.href = `${window.location.origin}/lectio/${schoolId}/beskeder2.aspx?mappeid=-70`;
      } else {
        setSending(false);
        if (result.error.kind === 'session_expired') {
          setError('Session udløbet. Log ind igen.');
        } else if (result.error.kind === 'timeout') {
          setError('Timeout. Prøv igen.');
        } else {
          // Fallback to native postback
          console.warn('[BetterLectio] Compose send iframe failed, falling back:', result.error);
          data.nativeTitleInput.value = title;
          const sig = skipSig ? '' : '\n\n[url=https://chromewebstore.google.com/detail/betterlectio/cbopfnaegoknpplkngoppmmomppimhkh]Sendt med BetterLectio[/url]';
          data.nativeBodyTextarea.value = finalBody + sig;
          doPostBack(data.sendPostbackTarget, '');
        }
      }
    });
  }, [sending, title, bodyBBCode, data, formState, titleFieldName, bodyFieldName, schoolId]);

  const handleRemoveRecipient = useCallback((targetAndArg: string) => {
    // Format: "eventTarget:eventArgument" (e.g. "s$m$...GV:DEL$0")
    const colonIdx = targetAndArg.indexOf(':');
    if (colonIdx <= 0) return;

    const target = targetAndArg.slice(0, colonIdx);
    const argument = targetAndArg.slice(colonIdx + 1);

    setRemovingRecipient(targetAndArg);
    setError(null);

    removeRecipientViaIframe(formState, target, argument).then((result) => {
      setRemovingRecipient(null);
      if (result.success) {
        setFormState(result.formState);
        setRecipients(result.data.recipients);
      } else {
        if (result.error.kind === 'session_expired') {
          setError('Session udløbet. Log ind igen.');
        } else {
          // Fallback to native postback (will reload)
          console.warn('[BetterLectio] Remove recipient iframe failed, falling back:', result.error);
          doPostBack(target, argument);
        }
      }
    });
  }, [formState]);

  // Ctrl+Enter to send
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleSend]);

  return (
    <div className="il-compose-view">
      {/* Header */}
      <div className="il-compose-header">
        <button
          type="button"
          className="il-thread-back"
          onClick={handleBack}
          title="Tilbage til beskeder"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="il-compose-page-title">Ny besked</h1>
      </div>

      {/* Card */}
      <div className="il-compose-card">
        {/* Recipients field */}
        <div className="il-compose-field il-compose-field-recipients">
          <label className="il-compose-label">Til</label>
          <div className="il-compose-recipients-area">
            {recipients.length > 0 && (
              <div className="il-compose-pills">
                {recipients.map((r) => (
                  <span
                    key={r.removePostbackTarget}
                    className={`il-compose-pill ${removingRecipient === r.removePostbackTarget ? 'is-removing' : ''}`}
                  >
                    <span className="il-compose-pill-name">{r.name}</span>
                    {r.removePostbackTarget && (
                      <button
                        type="button"
                        className="il-compose-pill-remove"
                        onClick={() => handleRemoveRecipient(r.removePostbackTarget)}
                        disabled={!!removingRecipient}
                        title={`Fjern ${r.name}`}
                      >
                        {removingRecipient === r.removePostbackTarget
                          ? <Loader2 size={13} className="il-spin" />
                          : <X size={13} />
                        }
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div ref={autocompleteRef} className="il-compose-autocomplete-wrapper" />
          </div>
        </div>

        {/* No-reply toggle */}
        {data.noReplyCheckbox && (
          <div className="il-compose-field il-compose-field-noreply">
            <div ref={noReplyRef} className="il-compose-noreply-wrapper" />
          </div>
        )}

        {/* Subject field */}
        <div className="il-compose-field il-compose-field-subject">
          <label className="il-compose-label">Emne</label>
          <input
            type="text"
            className="il-compose-input"
            value={title}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            placeholder="Titel"
            maxLength={100}
          />
        </div>

        {/* Body field with WYSIWYG editor */}
        <div className="il-compose-field il-compose-field-body" id="il-compose-editor">
          <WysiwygEditor
            initialBBCode={data.currentBody}
            onBBCodeChange={setBodyBBCode}
            placeholder="Skriv din besked..."
            onSubmit={handleSend}
            syncRef={editorSyncRef}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="il-compose-error">{error}</div>
        )}

        {/* Footer */}
        <div className="il-compose-footer">
          <div className="il-compose-footer-left">
            <div ref={attachRef} className="il-compose-attach-wrapper" />
          </div>
          <div className="il-compose-footer-right">
            <button
              type="button"
              className="il-compose-cancel-btn"
              onClick={handleBack}
            >
              Annuller
            </button>
            <button
              type="button"
              className="il-compose-send-btn"
              onClick={handleSend}
              disabled={sending}
              title="Send (Ctrl+Enter)"
            >
              <Send size={15} />
              <span>{sending ? 'Sender...' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Legacy: enhance native compose form (fallback). */
export function enhanceComposeForm(): void {
  document.body.classList.add('il-beskeder-compose-active');
  console.warn('[BetterLectio] Compose fallback: native form shown');
}
