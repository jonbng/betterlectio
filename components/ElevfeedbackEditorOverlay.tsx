import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { X } from "lucide-react";
import { watchCKEditorDarkMode } from "@/lib/ckeditor-dark";
import {
  ELEVFEEDBACK_FRAME_NAME,
  clickElevfeedbackEdit,
  confirmElevfeedbackLeave,
  isElevfeedbackEditMode,
  isElevfeedbackViewMode,
  notifyElevfeedbackUpdated,
  prepareElevfeedbackIframeDocument,
} from "@/lib/elevfeedback";
import { useTranslation } from "@/lib/i18n";

interface ElevfeedbackEditorOverlayProps {
  open: boolean;
  url: string | null;
  onOpenChange: (open: boolean) => void;
}

export function ElevfeedbackEditorOverlay({ open, url, onOpenChange }: ElevfeedbackEditorOverlayProps) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const autoEditRef = useRef(false);
  const sawEditRef = useRef(false);
  const closingRef = useRef(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    if (!open) {
      autoEditRef.current = false;
      sawEditRef.current = false;
      closingRef.current = false;
      setFrameReady(false);
      observerRef.current?.disconnect();
      observerRef.current = null;
    }
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      void requestClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  const requestClose = () => {
    if (closingRef.current) return;
    const win = iframeRef.current?.contentWindow;
    if (win && !confirmElevfeedbackLeave(win)) return;
    closingRef.current = true;
    if (url) notifyElevfeedbackUpdated(url);
    onOpenChange(false);
  };

  const handleFrameLoad = () => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc || closingRef.current) return;

    const dark = document.documentElement.classList.contains("dark");
    prepareElevfeedbackIframeDocument(doc, dark);
    observerRef.current?.disconnect();
    observerRef.current = dark ? watchCKEditorDarkMode(doc) : null;
    doc.defaultView?.addEventListener("unload", () => setFrameReady(false), { once: true });

    if (isElevfeedbackEditMode(doc)) {
      sawEditRef.current = true;
      revealWhenEditorReady(doc);
      return;
    }

    if (!autoEditRef.current && isElevfeedbackViewMode(doc)) {
      autoEditRef.current = true;
      if (clickElevfeedbackEdit(doc)) return;
    }

    setFrameReady(true);

    if (sawEditRef.current && isElevfeedbackViewMode(doc)) {
      if (url) notifyElevfeedbackUpdated(url);
      onOpenChange(false);
    }
  };

  const revealWhenEditorReady = (doc: Document) => {
    if (doc.querySelector(".cke, .cke_wysiwyg_frame")) {
      setFrameReady(true);
      return;
    }
    const observer = new MutationObserver(() => {
      if (!doc.querySelector(".cke, .cke_wysiwyg_frame")) return;
      observer.disconnect();
      setFrameReady(true);
    });
    observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      setFrameReady(true);
    }, 2000);
  };

  if (!open || !url) return null;

  const portalTarget = document.getElementById("il-root") || document.body;

  return createPortal(
    <div
      className="fixed inset-0 z-220 flex items-center justify-center pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t("activityModal.elevfeedbackEditorAria")}
    >
      <div
        className="absolute inset-0 bg-[oklch(0_0_0/0.55)] backdrop-blur-md animate-[act-sheet-fade-in_0.18s_ease-out]"
        onClick={() => void requestClose()}
        aria-hidden="true"
      />
      <div
        className="relative flex h-[min(92vh,56rem)] w-[min(96vw,72rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-[0_24px_80px_oklch(0_0_0/0.28)] animate-[act-sheet-fade-in_0.2s_ease] dark:shadow-[0_24px_80px_oklch(0_0_0/0.55)] max-[720px]:h-[100dvh] max-[720px]:w-screen max-[720px]:rounded-none"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("activityModal.elevfeedback")}
            </p>
            <h2 className="m-0 text-base font-semibold text-foreground">{t("activityModal.elevfeedbackEditorAria")}</h2>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-[background-color,color] duration-150 hover:bg-muted hover:text-foreground"
            aria-label={t("activityModal.elevfeedbackCloseEditor")}
          >
            <X size={17} />
          </button>
        </header>
        <div className="relative min-h-0 flex-1 bg-background">
          {!frameReady ? (
            <div className="absolute inset-0 z-2 flex flex-col gap-3 bg-background p-6">
              <div className="h-10 w-1/3 rounded-lg bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
              <div className="h-full rounded-xl bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
            </div>
          ) : null}
          <iframe
            ref={iframeRef}
            name={ELEVFEEDBACK_FRAME_NAME}
            src={url}
            title={t("activityModal.elevfeedbackEditorAria")}
            className={`h-full w-full border-0 bg-background ${frameReady ? "opacity-100" : "pointer-events-none opacity-0"}`}
            onLoad={handleFrameLoad}
          />
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
