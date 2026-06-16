import { getCachedProfile } from "@/lib/profile-cache";
import { t } from "@/lib/i18n/t";

/**
 * Lightweight, DOM-only enhancement for Lectio's prøvehold (exam team) page
 * (`proevehold.aspx`). We deliberately do NOT rebuild this page in Preact —
 * it carries real exam times/dates and stability is critical. We only:
 *   1. add a page-scoping class so our CSS stays local,
 *   2. inject a short disclaimer banner ("BetterLectio takes no responsibility"),
 *   3. highlight the logged-in student's own row in the student list.
 *
 * Every step is null-guarded and wrapped in try/catch so a Lectio DOM change
 * degrades to "no enhancement", never a broken page.
 */

const PAGE_CLASS = "il-proevehold-page";
const NOTICE_CLASS = "il-proevehold-notice";
const CURRENT_STUDENT_CLASS = "il-current-student";

/** Strip a trailing parenthetical marker like "(k)" and normalize for matching. */
function normalizeName(raw: string): string {
  return raw
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function injectDisclaimer(): void {
  const islandContent = document.querySelector<HTMLElement>(
    "#m_Content_LectioDetailIslandProevehold_pa",
  );
  if (!islandContent) return;
  if (islandContent.querySelector(`.${NOTICE_CLASS}`)) return; // once

  const notice = document.createElement("div");
  notice.className = NOTICE_CLASS;

  const icon = document.createElement("span");
  icon.className = "il-proevehold-notice-icon ls-fonticon";
  icon.textContent = "info";

  const textWrap = document.createElement("div");
  textWrap.className = "il-proevehold-notice-text";

  const title = document.createElement("strong");
  title.textContent = t("proevehold.disclaimerTitle");

  const body = document.createElement("span");
  body.textContent = t("proevehold.disclaimerBody");

  textWrap.appendChild(title);
  textWrap.appendChild(body);
  notice.appendChild(icon);
  notice.appendChild(textWrap);

  islandContent.insertBefore(notice, islandContent.firstChild);
}

function highlightOwnRow(): void {
  const fullName = getCachedProfile()?.fullName;
  if (!fullName || fullName === "Bruger") return;
  const target = normalizeName(fullName);
  if (!target) return;

  // The student list is the bordered table; the summary table has no border attr.
  const tables = document.querySelectorAll<HTMLTableElement>(
    "#il-original-content table.list[border]",
  );
  tables.forEach((table) => {
    table.querySelectorAll<HTMLTableRowElement>("tr").forEach((row) => {
      const nameCell = row.cells?.[1]; // Navn column
      if (!nameCell) return;
      const cellName = normalizeName(nameCell.textContent || "");
      if (!cellName) return;
      // Exact, or one is a prefix of the other (handles a dropped/added middle name).
      if (
        cellName === target ||
        cellName.startsWith(target) ||
        target.startsWith(cellName)
      ) {
        row.classList.add(CURRENT_STUDENT_CLASS);
      }
    });
  });
}

export function enhanceProeveholdPage(): void {
  try {
    document.documentElement.classList.add(PAGE_CLASS);
    injectDisclaimer();
    highlightOwnRow();
  } catch (err) {
    // Never break the native page over a styling enhancement.
    console.debug("[BetterLectio] prøvehold enhancement skipped:", err);
  }
}
