import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { ArrowLeft, X, Paperclip, Send, Loader2, Search, UserRound } from 'lucide-react';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import { type ComposeFormData, type ComposeRecipient, shouldSkipSignature } from '@/lib/beskeder-thread-parser';
import { doPostBack, parseFormTokens } from '@/lib/beskeder-parser';
import {
  sendMessageViaIframe,
  addRecipientViaIframe,
  removeRecipientViaIframe,
  uploadFileToLectio,
  attachFileViaIframe,
  removeAttachmentViaIframe,
  type FormState,
  type SubmitError,
  type AttachedFile,
} from '@/lib/beskeder-submit';
import { fetchBeskederRecipientItems } from '@/lib/beskeder-recipients-cache';
import { fetchPictureUrl, getCachedPictureUrl } from '@/lib/findskema-storage';
import { normalizeString, fuzzyMatch } from '@/lib/fuzzy-search';
import { cn } from '@/lib/utils';
import { getDisplayNameFromLookupId, getNameAliasesFromLookupId, getPictureUrlFromLookupId, useSchoolStudents } from '@/lib/supabase/student-lookup';
import { useTranslation } from '@/lib/i18n';

interface BeskederComposePageProps {
  data: ComposeFormData;
  schoolId: string;
}

interface ComposeRecipientOption {
  id: string;
  name: string;
  type: string;
  searchText: string;
}

function formatSendError(err: SubmitError, t: (key: Parameters<ReturnType<typeof useTranslation>['t']>[0]) => string): string {
  if (err.kind === 'session_expired') return t('beskeder.errors.sessionExpired');
  if (err.kind === 'timeout') return t('beskeder.errors.sendTimeout');
  return t('beskeder.errors.sendFailed');
}

export function BeskederComposePage({ data, schoolId }: BeskederComposePageProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(data.currentTitle);
  const [bodyBBCode, setBodyBBCode] = useState(data.currentBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<ComposeRecipient[]>(data.recipients);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [recipientOptions, setRecipientOptions] = useState<ComposeRecipientOption[]>([]);
  const [recipientDirectoryLoading, setRecipientDirectoryLoading] = useState(true);
  const [recipientDirectoryError, setRecipientDirectoryError] = useState<string | null>(null);
  const [addingRecipientId, setAddingRecipientId] = useState<string | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [pictureByContextId, setPictureByContextId] = useState<Record<string, string | null>>({});
  const [removingRecipient, setRemovingRecipient] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [removingAttachIndex, setRemovingAttachIndex] = useState<number | null>(null);
  const [formState, setFormState] = useState<FormState>(() => {
    const { tokens, action } = parseFormTokens();
    return { tokens, action };
  });
  const { studentsMap } = useSchoolStudents(schoolId);

  // ASP.NET checkboxes aren't included in `parseFormTokens` (hidden-only), and
  // they only appear in POST data when checked. If we don't inject the current
  // state into every compose postback, the server silently resets it to
  // unchecked — losing "Skal ikke kunne besvares" state at send time.
  const noReplyFieldName = data.noReplyCheckbox?.getAttribute('name') || '';
  const formStateWithNoReply = useCallback((state: FormState): FormState => {
    if (!noReplyFieldName) return state;
    const next = { ...state.tokens };
    delete next[noReplyFieldName];
    if (data.noReplyCheckbox?.checked) next[noReplyFieldName] = 'on';
    return { tokens: next, action: state.action };
  }, [noReplyFieldName, data.noReplyCheckbox]);

  // Track mutable postback targets (ctl indices may shift after recipient/attachment changes)
  const [sendTarget] = useState(data.sendPostbackTarget);
  const [attachPostbackTarget] = useState(data.attachPostbackTarget);
  const [attachDocIdFieldName] = useState(() =>
    data.attachDocumentIdInput?.getAttribute('name') || '',
  );

  const pictureInFlightRef = useRef<Set<string>>(new Set());
  const recipientPickerRef = useRef<HTMLDivElement>(null);
  const recipientInputRef = useRef<HTMLInputElement>(null);
  const noReplyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorSyncRef = useRef<(() => string) | null>(null);

  // Derive field names from native inputs
  const titleFieldName = data.nativeTitleInput.getAttribute('name') || '';
  const bodyFieldName = data.nativeBodyTextarea.getAttribute('name') || '';

  const normalizeRecipientName = useCallback((name: string) => (
    normalizeString(name.replace(/\s*\([^)]*\)/g, ' ').trim())
  ), []);

  const loadRecipientPicture = useCallback((contextId: string) => {
    if (!contextId) return;
    if (Object.prototype.hasOwnProperty.call(pictureByContextId, contextId)) return;
    if (pictureInFlightRef.current.has(contextId)) return;

    const preferredPictureUrl = getPictureUrlFromLookupId(studentsMap, contextId);
    if (preferredPictureUrl) {
      setPictureByContextId((prev) => ({ ...prev, [contextId]: preferredPictureUrl }));
      return;
    }

    const cached = getCachedPictureUrl(contextId);
    if (cached !== undefined) {
      setPictureByContextId((prev) => ({ ...prev, [contextId]: cached }));
      return;
    }

    pictureInFlightRef.current.add(contextId);
    fetchPictureUrl(contextId, schoolId)
      .then((url) => {
        setPictureByContextId((prev) => ({ ...prev, [contextId]: url }));
      })
      .finally(() => {
        pictureInFlightRef.current.delete(contextId);
      });
  }, [pictureByContextId, schoolId, studentsMap]);

  useEffect(() => {
    let cancelled = false;
    setRecipientDirectoryLoading(true);
    setRecipientDirectoryError(null);

    fetchBeskederRecipientItems(document)
      .then((items) => {
        if (cancelled) return;
        const parsed: ComposeRecipientOption[] = items
          .filter((item) => {
            const id = item[1];
            return typeof id === 'string' && !!id;
          })
          .map((item) => {
            const id = item[1];
            const name = (item[0]) || '';
            const shortName = (item[7] as string | null) || '';
            const longName = (item[8] as string | null) || '';
            return {
              id,
              name,
              type: id.replace(/[0-9].*$/, ''),
              searchText: normalizeString(`${name} ${shortName} ${longName}`),
            };
          })
          .filter((item) => item.name);
        setRecipientOptions(parsed);
        setRecipientDirectoryLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[BetterLectio] Failed to load recipient directory', err);
        setRecipientDirectoryLoading(false);
        setRecipientDirectoryError(t('beskeder.compose.errors.loadRecipients'));
      });

    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  // Auto-add recipient from ProfilePage "Skriv besked" flow
  useEffect(() => {
    if (recipientDirectoryLoading) return;
    const raw = sessionStorage.getItem('bl-compose-to');
    if (!raw) return;
    sessionStorage.removeItem('bl-compose-to');

    try {
      const { contextId, name: recipientName } = JSON.parse(raw);
      if (!contextId || !recipientName) return;

      // Find matching option from directory, or create a synthetic one
      const match = recipientOptions.find((o) => o.id === contextId);
      const option: ComposeRecipientOption = match || {
        id: contextId,
        name: recipientName,
        type: contextId.replace(/[0-9].*$/, ''),
        searchText: '',
      };
      handleAddRecipient(option);
    } catch {
      // Invalid JSON, already cleared
    }
  }, [recipientDirectoryLoading, recipientOptions]);

  // Hide native attach panel (we use our own file upload button)
  useEffect(() => {
    if (data.attachPanelEl) {
      data.attachPanelEl.style.display = 'none';
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

  const optionByNormalizedName = useMemo(() => {
    const map = new Map<string, ComposeRecipientOption>();
    for (const option of recipientOptions) {
      const key = normalizeRecipientName(option.name);
      if (!key || map.has(key)) continue;
      map.set(key, option);
    }
    return map;
  }, [recipientOptions, normalizeRecipientName]);

  const recipientsWithContext = useMemo(() => {
    return recipients.map((recipient) => {
      const option = optionByNormalizedName.get(normalizeRecipientName(recipient.name));
      return {
        ...recipient,
        contextId: option?.id || null,
      };
    });
  }, [recipients, optionByNormalizedName, normalizeRecipientName]);

  const recipientSuggestions = useMemo(() => {
    const query = normalizeString(recipientQuery);
    if (query.length < 2) return [];
    const queryTerms = query.split(/\s+/).filter(Boolean);
    const isMultiTermQuery = queryTerms.length >= 2;

    const alreadyChosen = new Set(recipients.map((recipient) => normalizeRecipientName(recipient.name)));
    const ranked = recipientOptions
      .filter((option) => !alreadyChosen.has(normalizeRecipientName(option.name)))
      .map((option) => {
        const displayName = getDisplayNameFromLookupId(studentsMap, option.id, option.name);
        const optionSearchText = normalizeString(`${option.searchText} ${getNameAliasesFromLookupId(studentsMap, option.id, option.name).join(' ')}`);
        const searchIndex = optionSearchText.indexOf(query);
        const matchesAllTerms = queryTerms.length > 0
          ? queryTerms.every((term) => optionSearchText.includes(term))
          : false;
        const [fuzzyMatched, fuzzyScore] = !isMultiTermQuery
          ? fuzzyMatch(query, `${displayName} ${option.name}`)
          : [false, 0];

        if (searchIndex < 0 && !matchesAllTerms && !fuzzyMatched) return null;

        let score = 0;
        if (searchIndex >= 0) {
          score = searchIndex === 0 ? 220 : 140 - searchIndex;
        } else if (matchesAllTerms) {
          // Loose multi-word matching, e.g. "Carl Meding" => "Carl Christian Meding".
          // Score tighter term placement higher.
          const firstTermIndex = optionSearchText.indexOf(queryTerms[0]);
          const lastTermIndex = optionSearchText.indexOf(queryTerms[queryTerms.length - 1]);
          const windowSize = firstTermIndex >= 0 && lastTermIndex >= 0
            ? Math.max(1, lastTermIndex - firstTermIndex + queryTerms[queryTerms.length - 1].length)
            : optionSearchText.length;
          score = 180 - windowSize * 0.15;
        } else {
          // Single-term fuzzy fallback only, with a floor to avoid weak matches.
          if (fuzzyScore < 85) return null;
          score = Math.max(60, fuzzyScore);
        }

        return { option, score };
      })
      .filter((entry): entry is { option: ComposeRecipientOption; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.option);

    return ranked;
  }, [recipientQuery, recipientOptions, recipients, normalizeRecipientName, studentsMap]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [recipientQuery]);

  useEffect(() => {
    for (const option of recipientSuggestions.slice(0, 6)) {
      if (option.id.startsWith('S') || option.id.startsWith('T')) {
        loadRecipientPicture(option.id);
      }
    }
    for (const recipient of recipientsWithContext) {
      if (recipient.contextId && (recipient.contextId.startsWith('S') || recipient.contextId.startsWith('T'))) {
        loadRecipientPicture(recipient.contextId);
      }
    }
  }, [recipientSuggestions, recipientsWithContext, loadRecipientPicture]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!recipientPickerRef.current?.contains(target)) {
        setRecipientPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const handleAddRecipient = useCallback((option: ComposeRecipientOption) => {
    if (addingRecipientId || sending) return;
    if (!data.addRecipientPostbackTarget || !data.addRecipientInputName) {
      setError(t('beskeder.compose.errors.addRecipient'));
      return;
    }

    setAddingRecipientId(option.id);
    setError(null);

    addRecipientViaIframe(
      formStateWithNoReply(formState),
      data.addRecipientPostbackTarget,
      data.addRecipientInputName,
      option.name,
      data.addRecipientHiddenInputName,
      option.id,
    ).then((result) => {
      setAddingRecipientId(null);
      if (result.success) {
        setFormState(result.formState);
        setRecipients(result.data.recipients);
        setRecipientQuery('');
        setRecipientPickerOpen(false);
        recipientInputRef.current?.focus();
      } else if (result.error.kind === 'session_expired') {
        setError(t('beskeder.errors.sessionExpired'));
      } else {
        setError(t('beskeder.compose.errors.addRecipientRetry'));
      }
    });
  }, [addingRecipientId, sending, data, formState, formStateWithNoReply]);

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

    const contextIds = recipientsWithContext
      .map((r) => r.contextId)
      .filter((id): id is string => id !== null);
    const skipSig = shouldSkipSignature(document, contextIds);

    sendMessageViaIframe(
      formStateWithNoReply(formState),
      sendTarget,
      titleFieldName,
      bodyFieldName,
      title,
      finalBody,
      skipSig,
    ).then((result) => {
      if (result.success) {
        // Signal BeskederPage to auto-open the first (newest) thread
        sessionStorage.setItem('bl-autoopen-thread', 'first');
        window.location.href = `${window.location.origin}/lectio/${schoolId}/beskeder2.aspx?mappeid=-70`;
      } else {
        setSending(false);
        setError(formatSendError(result.error, t));
      }
    });
  }, [sending, title, bodyBBCode, formState, formStateWithNoReply, sendTarget, titleFieldName, bodyFieldName, schoolId, recipientsWithContext, t]);

  const handleRemoveRecipient = useCallback((targetAndArg: string) => {
    // Format: "eventTarget:eventArgument" (e.g. "s$m$...GV:DEL$0")
    const colonIdx = targetAndArg.indexOf(':');
    if (colonIdx <= 0) return;

    const target = targetAndArg.slice(0, colonIdx);
    const argument = targetAndArg.slice(colonIdx + 1);

    setRemovingRecipient(targetAndArg);
    setError(null);

    removeRecipientViaIframe(formStateWithNoReply(formState), target, argument).then((result) => {
      setRemovingRecipient(null);
      if (result.success) {
        setFormState(result.formState);
        setRecipients(result.data.recipients);
      } else {
        if (result.error.kind === 'session_expired') {
          setError(t('beskeder.errors.sessionExpired'));
        } else {
          // Fallback to native postback (will reload)
          console.warn('[BetterLectio] Remove recipient iframe failed, falling back:', result.error);
          doPostBack(target, argument);
        }
      }
    });
  }, [formState, formStateWithNoReply]);

  const handleFileSelect = useCallback((e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    if (!attachPostbackTarget || !attachDocIdFieldName) return;

    setUploadingFileName(file.name);
    setError(null);

    uploadFileToLectio(file, schoolId)
      .then((serializedId) =>
        attachFileViaIframe(formStateWithNoReply(formState), serializedId, attachPostbackTarget, attachDocIdFieldName),
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
  }, [attachPostbackTarget, attachDocIdFieldName, schoolId, formState, formStateWithNoReply, t]);

  const handleRemoveAttachment = useCallback((file: AttachedFile, index: number) => {
    if (removingAttachIndex !== null) return;
    setRemovingAttachIndex(index);
    setError(null);

    removeAttachmentViaIframe(formStateWithNoReply(formState), file.deleteTarget, file.deleteArgument)
      .then((result) => {
        if (result.success) {
          setFormState(result.formState);
          setAttachedFiles(result.data.attachments);
        } else {
          setError(t('beskeder.errors.removeAttachment'));
        }
        setRemovingAttachIndex(null);
      });
  }, [formState, formStateWithNoReply, removingAttachIndex, t]);

  const handleRecipientInputKeyDown = useCallback((event: KeyboardEvent) => {
    if (!recipientPickerOpen && event.key !== 'Escape') {
      setRecipientPickerOpen(true);
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (recipientSuggestions.length === 0) return;
      setActiveSuggestionIndex((idx) => Math.min(idx + 1, recipientSuggestions.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (recipientSuggestions.length === 0) return;
      setActiveSuggestionIndex((idx) => Math.max(idx - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      if (!recipientPickerOpen || recipientSuggestions.length === 0) return;
      event.preventDefault();
      const option = recipientSuggestions[activeSuggestionIndex] || recipientSuggestions[0];
      if (option) handleAddRecipient(option);
      return;
    }
    if (event.key === 'Escape') {
      setRecipientPickerOpen(false);
      return;
    }
  }, [recipientPickerOpen, recipientSuggestions, activeSuggestionIndex, handleAddRecipient]);

  function getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
  }

  function getRecipientTypeLabel(id: string): string {
    if (id.startsWith('SC') || id.startsWith('K')) return t('beskeder.compose.recipientTypes.class');
    if (id.startsWith('HE') || id.startsWith('H')) return t('beskeder.compose.recipientTypes.team');
    if (id.startsWith('GE') || id.startsWith('G')) return t('beskeder.compose.recipientTypes.group');
    if (id.startsWith('RO') || id.startsWith('L')) return t('beskeder.compose.recipientTypes.room');
    if (id.startsWith('RE') || id.startsWith('R')) return t('beskeder.compose.recipientTypes.resource');
    if (id.startsWith('S')) return t('beskeder.compose.recipientTypes.student');
    if (id.startsWith('T')) return t('beskeder.compose.recipientTypes.teacher');
    return t('beskeder.compose.recipientTypes.recipient');
  }

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

  const isBusy = sending || !!uploadingFileName || removingAttachIndex !== null || !!addingRecipientId;

  return (
    <div className="mx-auto max-w-4xl space-y-3 px-10 pb-12 pt-8">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-4 mb-3">
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition-[background-color] duration-150 hover:bg-accent"
          onClick={handleBack}
          title={t('beskeder.compose.backTitle')}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold text-foreground">{t('beskeder.compose.title')}</h1>
      </div>

      {/* Card */}
      <div className="rounded-xl border border-border bg-card p-4">
        {/* Recipients field */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('beskeder.compose.recipientsLabel')}</label>
          <div className="space-y-2">
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recipientsWithContext.map((r) => (
                  (() => {
                    const displayName = r.contextId
                      ? getDisplayNameFromLookupId(studentsMap, r.contextId, r.name)
                      : r.name;
                    return (
                  <span
                    key={r.removePostbackTarget}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.08] px-2 py-1',
                      removingRecipient === r.removePostbackTarget && 'opacity-60',
                    )}
                  >
                    <span className="inline-flex size-5 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                      {r.contextId && pictureByContextId[r.contextId] ? (
                        <img
                          src={pictureByContextId[r.contextId] as string}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover object-top"
                        />
                      ) : (
                        getInitials(r.name)
                      )}
                    </span>
                    <span className="text-xs font-medium text-foreground">{displayName}</span>
                    {r.removePostbackTarget && (
                      <button
                        type="button"
                        className="inline-flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent hover:text-foreground"
                        onClick={() => handleRemoveRecipient(r.removePostbackTarget)}
                        disabled={!!removingRecipient}
                        title={t('beskeder.compose.removeRecipient', { name: displayName })}
                      >
                        {removingRecipient === r.removePostbackTarget
                          ? <Loader2 size={13} className="animate-spin" />
                          : <X size={13} />
                        }
                      </button>
                    )}
                  </span>
                    );
                  })()
                ))}
              </div>
            )}

            <div
              ref={recipientPickerRef}
              className="relative"
            >
              <div className={cn(
                'relative rounded-lg border border-border bg-muted/30 transition',
                recipientPickerOpen && 'border-primary/30',
              )}>
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={recipientInputRef}
                  type="text"
                  className="h-10 w-full rounded-lg border-0 bg-transparent pl-9 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-0"
                  value={recipientQuery}
                  onInput={(e) => setRecipientQuery((e.target as HTMLInputElement).value)}
                  onFocus={() => setRecipientPickerOpen(true)}
                  onKeyDown={handleRecipientInputKeyDown}
                  placeholder={t('beskeder.compose.recipientSearchPlaceholder')}
                  autoComplete="off"
                  spellcheck={false}
                />
                {addingRecipientId && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>

              {recipientPickerOpen && (
                <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-full rounded-lg border border-border bg-popover p-1 shadow-[0_4px_16px_oklch(0_0_0/0.08),0_1px_3px_oklch(0_0_0/0.04)]">
                  {recipientDirectoryLoading && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      <span>{t('beskeder.compose.loadingRecipients')}</span>
                    </div>
                  )}
                  {!recipientDirectoryLoading && recipientDirectoryError && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {recipientDirectoryError}
                    </div>
                  )}
                  {!recipientDirectoryLoading && !recipientDirectoryError && normalizeString(recipientQuery).length < 2 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {t('beskeder.compose.minCharsHint')}
                    </div>
                  )}
                  {!recipientDirectoryLoading && !recipientDirectoryError && normalizeString(recipientQuery).length >= 2 && recipientSuggestions.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {t('beskeder.compose.noResults')}
                    </div>
                  )}
                  {recipientSuggestions.map((option, index) => (
                    (() => {
                      const displayName = getDisplayNameFromLookupId(studentsMap, option.id, option.name);
                      return (
                    <button
                      key={option.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md !border-0 px-2 py-1.5 text-left hover:bg-accent',
                        index === activeSuggestionIndex && 'bg-accent',
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAddRecipient(option)}
                      disabled={!!addingRecipientId}
                      >
                      <span className="inline-flex size-7 items-center justify-center overflow-hidden rounded-full !border-0 bg-muted text-muted-foreground">
                        {pictureByContextId[option.id] ? (
                          <img
                            src={pictureByContextId[option.id] as string}
                            alt=""
                            loading="lazy"
                            className="size-full !border-0 object-cover object-top"
                          />
                        ) : (
                          <UserRound size={14} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{displayName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {getRecipientTypeLabel(option.id)}
                        </span>
                      </span>
                    </button>
                      );
                    })()
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* No-reply toggle */}
        {data.noReplyCheckbox && (
          <div className="mt-3">
            <div
              ref={noReplyRef}
              className="[&_label]:inline-flex [&_label]:items-center [&_label]:gap-2 [&_label]:text-sm [&_label]:text-foreground [&_input[type='checkbox']]:size-4"
            />
          </div>
        )}

        {/* Subject field */}
        <div className="mt-3 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('beskeder.compose.subjectLabel')}</label>
          <input
            type="text"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            value={title}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            placeholder={t('beskeder.compose.titlePlaceholder')}
            maxLength={100}
          />
        </div>

        {/* Body field with WYSIWYG editor */}
        <div className="mt-3" id="bl-compose-editor">
          <WysiwygEditor
            initialBBCode={data.currentBody}
            onBBCodeChange={setBodyBBCode}
            placeholder={t('beskeder.compose.bodyPlaceholder')}
            onSubmit={handleSend}
            syncRef={editorSyncRef}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        {/* Attached files */}
        {attachedFiles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {attachedFiles.map((file, i) => (
              <span key={`${file.deleteArgument}-${i}`} className="inline-flex items-center gap-1.5 rounded-md bg-primary/8 px-2 py-1 text-xs text-foreground">
                {removingAttachIndex === i ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Paperclip size={12} />
                )}
                <span>{file.name}</span>
                <button
                  type="button"
                  className="inline-flex size-5 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent hover:text-foreground"
                  onClick={() => handleRemoveAttachment(file, i)}
                  disabled={removingAttachIndex !== null}
                  title={t('beskeder.compose.removeAttachmentTitle')}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
          <div className="inline-flex items-center gap-2">
            {attachPostbackTarget && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  onChange={handleFileSelect}
                />
                {uploadingFileName ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    <span>{t('beskeder.compose.uploading', { fileName: uploadingFileName })}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-[border-color,color] duration-150 hover:border-foreground hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    title={t('beskeder.compose.attachFileTitle')}
                  >
                    <Paperclip size={14} />
                    <span>{t('beskeder.compose.attachFile')}</span>
                  </button>
                )}
              </>
            )}
          </div>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium transition-[background-color] duration-150 hover:bg-accent"
              onClick={handleBack}
            >
              {t('beskeder.compose.cancel')}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border-0 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              onClick={handleSend}
              disabled={isBusy}
              title={t('beskeder.compose.sendTitle')}
            >
              <Send size={15} />
              <span>{sending ? t('beskeder.compose.sending') : t('beskeder.compose.send')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Legacy: enhance native compose form (fallback). */
export function enhanceComposeForm(): void {
  document.body.classList.add('bl-beskeder-compose-active');
  console.warn('[BetterLectio] Compose fallback: native form shown');
}
