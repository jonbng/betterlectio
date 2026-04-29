import { useEffect, useState } from "preact/hooks";
import { Download, FileImage, FileText, Loader2, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface LightboxItem {
  url: string;
  name: string;
  sizeLabel?: string;
  ext: string;
  kind: "image" | "pdf";
}

const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
  "heic",
  "heif",
]);

export function isLightboxableExtension(ext: string): boolean {
  const e = ext.toLowerCase().replace(/^\./, "");
  return e === "pdf" || IMAGE_EXTS.has(e);
}

export function lightboxKindForExtension(ext: string): "image" | "pdf" | null {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "pdf") return "pdf";
  if (IMAGE_EXTS.has(e)) return "image";
  return null;
}

export function extensionFromUrlOrName(input: string): string {
  const cleaned = input.split("?")[0].split("#")[0];
  const tail = cleaned.split("/").pop() || cleaned;
  const dot = tail.lastIndexOf(".");
  if (dot < 0 || dot === tail.length - 1) return "";
  return tail.slice(dot + 1).toLowerCase();
}

/** Fetch the PDF as a blob so we can iframe it without `Content-Disposition: attachment` forcing a download. */
function PdfPreview({ url, title }: { url: string; title: string }) {
  const { t } = useTranslation();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    let createdBlobUrl: string | null = null;
    fetch(url, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch PDF");
        return r.blob();
      })
      .then((blob) => {
        if (revoked) return;
        createdBlobUrl = URL.createObjectURL(blob);
        setBlobUrl(createdBlobUrl);
      })
      .catch(() => setError(true));

    return () => {
      revoked = true;
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
    };
  }, [url]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-8">
        <FileText size={48} className="text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t("beskeder.thread.pdfLoadError")}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-[color,background-color] duration-150"
        >
          <Download size={14} />
          {t("beskeder.thread.downloadInstead")}
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

  return <iframe src={blobUrl} className="w-full h-full rounded-lg border" title={title} />;
}

interface LightboxProps {
  item: LightboxItem | null;
  onClose: () => void;
}

export function Lightbox({ item, onClose }: LightboxProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!item) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      className="animate-[lightbox-fade-in_0.15s_ease-out] fixed inset-0 z-200 flex cursor-pointer items-center justify-center bg-[oklch(0_0_0/0.6)] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <div
        className={cn(
          "animate-[lightbox-scale-in_0.2s_ease-out] flex cursor-default flex-col overflow-hidden rounded-xl bg-card shadow-[0_24px_80px_-12px_oklch(0_0_0/0.5),0_0_0_1px_oklch(1_0_0/0.08)]",
          item.kind === "pdf"
            ? "w-[95vw] max-w-[1200px] h-[92vh]"
            : "max-h-[85vh] max-w-[min(85vw,900px)]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {item.kind === "pdf" ? (
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-0">
            <PdfPreview url={item.url} title={item.name} />
          </div>
        ) : (
          <img
            src={item.url}
            alt={item.name}
            className="block max-h-[calc(85vh-3rem)] max-w-full object-contain bg-[oklch(0.12_0_0)]"
          />
        )}
        <div className="flex min-h-11 items-center gap-2 border-t border-border/50 px-3 py-2">
          {item.kind === "pdf" ? (
            <FileText size={15} className="shrink-0 text-[oklch(0.54_0.13_265)]" />
          ) : (
            <FileImage size={15} className="shrink-0 text-[oklch(0.59_0.11_215)]" />
          )}
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
            {(item.sizeLabel || item.ext) && (
              <span className="block text-xs font-medium uppercase tracking-[0.01em] text-muted-foreground">
                {item.sizeLabel || item.ext.toUpperCase()}
              </span>
            )}
          </div>
          <a
            href={item.url}
            download={item.name}
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
            onClick={onClose}
            title={t("beskeder.thread.close")}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
