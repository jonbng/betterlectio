import { captureException } from './posthog';

export interface ActivityTabLink {
  label: string;
  url: string;
  active: boolean;
}

export interface ActivityPhase {
  title: string;
  url: string;
}

export interface ActivityHomeworkLink {
  label: string;
  url: string;
  type: "file" | "external" | "internal";
}

export interface ActivityHomeworkImage {
  src: string;
  alt: string;
}

export interface ActivityHomeworkItem {
  id: string;
  title: string;
  contentHtml: string;
  links: ActivityHomeworkLink[];
  /** When the heading is a single link, the title becomes clickable and this link is excluded from `links` to avoid duplication. */
  primaryLink?: ActivityHomeworkLink;
  /** When the body content is essentially a single image, we render it as a preview and exclude it from `contentHtml`. */
  image?: ActivityHomeworkImage;
}

export interface ActivityRelatedItem {
  label: string;
  url: string | null;
  iconUrl: string | null;
}

export type ActivityStatus = "normal" | "cancelled" | "changed" | "moved";

export interface ActivityTeacherRef {
  id: string;
  initials: string;
}

export interface ActivityMeta {
  title: string;
  dateText: string;
  timeText: string;
  hold: string;
  holdId: string | null;
  teacher: string;
  teachers: ActivityTeacherRef[];
  room: string;
  roomId: string | null;
  moduleText: string;
  status: ActivityStatus;
}

export interface ActivityNavigation {
  schedule: {
    label: string;
    prevEventTarget: string | null;
    nextEventTarget: string | null;
  };
  hold: {
    prevEventTarget: string | null;
    nextEventTarget: string | null;
    listUrl: string | null;
  };
}

export interface ActivityFormTokens {
  action: string;
  hiddenFields: Record<string, string>;
}

export interface ActivityDetail {
  url: string;
  absid: string | null;
  meta: ActivityMeta;
  note: string;
  tabs: ActivityTabLink[];
  phase: ActivityPhase | null;
  homework: ActivityHomeworkItem[];
  presentation: ActivityHomeworkItem[];
  otherContent: ActivityHomeworkItem[];
  related: ActivityRelatedItem[];
  navigation: ActivityNavigation;
  formTokens: ActivityFormTokens;
}

function sanitizeActivityHtml(fragmentRoot: ParentNode): void {
  const scripts = fragmentRoot.querySelectorAll("script");
  scripts.forEach((node) => node.remove());

  const allElements = fragmentRoot.querySelectorAll<HTMLElement>("*");
  allElements.forEach((el) => {
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

    // Strip Lectio's background-image doc icons (e.g. url(/lectio/img/doc-homework.auto))
    // These tile/repeat and look broken outside Lectio's native CSS
    if (el.style.backgroundImage) {
      el.style.backgroundImage = "";
    }
  });
}

function parseTooltipMeta(rawTooltip: string | null): Partial<ActivityMeta> {
  if (!rawTooltip) return {};

  const lines = rawTooltip
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let cursor = 0;
  let title = "";

  if (lines[0] && !/^\d{1,2}\/\d{1,2}-\d{4}/.test(lines[0])) {
    title = lines[0];
    cursor = 1;
  }

  let dateText = "";
  let timeText = "";
  const dateLine = lines[cursor];
  if (dateLine) {
    const match = dateLine.match(/^(\d{1,2}\/\d{1,2}-\d{4})\s+(.+)$/);
    if (match) {
      dateText = match[1];
      timeText = match[2];
      cursor += 1;
    }
  }

  let hold = "";
  let teacher = "";
  let room = "";

  for (let i = cursor; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("Hold: ")) hold = line.slice(6).trim();
    if (line.startsWith("Lærere: ")) teacher = line.slice(8).trim();
    else if (line.startsWith("Lærer: ")) teacher = line.slice(7).trim();
    if (line.startsWith("Lokale: ")) room = line.slice(8).trim();
    if (line === "Lektier:" || line.startsWith("Lektier:")) break;
  }

  return {
    title,
    dateText,
    timeText,
    hold,
    teacher,
    room,
  };
}

function detectStatus(brick: Element | null, tooltip: string | null): ActivityStatus {
  if (brick?.classList.contains("s2cancelled")) return "cancelled";
  if (brick?.classList.contains("s2changed")) return "changed";
  if (brick?.classList.contains("s2moved")) return "moved";

  const firstLine = tooltip?.split(/\r?\n/, 1)[0]?.trim().toLowerCase() || "";
  if (firstLine.startsWith("aflyst")) return "cancelled";
  if (firstLine.startsWith("ændret") || firstLine.startsWith("aendret")) return "changed";
  if (firstLine.startsWith("flyttet")) return "moved";
  return "normal";
}

function parseMeta(doc: Document): ActivityMeta {
  const brick = doc.querySelector("#s_m_Content_Content_tocAndToolbar_actHeader .s2skemabrik");
  const desktop = brick?.querySelector(".s2skemabrikcontent.OnlyDesktop");
  const titleEl = brick?.querySelector(".s2skemabrik-std-title");
  const holdEl = brick?.querySelector<HTMLElement>("span[data-lectiocontextcard^='HE']");
  const teacherEls = brick?.querySelectorAll<HTMLElement>("span[data-lectiocontextcard^='T']");
  const roomEl = brick?.querySelector<HTMLElement>("span[data-lectiocontextcard^='RO']");

  const rawTooltip = brick?.getAttribute("data-tooltip") || null;
  const tooltipMeta = parseTooltipMeta(rawTooltip);
  const status = detectStatus(brick, rawTooltip);

  const desktopText = desktop?.textContent?.replace(/\s+/g, " ").trim() || "";

  let moduleText = "";
  if (desktopText.includes(" - ")) {
    moduleText = desktopText.split(" - ")[0].trim();
  }

  const hold = holdEl?.textContent?.trim() || tooltipMeta.hold || "";
  const holdId = holdEl?.getAttribute("data-lectiocontextcard") || null;

  // Lectio renders the brick body twice (OnlyDesktop + OnlyMobile divs) so the
  // same T* context-card span appears multiple times. Dedupe by id.
  const seenTeacherIds = new Set<string>();
  const teachers: ActivityTeacherRef[] = teacherEls
    ? Array.from(teacherEls)
        .map((el) => ({
          id: el.getAttribute("data-lectiocontextcard") || "",
          initials: el.textContent?.trim() || "",
        }))
        .filter((t) => {
          if (!t.id || !t.initials) return false;
          if (seenTeacherIds.has(t.id)) return false;
          seenTeacherIds.add(t.id);
          return true;
        })
    : [];

  const teacherFromEls = teachers.map((t) => t.initials).join(", ");
  const teacher = tooltipMeta.teacher || teacherFromEls || "";

  const roomId = roomEl?.getAttribute("data-lectiocontextcard") || null;
  let room = roomEl?.textContent?.trim() || tooltipMeta.room || "";
  if (!room && desktopText) {
    const tail = desktopText.split(" - ")[1] || "";
    const parts = tail
      .split("•")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      room = parts[parts.length - 1].replace(/\s+-\s*$/, "").trim();
    }
  }

  // Strip leading "Aflyst! " / "Ændret! " from titles since we render status as a badge.
  let cleanTitle = titleEl?.textContent?.trim() || tooltipMeta.title || hold || "Aktivitet";
  cleanTitle = cleanTitle.replace(/^(Aflyst!|Ændret!|Flyttet!?)\s*/i, "").trim() || cleanTitle;

  return {
    title: cleanTitle,
    dateText: tooltipMeta.dateText || "",
    timeText: tooltipMeta.timeText || "",
    hold,
    holdId,
    teacher,
    teachers,
    room,
    roomId,
    moduleText,
    status,
  };
}

function parseTabs(doc: Document): ActivityTabLink[] {
  const anchors = doc.querySelectorAll<HTMLAnchorElement>(".lectioTabToolbar .button a");
  const tabs: ActivityTabLink[] = [];

  anchors.forEach((a) => {
    const label = a.textContent?.trim() || "";
    const href = a.getAttribute("href") || "";
    const disabled = a.hasAttribute("disabled") || href === "#";

    tabs.push({
      label,
      url: disabled ? "" : new URL(href, window.location.origin).href,
      active: disabled,
    });
  });

  return tabs.filter((tab) => tab.label);
}

function parsePhase(doc: Document): ActivityPhase | null {
  const phaseLink = doc.querySelector<HTMLAnchorElement>("[id*='phaseRepeater']");
  if (!phaseLink) return null;

  const title = phaseLink.textContent?.trim() || "";
  const href = phaseLink.getAttribute("href") || "";
  if (!title || !href) return null;

  return {
    title,
    url: new URL(href, window.location.origin).href,
  };
}

function linkifyBareUrls(html: string): string {
  // Match bare URLs that are NOT already inside an href="..." or <a> tag
  // Only match URLs that are preceded by start-of-string, whitespace, or > (after a tag close)
  return html.replace(
    /(?<=^|>|\s)(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>',
  );
}

function extractLinksFromElement(el: HTMLElement): ActivityHomeworkLink[] {
  const links: ActivityHomeworkLink[] = [];
  el.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    const label = a.textContent?.replace(/\s+/g, " ").trim() || "Link";
    const href = a.getAttribute("href");
    if (!href) return;

    let absolute = "";
    try {
      absolute = new URL(href, window.location.origin).href;
    } catch {
      return;
    }

    let type: ActivityHomeworkLink["type"] = "internal";
    if (absolute.includes("/lc/") && absolute.includes("/res/")) {
      type = "file";
    } else if (!absolute.startsWith(window.location.origin)) {
      type = "external";
    }

    links.push({ label, url: absolute, type });
  });
  return links;
}

function findHeadingSoleAnchor(headingEl: HTMLElement): HTMLAnchorElement | null {
  let anchor: HTMLAnchorElement | null = null;
  for (const node of Array.from(headingEl.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent || "").replace(/\s| /g, "").length > 0) return null;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "A" && !anchor) {
        anchor = el as HTMLAnchorElement;
      } else {
        return null;
      }
    }
  }
  return anchor;
}

function findSoleImage(bodyRoot: HTMLElement): HTMLImageElement | null {
  const imgs = bodyRoot.querySelectorAll<HTMLImageElement>("img");
  if (imgs.length !== 1) return null;
  const img = imgs[0];
  if (!img.getAttribute("src")) return null;

  const probe = bodyRoot.cloneNode(true) as HTMLElement;
  probe.querySelector("img")?.remove();
  if ((probe.textContent || "").replace(/\s| /g, "").length > 0) return null;
  if (probe.querySelectorAll("a, video, audio, iframe, table, form").length > 0) return null;
  return img;
}

function parseArticle(article: HTMLElement, fallbackLabel: string, index: number): ActivityHomeworkItem {
  // Lectio uses h1 or h2 as the article title heading depending on content type
  const titleEl =
    article.querySelector<HTMLElement>("h1") ||
    article.querySelector<HTMLElement>("h2[id*='titleHeader']") ||
    article.querySelector<HTMLElement>("h2");

  // Extract links from heading BEFORE removing it (heading often wraps file download links)
  const h1Links = titleEl ? extractLinksFromElement(titleEl) : [];

  // Detect "title is a single link" case (e.g. <h1><a href="...">Tornerose.pdf</a></h1>)
  const headingAnchor = titleEl ? findHeadingSoleAnchor(titleEl) : null;

  const title = titleEl?.textContent?.replace(/\s+/g, " ").trim() || `${fallbackLabel} ${index + 1}`;

  const clone = article.cloneNode(true) as HTMLElement;
  // Remove the same heading tag from the clone
  const headingTag = titleEl?.tagName?.toLowerCase() || "h1";
  clone.querySelector(headingTag)?.remove();
  sanitizeActivityHtml(clone);

  // Detect "body is a single image" case (e.g. <article><h1>IMG_6465.jpeg</h1><img src="..."></article>)
  let image: ActivityHomeworkImage | undefined;
  const soleImage = findSoleImage(clone);
  if (soleImage) {
    const src = soleImage.getAttribute("src") || "";
    if (src) {
      image = { src, alt: soleImage.getAttribute("alt") || title };
      soleImage.remove();
    }
  }

  // Extract links from the body content (after image extraction)
  const bodyLinks = extractLinksFromElement(clone);

  // Combine h1 links + body links, deduplicating by URL
  const seenUrls = new Set<string>();
  const allLinks: ActivityHomeworkLink[] = [];
  for (const link of [...h1Links, ...bodyLinks]) {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url);
      allLinks.push(link);
    }
  }

  // Auto-linkify bare URLs in the remaining content HTML
  let contentHtml = clone.innerHTML.trim();
  contentHtml = linkifyBareUrls(contentHtml);

  // Promote the heading anchor to a primary link when the body has nothing else meaningful
  // (no extra links and no remaining content). Pulling it out of `links` avoids the duplicated
  // pill that otherwise renders directly underneath the title.
  let primaryLink: ActivityHomeworkLink | undefined;
  let links = allLinks;
  if (headingAnchor) {
    const headingHref = headingAnchor.getAttribute("href");
    if (headingHref) {
      try {
        const absoluteUrl = new URL(headingHref, window.location.origin).href;
        const match = allLinks.find((l) => l.url === absoluteUrl);
        if (match && contentHtml.length === 0 && allLinks.length === 1) {
          primaryLink = match;
          links = [];
        }
      } catch {
        // ignore
      }
    }
  }

  const id = article.closest("[id]")?.id || `homework-${index + 1}`;

  return { id, title, contentHtml, links, primaryLink, image };
}

function parsePresentationBlock(block: HTMLElement, index: number): ActivityHomeworkItem {
  const contentRoot =
    block.querySelector<HTMLElement>("[data-local-id='content']") ||
    block.querySelector<HTMLElement>(".lc-display-fragment") ||
    block;

  const clone = contentRoot.cloneNode(true) as HTMLElement;
  const cloneTitleEl = Array.from(
    clone.querySelectorAll<HTMLElement>("h1, h2, h3"),
  ).find((heading) => heading.textContent?.replace(/\s+/g, " ").trim());
  const title =
    cloneTitleEl?.textContent?.replace(/\s+/g, " ").trim() ||
    (index === 0 ? "Præsentation" : `Præsentation ${index + 1}`);

  // Avoid repeating the slide heading both as the card title and in the body.
  cloneTitleEl?.remove();
  sanitizeActivityHtml(clone);

  const links = extractLinksFromElement(clone);
  const id = block.id || `presentation-${index + 1}`;
  const contentHtml = linkifyBareUrls(clone.innerHTML.trim());

  return { id, title, contentHtml, links };
}

function parseContentSections(doc: Document): {
  homework: ActivityHomeworkItem[];
  presentation: ActivityHomeworkItem[];
  otherContent: ActivityHomeworkItem[];
} {
  const container = doc.querySelector("#s_m_Content_Content_tocAndToolbar_inlineHomeworkDiv");
  if (!container) return { homework: [], presentation: [], otherContent: [] };

  const homework: ActivityHomeworkItem[] = [];
  const presentation: ActivityHomeworkItem[] = [];
  const otherContent: ActivityHomeworkItem[] = [];

  // Walk section headings and content blocks to determine which section each item belongs to.
  // Lectio uses article blocks for lektier/øvrigt indhold and ACP wrappers for presentations.
  let currentSection: "homework" | "presentation" | "other" = "homework";
  const allNodes = Array.from(
    container.querySelectorAll("h1.ls-paper-section-heading, article, div[id^='ACP']"),
  );

  let hwIndex = 0;
  let presIndex = 0;
  let ocIndex = 0;
  for (const node of allNodes) {
    if (node.matches("h1.ls-paper-section-heading")) {
      const text = node.textContent?.trim().toLowerCase() || "";
      if (text.includes("øvrigt indhold")) {
        currentSection = "other";
      } else if (text.includes("præsentation")) {
        currentSection = "presentation";
      } else {
        currentSection = "homework";
      }
    } else if (node.matches("div[id^='ACP']")) {
      presentation.push(parsePresentationBlock(node as HTMLElement, presIndex));
      presIndex++;
    } else if (node.matches("article")) {
      if (currentSection === "other") {
        otherContent.push(parseArticle(node as HTMLElement, "Indhold", ocIndex));
        ocIndex++;
      } else if (currentSection === "presentation") {
        presentation.push(parseArticle(node as HTMLElement, "Præsentation", presIndex));
        presIndex++;
      } else {
        homework.push(parseArticle(node as HTMLElement, "Lektie", hwIndex));
        hwIndex++;
      }
    }
  }

  return { homework, presentation, otherContent };
}

function parseRelated(doc: Document): ActivityRelatedItem[] {
  const rows = doc.querySelectorAll<HTMLElement>(
    "#s_m_Content_Content_tocAndToolbar_tocDiv .ls-toc-side-list > li",
  );
  const items: ActivityRelatedItem[] = [];

  rows.forEach((row) => {
    const toc = row.querySelector<HTMLElement>(".ls-homework-toc");
    if (!toc) return;

    const icon = row.querySelector<HTMLImageElement>("img")?.getAttribute("src") || null;
    const iconUrl = icon ? new URL(icon, window.location.origin).href : null;

    const anchor = toc.querySelector<HTMLAnchorElement>("a[href]");
    const label = toc.textContent?.replace(/\s+/g, " ").trim() || "";
    if (!label) return;

    // Skip labels that are not actionable content in the hover tooltip.
    if (/^Præsentation/i.test(label) || /^Elevfeedback/i.test(label)) {
      return;
    }

    if (anchor) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(href, window.location.origin).href;
      items.push({ label, url, iconUrl });
      return;
    }
  });

  const deduped = new Map<string, ActivityRelatedItem>();
  for (const item of items) {
    const key = `${item.label}|${item.url || ""}`;
    deduped.set(key, item);
  }

  return Array.from(deduped.values());
}

function extractPostbackTarget(onclick: string | null): string | null {
  if (!onclick) return null;
  const match = onclick.match(/__doPostBack\('([^']+)'/);
  return match?.[1] || null;
}

function parseNavigation(doc: Document): ActivityNavigation {
  const scheduleLabel =
    doc
      .querySelector("#s_m_Content_Content_entityNavDiv .ls-std-inline-block")
      ?.textContent?.trim() || "Skemaaktivitet";

  const schedulePrevTarget = extractPostbackTarget(
    doc.querySelector<HTMLAnchorElement>("#s_m_Content_Content_ctl02")?.getAttribute("onclick") ||
      null,
  );
  const scheduleNextTarget = extractPostbackTarget(
    doc.querySelector<HTMLAnchorElement>("#s_m_Content_Content_ctl03")?.getAttribute("onclick") ||
      null,
  );

  const holdPrevTarget = extractPostbackTarget(
    doc
      .querySelector<HTMLAnchorElement>("#s_m_Content_Content_prevAktForHoldBtn")
      ?.getAttribute("onclick") || null,
  );
  const holdNextTarget = extractPostbackTarget(
    doc
      .querySelector<HTMLAnchorElement>("#s_m_Content_Content_nextAktForHoldBtn")
      ?.getAttribute("onclick") || null,
  );

  const holdListHref =
    doc.querySelector<HTMLAnchorElement>("#s_m_Content_Content_holdActLink")?.getAttribute("href") ||
    null;

  return {
    schedule: {
      label: scheduleLabel,
      prevEventTarget: schedulePrevTarget,
      nextEventTarget: scheduleNextTarget,
    },
    hold: {
      prevEventTarget: holdPrevTarget,
      nextEventTarget: holdNextTarget,
      listUrl: holdListHref ? new URL(holdListHref, window.location.origin).href : null,
    },
  };
}

function parseFormTokens(doc: Document, pageUrl: string): ActivityFormTokens {
  const form = doc.querySelector<HTMLFormElement>("#aspnetForm");
  const actionRaw = form?.getAttribute("action") || pageUrl;

  const action = new URL(actionRaw, new URL(pageUrl, window.location.origin)).href;
  const hiddenFields: Record<string, string> = {};

  form?.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]').forEach((input) => {
    const name = input.name?.trim();
    if (!name) return;
    hiddenFields[name] = input.value ?? "";
  });

  return {
    action,
    hiddenFields,
  };
}

function parseActivityDetail(doc: Document, url: string): ActivityDetail {
  const absolute = new URL(url, window.location.origin);
  const absid = absolute.searchParams.get("absid") || absolute.searchParams.get("id");

  const note =
    doc
      .querySelector<HTMLTextAreaElement>("#s_m_Content_Content_tocAndToolbar_ActNoteTB_tb")
      ?.value?.trim() || "";

  const { homework, presentation, otherContent } = parseContentSections(doc);

  return {
    url: absolute.href,
    absid,
    meta: parseMeta(doc),
    note,
    tabs: parseTabs(doc),
    phase: parsePhase(doc),
    homework,
    presentation,
    otherContent,
    related: parseRelated(doc),
    navigation: parseNavigation(doc),
    formTokens: parseFormTokens(doc, absolute.href),
  };
}

function ensureActivityDoc(doc: Document): void {
  const hasExpectedRoot = !!doc.querySelector("#s_m_Content_Content_tocAndToolbar_actHeader");
  if (!hasExpectedRoot) {
    throw new Error("SESSION_EXPIRED");
  }
}

async function fetchActivityDoc(url: string, init?: RequestInit): Promise<{ doc: Document; url: string }> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch activity (${response.status})`);
  }

  const html = await response.text(); 
  const doc = new DOMParser().parseFromString(html, "text/html");
  ensureActivityDoc(doc);
  return { doc, url: response.url || url };
}

export async function fetchActivityDetail(url: string, signal?: AbortSignal): Promise<ActivityDetail> {
  try {
    const absolute = new URL(url, window.location.origin).href;
    const { doc, url: resolvedUrl } = await fetchActivityDoc(absolute, { signal });
    return parseActivityDetail(doc, resolvedUrl);
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_EXPIRED') throw err;
    captureException(err, undefined, { source: 'activity-detail', url });
    throw err;
  }
}

export async function postbackNavigateActivity(
  detail: ActivityDetail,
  eventTarget: string,
): Promise<ActivityDetail> {
  const doPostback = async (source: ActivityDetail): Promise<ActivityDetail> => {
    const formData = new URLSearchParams();
    const fields = source.formTokens.hiddenFields;
    for (const [name, value] of Object.entries(fields)) {
      formData.set(name, value);
    }
    formData.set("__EVENTTARGET", eventTarget);
    formData.set("__EVENTARGUMENT", "");

    const { doc, url } = await fetchActivityDoc(source.formTokens.action, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    return parseActivityDetail(doc, url);
  };

  try {
    return await doPostback(detail);
  } catch {
    // Stale viewstate/eventvalidation; refresh once and retry.
    const fresh = await fetchActivityDetail(detail.url);
    return doPostback(fresh);
  }
}
