import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { AlertTriangle, ExternalLink, RefreshCw, X } from "lucide-react";
import { watchCKEditorDarkMode } from "@/lib/ckeditor-dark";
import {
  ELEVFEEDBACK_FRAME_NAME,
  clickElevfeedbackEdit,
  confirmElevfeedbackLeave,
  getElevfeedbackFrameState,
  notifyElevfeedbackUpdated,
  prepareElevfeedbackIframeDocument,
} from "@/lib/elevfeedback";
import { useTranslation } from "@/lib/i18n";

interface ElevfeedbackEditorOverlayProps {
  open: boolean;
  url: string | null;
  onOpenChange: (open: boolean) => void;
}

type FrameFailure = "timeout" | "session-expired" | "unexpected";

const LOAD_TIMEOUT_MS = 15_000;
const EDITOR_FALLBACK_MS = 8_000;

export function ElevfeedbackEditorOverlay({ open, url, onOpenChange }: ElevfeedbackEditorOverlayProps) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const autoEditRef = useRef(false);
  const sawEditRef = useRef(false);
  const closingRef = useRef(false);
  const darkModeObserverRef = useRef<MutationObserver | null>(null);
  const readinessObserverRef = useRef<MutationObserver | null>(null);
  const frameKeydownCleanupRef = useRef<(() => void) | null>(null);
  const readinessTimerRef = useRef<number | null>(null);
  const loadTimerRef = useRef<number | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [failure, setFailure] = useState<FrameFailure | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const clearFrameWatchers = () => {
    darkModeObserverRef.current?.disconnect();
    darkModeObserverRef.current = null;
    readinessObserverRef.current?.disconnect();
    readinessObserverRef.current = null;
    frameKeydownCleanupRef.current?.();
    frameKeydownCleanupRef.current = null;
    if (readinessTimerRef.current !== null) window.clearTimeout(readinessTimerRef.current);
    readinessTimerRef.current = null;
    if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
    loadTimerRef.current = null;
  };

  const markLoading = () => {
    setFrameReady(false);
    setFailure(null);
    if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
    loadTimerRef.current = window.setTimeout(() => {
      setFailure("timeout");
      setFrameReady(false);
    }, LOAD_TIMEOUT_MS);
  };

  const markReady = () => {
    if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
    loadTimerRef.current = null;
    setFailure(null);
    setFrameReady(true);
  };

  const markFailed = (nextFailure: FrameFailure) => {
    if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
    loadTimerRef.current = null;
    setFrameReady(false);
    setFailure(nextFailure);
  };

  useEffect(() => {
    if (!open) {
      autoEditRef.current = false;
      sawEditRef.current = false;
      closingRef.current = false;
      setFrameReady(false);
      setFailure(null);
      setRetryKey(0);
      clearFrameWatchers();
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    markLoading();
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      clearFrameWatchers();
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, url]);

  const requestClose = () => {
    if (closingRef.current) return;
    const win = iframeRef.current?.contentWindow;
    if (win && !confirmElevfeedbackLeave(win, t("activityModal.elevfeedbackCloseConfirm"))) return;
    closingRef.current = true;
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, url]);

  const finishAfterSave = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (url) notifyElevfeedbackUpdated(url);
    onOpenChange(false);
  };

  const revealWhenEditorReady = (doc: Document) => {
    readinessObserverRef.current?.disconnect();
    if (readinessTimerRef.current !== null) window.clearTimeout(readinessTimerRef.current);

    const reveal = () => {
      readinessObserverRef.current?.disconnect();
      readinessObserverRef.current = null;
      if (readinessTimerRef.current !== null) window.clearTimeout(readinessTimerRef.current);
      readinessTimerRef.current = null;
      markReady();
    };

    if (doc.querySelector(".cke, .cke_wysiwyg_frame")) {
      reveal();
      return;
    }

    const observer = new MutationObserver(() => {
      if (doc.querySelector(".cke, .cke_wysiwyg_frame")) reveal();
    });
    readinessObserverRef.current = observer;
    observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });

    // Lectio occasionally fails to initialize CKEditor while leaving its plain
    // textarea usable. Reveal that native fallback instead of trapping users
    // behind an endless skeleton.
    readinessTimerRef.current = window.setTimeout(reveal, EDITOR_FALLBACK_MS);
  };

  const handleFrameLoad = () => {
    if (closingRef.current) return;
    const iframe = iframeRef.current;
    let doc: Document | null = null;
    try {
      doc = iframe?.contentDocument ?? null;
    } catch {
      markFailed("unexpected");
      return;
    }
    if (!iframe || !doc) {
      markFailed("unexpected");
      return;
    }

    const state = getElevfeedbackFrameState(doc);
    if (state === "session-expired") {
      markFailed("session-expired");
      return;
    }
    if (state === "unexpected") {
      markFailed("unexpected");
      return;
    }
    if (state === "loading") {
      markLoading();
      return;
    }

    const dark = document.documentElement.classList.contains("dark");
    prepareElevfeedbackIframeDocument(doc, dark);
    darkModeObserverRef.current?.disconnect();
    darkModeObserverRef.current = dark ? watchCKEditorDarkMode(doc) : null;
    frameKeydownCleanupRef.current?.();
    const onFrameKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const frameWindow = doc.defaultView;
      const hasOpenEditorDialog = Array.from(doc.querySelectorAll<HTMLElement>(".cke_dialog")).some((dialog) => {
        if (dialog.hidden || dialog.getAttribute("aria-hidden") === "true") return false;
        const style = frameWindow?.getComputedStyle(dialog);
        return style?.display !== "none" && style?.visibility !== "hidden";
      });
      if (hasOpenEditorDialog) return;
      event.preventDefault();
      requestClose();
    };
    doc.addEventListener("keydown", onFrameKeyDown);
    frameKeydownCleanupRef.current = () => doc.removeEventListener("keydown", onFrameKeyDown);
    doc.defaultView?.addEventListener(
      "unload",
      () => {
        if (!closingRef.current) markLoading();
      },
      { once: true },
    );

    if (state === "edit") {
      sawEditRef.current = true;
      revealWhenEditorReady(doc);
      return;
    }

    if (sawEditRef.current) {
      finishAfterSave();
      return;
    }

    if (!autoEditRef.current) {
      autoEditRef.current = true;
      markLoading();
      if (clickElevfeedbackEdit(doc)) return;
    }

    markFailed("unexpected");
  };

  const retry = () => {
    clearFrameWatchers();
    autoEditRef.current = false;
    sawEditRef.current = false;
    markLoading();
    setRetryKey((value) => value + 1);
  };

  if (!open || !url) return null;

  const portalTarget = document.getElementById("il-root") || document.body;
  const failureMessage =
    failure === "session-expired"
      ? t("activityModal.elevfeedbackSessionExpired")
      : failure === "timeout"
        ? t("activityModal.elevfeedbackLoadTimeout")
        : t("activityModal.elevfeedbackEditorError");

  return createPortal(
    <div
      className="fixed inset-0 z-220 flex items-center justify-center pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bl-elevfeedback-editor-title"
      aria-describedby={failure ? "bl-elevfeedback-editor-error" : undefined}
    >
      <div
        className="absolute inset-0 bg-[oklch(0_0_0/0.55)] backdrop-blur-md animate-[act-sheet-fade-in_0.18s_ease-out]"
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        className="relative flex h-[min(92dvh,56rem)] w-[min(96vw,72rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-[0_24px_80px_oklch(0_0_0/0.28)] animate-[act-sheet-fade-in_0.2s_ease] dark:shadow-[0_24px_80px_oklch(0_0_0/0.55)] max-[720px]:h-[100dvh] max-[720px]:w-screen max-[720px]:rounded-none"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("activityModal.elevfeedback")}
            </p>
            <h2 id="bl-elevfeedback-editor-title" className="m-0 text-base font-semibold text-foreground">
              {t("activityModal.elevfeedbackEditorAria")}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            className="inline-flex size-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-[background-color,color] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={t("activityModal.elevfeedbackCloseEditor")}
          >
            <X size={18} />
          </button>
        </header>
        <div className="relative min-h-0 flex-1 bg-background">
          {!frameReady && !failure ? (
            <div className="absolute inset-0 z-2 flex flex-col items-center justify-center gap-3 bg-background p-6" role="status">
              <RefreshCw className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
              <p className="m-0 text-sm text-muted-foreground">{t("activityModal.elevfeedbackLoading")}</p>
            </div>
          ) : null}
          {failure ? (
            <div className="absolute inset-0 z-3 flex items-center justify-center bg-background p-6">
              <div className="flex max-w-md flex-col items-center gap-4 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-5" aria-hidden="true" />
                </span>
                <p id="bl-elevfeedback-editor-error" className="m-0 text-sm leading-relaxed text-muted-foreground">
                  {failureMessage}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={retry}
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    {t("activityModal.retry")}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                    {t("activityModal.openInLectio")}
                  </a>
                </div>
              </div>
            </div>
          ) : null}
          <iframe
            key={retryKey}
            ref={iframeRef}
            name={ELEVFEEDBACK_FRAME_NAME}
            src={url}
            title={t("activityModal.elevfeedbackEditorAria")}
            className={`h-full w-full border-0 bg-background transition-opacity duration-150 ${frameReady ? "opacity-100" : "pointer-events-none opacity-0"}`}
            onLoad={handleFrameLoad}
          />
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
