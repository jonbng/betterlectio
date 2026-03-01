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

export interface ActivityHomeworkItem {
  id: string;
  title: string;
  contentHtml: string;
  links: ActivityHomeworkLink[];
}

export interface ActivityRelatedItem {
  label: string;
  url: string | null;
  iconUrl: string | null;
}

export interface ActivityMeta {
  title: string;
  dateText: string;
  timeText: string;
  hold: string;
  teacher: string;
  room: string;
  moduleText: string;
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
  related: ActivityRelatedItem[];
  navigation: ActivityNavigation;
  formTokens: ActivityFormTokens;
}

const CACHE_PREFIX = "il-activity-detail-";
const CACHE_TTL = 3 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;

interface CachedActivity {
  timestamp: number;
  detail: ActivityDetail;
}

function getActivityId(url: string): string {
  const absolute = new URL(url, window.location.origin);
  const absid = absolute.searchParams.get("absid");
  const id = absolute.searchParams.get("id");
  return absid || id || absolute.href;
}

export function getCachedActivityDetail(url: string): ActivityDetail | null {
  const key = CACHE_PREFIX + getActivityId(url);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: CachedActivity = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.detail;
  } catch {
    return null;
  }
}

function setCachedActivityDetail(url: string, detail: ActivityDetail): void {
  const key = CACHE_PREFIX + getActivityId(url);
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length >= CACHE_MAX_ENTRIES) {
      let oldestKey = keys[0];
      let oldestTs = Number.POSITIVE_INFINITY;
      for (const k of keys) {
        try {
          const parsed: CachedActivity = JSON.parse(localStorage.getItem(k) || "");
          if (parsed.timestamp < oldestTs) {
            oldestTs = parsed.timestamp;
            oldestKey = k;
          }
        } catch {
          // Ignore corrupted cache entries
        }
      }
      localStorage.removeItem(oldestKey);
    }

    localStorage.setItem(
      key,
      JSON.stringify({
        timestamp: Date.now(),
        detail,
      } as CachedActivity),
    );
  } catch {
    // Ignore storage errors
  }
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
    if (line.startsWith("Lærer: ")) teacher = line.slice(7).trim();
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

function parseMeta(doc: Document): ActivityMeta {
  const brick = doc.querySelector("#s_m_Content_Content_tocAndToolbar_actHeader .s2skemabrik");
  const desktop = brick?.querySelector(".s2skemabrikcontent.OnlyDesktop");
  const titleEl = brick?.querySelector(".s2skemabrik-std-title");
  const holdEl = brick?.querySelector<HTMLElement>("span[data-lectiocontextcard^='HE']");
  const teacherEl = brick?.querySelector<HTMLElement>("span[data-lectiocontextcard^='T']");

  const tooltipMeta = parseTooltipMeta(brick?.getAttribute("data-tooltip") || null);

  const desktopText = desktop?.textContent?.replace(/\s+/g, " ").trim() || "";

  let moduleText = "";
  if (desktopText.includes(" - ")) {
    moduleText = desktopText.split(" - ")[0].trim();
  }

  const hold = holdEl?.textContent?.trim() || tooltipMeta.hold || "";
  const teacher = tooltipMeta.teacher || teacherEl?.textContent?.trim() || "";

  let room = tooltipMeta.room || "";
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

  return {
    title:
      titleEl?.textContent?.trim() ||
      tooltipMeta.title ||
      hold ||
      "Aktivitet",
    dateText: tooltipMeta.dateText || "",
    timeText: tooltipMeta.timeText || "",
    hold,
    teacher,
    room,
    moduleText,
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

function parseHomework(doc: Document): ActivityHomeworkItem[] {
  const articles = doc.querySelectorAll<HTMLElement>(
    "#s_m_Content_Content_tocAndToolbar_inlineHomeworkDiv article",
  );

  const items: ActivityHomeworkItem[] = [];

  articles.forEach((article, index) => {
    // Lectio uses h1 or h2 as the article title heading depending on content type
    const titleEl =
      article.querySelector<HTMLElement>("h1") ||
      article.querySelector<HTMLElement>("h2[id*='titleHeader']") ||
      article.querySelector<HTMLElement>("h2");

    // Extract links from heading BEFORE removing it (heading often wraps file download links)
    const h1Links = titleEl ? extractLinksFromElement(titleEl) : [];

    const title = titleEl?.textContent?.replace(/\s+/g, " ").trim() || `Lektie ${index + 1}`;

    const clone = article.cloneNode(true) as HTMLElement;
    // Remove the same heading tag from the clone
    const headingTag = titleEl?.tagName?.toLowerCase() || "h1";
    clone.querySelector(headingTag)?.remove();
    sanitizeActivityHtml(clone);

    // Extract links from the body content
    const bodyLinks = extractLinksFromElement(clone);

    // Combine h1 links + body links, deduplicating by URL
    const seenUrls = new Set<string>();
    const links: ActivityHomeworkLink[] = [];
    for (const link of [...h1Links, ...bodyLinks]) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        links.push(link);
      }
    }

    // Auto-linkify bare URLs in the remaining content HTML
    let contentHtml = clone.innerHTML.trim();
    contentHtml = linkifyBareUrls(contentHtml);

    const id = article.closest("[id]")?.id || `homework-${index + 1}`;

    items.push({
      id,
      title,
      contentHtml,
      links,
    });
  });

  return items;
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

    if (anchor) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(href, window.location.origin).href;
      items.push({ label, url, iconUrl });
      return;
    }

    if (/^Præsentation/i.test(label) || /^Elevfeedback/i.test(label)) {
      items.push({ label, url: null, iconUrl });
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

  return {
    url: absolute.href,
    absid,
    meta: parseMeta(doc),
    note,
    tabs: parseTabs(doc),
    phase: parsePhase(doc),
    homework: parseHomework(doc),
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

export async function fetchActivityDetail(url: string): Promise<ActivityDetail> {
  const absolute = new URL(url, window.location.origin).href;
  const { doc, url: resolvedUrl } = await fetchActivityDoc(absolute);
  const detail = parseActivityDetail(doc, resolvedUrl);
  setCachedActivityDetail(resolvedUrl, detail);
  return detail;
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

    const nextDetail = parseActivityDetail(doc, url);
    setCachedActivityDetail(url, nextDetail);
    return nextDetail;
  };

  try {
    return await doPostback(detail);
  } catch {
    // Cached pages can have stale viewstate/eventvalidation; refresh once and retry.
    const fresh = await fetchActivityDetail(detail.url);
    return doPostback(fresh);
  }
}
