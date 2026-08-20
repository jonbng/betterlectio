import { captureException } from "./posthog";
import type { ActivityTabLink } from "./activity-detail";

export interface ActivityElevfeedbackRef {
  url: string;
  empty: boolean;
}

export interface ElevfeedbackSectionBlock {
  id: string;
  kind: "teacher" | "student";
  authorName: string;
  authorLookupId: string | null;
  contentHtml: string;
}

export interface ElevfeedbackDetail {
  url: string;
  writable: boolean;
  empty: boolean;
  sections: ElevfeedbackSectionBlock[];
}

export function isElevfeedbackTab(tab: ActivityTabLink): boolean {
  if (tab.url) {
    try {
      const parsed = new URL(tab.url, window.location.origin);
      if (parsed.searchParams.get("lectab") === "elevindhold") return true;
    } catch {
      /* ignore */
    }
  }
  return /^Elevfeedback/i.test(tab.label);
}

export function activityTabsExcludingElevfeedback(tabs: ActivityTabLink[]): ActivityTabLink[] {
  return tabs.filter((tab) => !isElevfeedbackTab(tab));
}

function isElevfeedbackHref(href: string): boolean {
  if (!href || href === "#") return false;
  try {
    return new URL(href, window.location.origin).searchParams.get("lectab") === "elevindhold";
  } catch {
    return /lectab=elevindhold/i.test(href);
  }
}

function isEmptyHtml(html: string): boolean {
  const stripped = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length === 0;
}

function sanitizeFragment(fragmentRoot: ParentNode): void {
  fragmentRoot.querySelectorAll("script").forEach((node) => node.remove());

  fragmentRoot.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const attrName = attr.name.toLowerCase();
      const value = attr.value;

      if (attrName.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }

      if ((attrName === "href" || attrName === "src") && value) {
        try {
          const absolute = new URL(value, window.location.origin);
          if (!["http:", "https:"].includes(absolute.protocol)) {
            el.removeAttribute(attr.name);
          } else {
            el.setAttribute(attr.name, absolute.href);
          }
        } catch {
          el.removeAttribute(attr.name);
        }
      }
    }

    if (el.style.backgroundImage) {
      el.style.backgroundImage = "";
    }
  });
}

/** Detect the Elevfeedback tab/TOC link on an Indhold activity page. */
export function parseElevfeedbackRef(doc: Document, pageUrl: string): ActivityElevfeedbackRef | null {
  const page = new URL(pageUrl, window.location.origin);
  let url = "";
  let empty = true;
  let found = false;

  const consider = (href: string, label: string, fromToc: boolean) => {
    const isElev = isElevfeedbackHref(href) || /^Elevfeedback/i.test(label);
    if (!isElev) return;
    found = true;
    if (href && href !== "#") {
      try {
        url = new URL(href, page).href;
      } catch {
        /* ignore */
      }
    }
    if (/\(\s*ingen\s*\)/i.test(label)) {
      empty = true;
    } else if (fromToc && /^Elevfeedback/i.test(label)) {
      empty = false;
    }
  };

  doc.querySelectorAll<HTMLAnchorElement>(".lectioTabToolbar a").forEach((anchor) => {
    consider(anchor.getAttribute("href") || "", anchor.textContent?.replace(/\s+/g, " ").trim() || "", false);
  });

  doc.querySelectorAll<HTMLElement>(".ls-homework-toc").forEach((toc) => {
    const label = toc.textContent?.replace(/\s+/g, " ").trim() || "";
    const href = toc.querySelector<HTMLAnchorElement>("a[href]")?.getAttribute("href") || "";
    consider(href, label, true);
  });

  if (!url && page.searchParams.get("lectab") === "elevindhold") {
    url = page.href;
    found = true;
  }

  if (!url && found) {
    const fallback = new URL(page.href);
    fallback.searchParams.set("lectab", "elevindhold");
    url = fallback.href;
  }

  if (!url) return null;
  return { url, empty };
}

function headingKind(heading: HTMLElement): {
  kind: "teacher" | "student";
  authorName: string;
  authorLookupId: string | null;
} {
  const studentCard = heading.querySelector<HTMLElement>("[data-lectiocontextcard^='S']");
  const lookupId = studentCard?.getAttribute("data-lectiocontextcard") || null;
  const name = (studentCard?.textContent || heading.textContent || "").replace(/\s+/g, " ").trim();
  if (lookupId) {
    return { kind: "student", authorName: name, authorLookupId: lookupId };
  }
  if (/^lærer/i.test(name) || !studentCard) {
    return { kind: "teacher", authorName: name || "Lærer", authorLookupId: null };
  }
  return { kind: "student", authorName: name, authorLookupId: null };
}

function contentFromPaper(paper: HTMLElement): string {
  const clone = paper.cloneNode(true) as HTMLElement;
  clone.querySelector(".ls-section-subgroup-heading")?.remove();
  clone.querySelectorAll("textarea, .cke, .alert, .nb_type_information").forEach((el) => el.remove());
  sanitizeFragment(clone);
  return clone.innerHTML.trim();
}

function parsePaperSections(container: HTMLElement): ElevfeedbackSectionBlock[] {
  const papers = Array.from(container.querySelectorAll<HTMLElement>(".ls-paper, .elevindholdContainer"));
  const sections: ElevfeedbackSectionBlock[] = [];
  const seen = new Set<HTMLElement>();

  for (const [index, paper] of papers.entries()) {
    const root =
      paper.classList.contains("elevindholdContainer") && paper.closest<HTMLElement>(".ls-paper")
        ? paper.closest<HTMLElement>(".ls-paper")!
        : paper;
    if (seen.has(root)) continue;
    seen.add(root);

    const heading =
      root.querySelector<HTMLElement>(".ls-section-subgroup-heading") ||
      root.querySelector<HTMLElement>("[data-lectiocontextcard^='S']")?.closest<HTMLElement>("div, h1, h2, h3, h4") ||
      null;

    const html = contentFromPaper(root);
    if (isEmptyHtml(html)) continue;

    const meta = heading
      ? headingKind(heading)
      : { kind: "student" as const, authorName: "", authorLookupId: null };

    sections.push({
      id: root.id || `elevfeedback-${index + 1}`,
      kind: meta.kind,
      authorName: meta.authorName,
      authorLookupId: meta.authorLookupId,
      contentHtml: html,
    });
  }

  return sections;
}

function parseArticleSections(container: HTMLElement): ElevfeedbackSectionBlock[] {
  const articles = Array.from(container.querySelectorAll<HTMLElement>("article"));
  return articles.flatMap((article, index) => {
    const clone = article.cloneNode(true) as HTMLElement;
    sanitizeFragment(clone);
    const html = clone.innerHTML.trim();
    if (isEmptyHtml(html)) return [];
    const heading = article.querySelector<HTMLElement>("h1, h2, h3, .ls-section-subgroup-heading");
    const meta = heading
      ? headingKind(heading)
      : { kind: "student" as const, authorName: "", authorLookupId: null };
    return [
      {
        id: article.id || `elevfeedback-article-${index + 1}`,
        kind: meta.kind,
        authorName: meta.authorName,
        authorLookupId: meta.authorLookupId,
        contentHtml: html,
      },
    ];
  });
}

function parseElevfeedbackDetail(doc: Document, url: string): ElevfeedbackDetail {
  const writable = !!doc.querySelector(
    "#s_m_Content_Content_Elevindhold_tocAndToolbar_editModeBtn, [id$='_editModeBtn']",
  );

  const paperRoot =
    doc.querySelector<HTMLElement>("#s_m_Content_Content_Elevindhold_tocAndToolbar_inlineHomeworkDiv") ||
    doc.querySelector<HTMLElement>("#ElevContentContainer");

  let sections = paperRoot ? parsePaperSections(paperRoot) : [];
  if (sections.length === 0 && paperRoot) {
    sections = parseArticleSections(paperRoot);
  }

  const teacher = sections.filter((section) => section.kind === "teacher");
  const students = sections.filter((section) => section.kind === "student");

  return {
    url,
    writable,
    empty: sections.length === 0,
    sections: [...teacher, ...students],
  };
}

function ensureElevfeedbackDoc(doc: Document): void {
  const hasRoot =
    !!doc.querySelector("#ElevContentContainer") ||
    !!doc.querySelector("[id*='Elevindhold']") ||
    !!doc.querySelector(".lectioTabToolbar");
  if (!hasRoot) {
    throw new Error("SESSION_EXPIRED");
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === "AbortError"
    : err instanceof Error && err.name === "AbortError";
}

export async function fetchElevfeedback(url: string, signal?: AbortSignal): Promise<ElevfeedbackDetail> {
  try {
    const absolute = new URL(url, window.location.origin).href;
    const response = await fetch(absolute, { credentials: "include", signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch elevfeedback (${response.status})`);
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    ensureElevfeedbackDoc(doc);
    return parseElevfeedbackDetail(doc, response.url || absolute);
  } catch (err) {
    if (err instanceof Error && err.message === "SESSION_EXPIRED") throw err;
    if (!isAbortError(err)) {
      captureException(err, undefined, { source: "elevfeedback", url });
    }
    throw err;
  }
}

export {
  ELEVFEEDBACK_FRAME_NAME,
  prepareElevfeedbackIframeDocument,
} from "./elevfeedback-frame";

export function isElevfeedbackViewMode(doc: Document): boolean {
  return !!doc.querySelector(
    "#s_m_Content_Content_Elevindhold_tocAndToolbar_editModeBtn, [id$='_editModeBtn']",
  );
}

export function isElevfeedbackEditMode(doc: Document): boolean {
  return !!doc.querySelector("textarea[lectio-role='editor-textarea']");
}

export function clickElevfeedbackEdit(doc: Document): boolean {
  const button = doc.querySelector<HTMLElement>(
    "#s_m_Content_Content_Elevindhold_tocAndToolbar_editModeBtn, [id$='_editModeBtn']",
  );
  if (!button) return false;
  button.click();
  return true;
}

export function confirmElevfeedbackLeave(win: Window): boolean {
  const editor = (win as Window & {
    LCDocumentEditor?: { ConfirmEditorDirtyAndNotSaving?: () => boolean };
  }).LCDocumentEditor;
  if (typeof editor?.ConfirmEditorDirtyAndNotSaving === "function") {
    return editor.ConfirmEditorDirtyAndNotSaving();
  }
  return true;
}

export function notifyElevfeedbackUpdated(url: string): void {
  window.dispatchEvent(
    new CustomEvent("betterlectio:elevfeedback-updated", { detail: { url } }),
  );
}

export function openElevfeedbackEditor(url: string): void {
  window.dispatchEvent(
    new CustomEvent("betterlectio:openElevfeedbackEditor", { detail: { url } }),
  );
}

