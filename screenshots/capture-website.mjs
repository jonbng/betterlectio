/**
 * Capture marketing screenshots for betterlectio.dk into website/public/shots.
 *
 * Based on screenshots/capture.mjs (CWS promos). One MitID login, then:
 *   1. Plain Lectio skema (redesign bypass)  → lectio-before.png
 *   2. BetterLectio skema                   → betterlectio-after.png + web-skema.png
 *   3. Dark mode skema                      → web-dark.png
 *   4. Karakterer (demo grades, not real)   → feat-grades.png
 *   5. Lektier                              → feat-homework.png
 *
 * Schedule always uses week=182026 (override with SCHEDULE_WEEK). Photos are
 * replaced with silhouettes; grades are scrambled to a fixed demo set.
 *
 * Usage (from extension/):
 *   bun screenshots/capture-website.mjs
 *   bun screenshots/capture-website.mjs --skip-build
 *
 * Env:
 *   SCHOOL_ID=94
 *   SCHEDULE_WEEK=182026
 */
import { chromium } from "playwright";
import { resolve } from "path";
import { setTimeout as sleep } from "timers/promises";
import { mkdtempSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { execSync } from "child_process";
import sharp from "sharp";

const EXT_ROOT = resolve(import.meta.dirname, "..");
const EXT_PATH = resolve(EXT_ROOT, ".output/chrome-mv3");
const OUT_DIR = resolve(EXT_ROOT, "../website/public/shots");
const SCHOOL_ID = process.env.SCHOOL_ID || "94";
const BASE = `https://www.lectio.dk/lectio/${SCHOOL_ID}`;
// Fixed school week with real modules (summer weeks are empty). Lectio format: WWYYYY
const SCHEDULE_WEEK = process.env.SCHEDULE_WEEK || "182026";
const SKEMA_URL = `${BASE}/SkemaNy.aspx?week=${SCHEDULE_WEEK}`;

// Marketing sizes used by website components (device-frames, features, before-after)
const DESKTOP = { w: 2560, h: 1600 };
const FEATURE = { w: 1200, h: 900 };

// Capture at 2× via deviceScaleFactor so 1280×800 viewport → 2560×1600 PNG
const VIEWPORT = { width: 1280, height: 800 };
const DPR = 2;

// ─── Playwright helpers ───────────────────────────────────────

async function waitForIdle(page, ms = 2000) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(ms);
}

async function ensureSidebarExpanded(page) {
  const collapsed = await page.$('[data-state="collapsed"]');
  if (collapsed) {
    const trigger = await page.$('[data-sidebar="trigger"]');
    if (trigger) await trigger.click();
    await sleep(500);
  }
}

async function waitForAuthenticated(page, timeoutMs = 300_000) {
  console.log("  Waiting for authentication (5 min timeout)...");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const sidebar = await page.$("#il-root [data-sidebar='sidebar']");
      if (sidebar) {
        console.log("  BetterLectio sidebar detected!");
        return;
      }
      const header = await page.$(".ls-master-header");
      if (header) {
        console.log("  Lectio header detected, waiting for extension...");
        await sleep(3000);
        return;
      }
    } catch {
      /* navigating */
    }
    await sleep(1500);
  }
  throw new Error("Authentication timeout");
}

async function anonymizeStudents(page) {
  await page.evaluate(() => {
    const first = [
      "Magnus", "Frederik", "Oscar", "Victor", "Oliver", "Noah", "Lucas", "Emil",
      "Mikkel", "Sebastian", "Mathias", "Rasmus", "Christian", "Emma", "Ida",
      "Freja", "Clara", "Sofie", "Laura", "Anna", "Astrid", "Maja", "Nora",
      "Ella", "Olivia", "Alma", "Lea",
    ];
    const last = [
      "Nielsen", "Jensen", "Hansen", "Pedersen", "Andersen", "Christensen",
      "Larsen", "Sørensen", "Rasmussen", "Jørgensen", "Petersen", "Madsen",
    ];
    let i = 0;
    const fake = () => {
      const n = `${first[i % first.length]} ${last[(i * 7 + 3) % last.length]}`;
      i++;
      return n;
    };
    const initials = (name) =>
      name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .toUpperCase();

    const root = document.querySelector("#il-root");
    if (root) {
      const footer = root.querySelector('[data-sidebar="footer"]');
      if (footer) {
        footer.querySelectorAll("span.truncate").forEach((el) => {
          if (el.textContent.trim().length > 1) el.textContent = fake();
        });
        footer.querySelectorAll('[data-slot="avatar-image"], img').forEach((img) => {
          img.style.filter = "blur(12px) grayscale(1) brightness(1.1)";
          img.style.transform = "scale(1.3)";
        });
      }

      root.querySelectorAll("h1").forEach((h1) => {
        const text = h1.textContent || "";
        const commaIdx = text.indexOf(",");
        if (commaIdx !== -1) {
          const fakeName = fake();
          h1.textContent = text.slice(0, commaIdx + 1) + " " + fakeName.split(" ")[0];
        }
      });

      root
        .querySelectorAll('img[class*="object-top"], [data-slot="avatar-image"]')
        .forEach((img) => {
          img.style.filter = "blur(12px) grayscale(1) brightness(1.1)";
          img.style.transform = "scale(1.3)";
          const parent = img.parentElement;
          if (parent) parent.style.overflow = "hidden";
        });

      root.querySelectorAll(".rounded-full").forEach((el) => {
        if (el.tagName === "IMG" || el.querySelector("img")) return;
        const text = el.textContent?.trim() || "";
        if (text.length >= 1 && text.length <= 3 && /^[A-ZÆØÅ]+$/i.test(text)) {
          el.textContent = initials(fake());
        }
      });

      root
        .querySelectorAll(
          ".p-3\\.5 span.font-semibold.line-clamp-2, .p-3\\.5 span.font-bold",
        )
        .forEach((el) => {
          el.textContent = fake();
        });

      root
        .querySelectorAll(
          "button.text-lg.font-semibold.tracking-tight, span.text-lg.font-semibold.tracking-tight",
        )
        .forEach((el) => {
          el.textContent = fake();
        });

      root
        .querySelectorAll("span.truncate.text-xs.text-muted-foreground[title]")
        .forEach((el) => {
          if (el.title && el.title.length > 3) {
            const n = fake();
            el.textContent = n;
            el.title = n;
          }
        });
    }

    document
      .querySelectorAll(
        '[data-lectioContextCard^="S"], [data-lectiocontextcard^="S"]',
      )
      .forEach((el) => {
        const text = el.textContent?.trim() || "";
        if (text.length > 2) el.textContent = fake();
      });
  });
}

/** Solid silhouette — real faces must never appear, even under blur. */
const PHOTO_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="120">
      <rect width="100%" height="100%" fill="#d4d4d8"/>
      <circle cx="48" cy="42" r="18" fill="#a1a1aa"/>
      <ellipse cx="48" cy="100" rx="32" ry="28" fill="#a1a1aa"/>
    </svg>`,
  );

/** Replace every student/teacher photo with a neutral silhouette. */
async function redactPhotos(page) {
  await page.evaluate((placeholder) => {
    const redact = (img) => {
      try {
        img.removeAttribute("srcset");
        img.removeAttribute("data-src");
        img.src = placeholder;
        img.style.filter = "none";
        img.style.objectFit = "cover";
        img.style.background = "#d4d4d8";
      } catch {
        /* ignore */
      }
    };

    document
      .querySelectorAll(
        [
          'img[src*="GetImage"]',
          'img[src*="pictureid"]',
          'img[src*="fotoupload"]',
          'img[id*="picctrl"]',
          'img[id*="PicCtrl"]',
          "#s_m_HeaderContent_picctrlthumbimage",
          '[data-slot="avatar-image"]',
          'img[class*="object-top"]',
          "#il-root [data-sidebar='footer'] img",
          "#il-original-content img",
        ].join(", "),
      )
      .forEach(redact);

    document.querySelectorAll("[style*='GetImage'], [style*='pictureid']").forEach((el) => {
      el.style.backgroundImage = "none";
      el.style.backgroundColor = "#d4d4d8";
    });
  }, PHOTO_PLACEHOLDER);
}

/**
 * Replace real 7-trin grades + averages with a fixed demo set so personal
 * karakterer never ship on the marketing site.
 */
async function anonymizeGrades(page) {
  await page.evaluate(() => {
    const GRADE = /^(12|10|7|4|02|00|-3|2)$/;
    const AVG = /^\d{1,2}[.,]\d{1,2}$/;
    // Deterministic demo sequence (not derived from real values)
    const demoGrades = ["10", "7", "12", "7", "4", "10", "7", "12", "10", "7", "4", "10"];
    const demoAvgs = ["7,4", "8,1", "7,0", "8,6", "7,8", "8,2"];
    let gi = 0;
    let ai = 0;

    const root = document.querySelector("#il-root") || document.body;
    const nodes = root.querySelectorAll("span, div, p, td, th, button, li");
    for (const el of nodes) {
      if (el.children.length > 2) continue;
      const onlyText =
        el.childNodes.length > 0 &&
        [...el.childNodes].every(
          (n) =>
            n.nodeType === Node.TEXT_NODE ||
            (n.nodeType === Node.ELEMENT_NODE &&
              ["SVG", "PATH"].includes(n.nodeName)),
        );
      if (!onlyText && el.children.length > 0) continue;

      const raw = (el.textContent || "").trim();
      if (GRADE.test(raw)) {
        el.textContent = demoGrades[gi++ % demoGrades.length];
        continue;
      }
      if (AVG.test(raw) && raw.length <= 6) {
        el.textContent = demoAvgs[ai++ % demoAvgs.length];
      }
    }

    // Distribution chips like "12 ×4" / "10 ×5"
    root.querySelectorAll("span, div").forEach((el) => {
      if (el.children.length > 0) return;
      const t = (el.textContent || "").trim();
      const m = t.match(/^(12|10|7|4|02|00|-3)\s*[×x]\s*\d+$/i);
      if (m) {
        const counts = [4, 5, 6, 3, 2, 1];
        el.textContent = `${demoGrades[gi++ % demoGrades.length]} ×${counts[gi % counts.length]}`;
      }
    });
  });
}

async function anonymizeTeacherNames(page, schoolId = SCHOOL_ID) {
  await page.evaluate(
    async ({ schoolId }) => {
      const first = [
        "Magnus", "Frederik", "Oscar", "Victor", "Oliver", "Noah", "Lucas", "Emil",
        "Mikkel", "Sebastian", "Mathias", "Rasmus", "Christian", "Emma", "Ida",
        "Freja", "Clara", "Sofie", "Laura", "Anna", "Astrid", "Maja", "Nora",
        "Ella", "Olivia", "Alma", "Lea",
      ];
      const last = [
        "Nielsen", "Jensen", "Hansen", "Pedersen", "Andersen", "Christensen",
        "Larsen", "Sørensen", "Rasmussen", "Jørgensen", "Petersen", "Madsen",
      ];
      let i = 0;

      const nextFakeName = () => {
        const name = `${first[i % first.length]} ${last[(i * 7 + 3) % last.length]}`;
        i += 1;
        return name;
      };

      const preserveWhitespace = (original, replacement) => {
        const prefix = original.match(/^\s*/)?.[0] || "";
        const suffix = original.match(/\s*$/)?.[0] || "";
        return `${prefix}${replacement}${suffix}`;
      };

      const teacherByToken = new Map();
      const teacherEntries = [];

      try {
        const response = await fetch(
          `${window.location.origin}/lectio/${schoolId}/FindSkema.aspx?type=laerer`,
          { credentials: "include" },
        );
        if (!response.ok) return;

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const seen = new Set();

        doc
          .querySelectorAll(
            'a[data-lectioContextCard^="T"], a[data-lectiocontextcard^="T"]',
          )
          .forEach((link) => {
            const raw = link.textContent?.trim() || "";
            const match = raw.match(/^(.+?)\s*\(([^)]+)\)$/);
            if (!match) return;

            const fullName = match[1].trim();
            const abbrev = match[2].trim();
            const key = `${fullName}::${abbrev}`;
            if (!fullName || !abbrev || seen.has(key)) return;
            seen.add(key);

            const fakeName = nextFakeName();
            const fakeAbbrev = fakeName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase();

            teacherEntries.push({ fullName, abbrev, fakeName, fakeAbbrev });
            teacherByToken.set(fullName, fakeName);
            teacherByToken.set(`${fullName} (${abbrev})`, `${fakeName} (${fakeAbbrev})`);
            teacherByToken.set(abbrev, fakeAbbrev);
          });
      } catch {
        return;
      }

      if (teacherEntries.length === 0) return;

      const abbrevMap = new Map(
        teacherEntries.map((entry) => [entry.abbrev, entry.fakeAbbrev]),
      );
      const root = document.body;

      root
        .querySelectorAll(
          '[data-lectioContextCard^="T"], [data-lectiocontextcard^="T"]',
        )
        .forEach((el) => {
          const text = el.textContent?.trim() || "";
          const replacement = teacherByToken.get(text);
          if (replacement) el.textContent = replacement;
        });

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent?.trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });

      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      const fullNameMap = new Map();
      for (const entry of teacherEntries) {
        fullNameMap.set(entry.fullName, entry.fakeName);
        fullNameMap.set(
          `${entry.fullName} (${entry.abbrev})`,
          `${entry.fakeName} (${entry.fakeAbbrev})`,
        );
      }

      for (const node of textNodes) {
        const original = node.textContent || "";
        const trimmed = original.trim();
        if (!trimmed) continue;

        const fullNameReplacement = fullNameMap.get(trimmed);
        if (fullNameReplacement) {
          node.textContent = preserveWhitespace(original, fullNameReplacement);
          continue;
        }

        if (/^[A-ZÆØÅ]{1,4}(?:\s*,\s*[A-ZÆØÅ]{1,4})+$/.test(trimmed)) {
          const tokens = trimmed.split(/\s*,\s*/);
          if (tokens.every((token) => abbrevMap.has(token))) {
            const replacement = tokens.map((token) => abbrevMap.get(token)).join(", ");
            node.textContent = preserveWhitespace(original, replacement);
          }
        }
      }
    },
    { schoolId },
  );
}

async function prepPage(page, { grades = false } = {}) {
  await ensureSidebarExpanded(page);
  // Hide floating chrome that shouldn't appear on marketing shots
  await page.evaluate(() => {
    document.getElementById("il-bypass-reenable")?.remove();
    document.querySelectorAll("button").forEach((btn) => {
      const t = (btn.textContent || "").trim().toLowerCase();
      if (t.includes("give feedback") || t.includes("feedback")) {
        btn.style.visibility = "hidden";
      }
    });
  });
  await anonymizeTeacherNames(page);
  await anonymizeStudents(page);
  await redactPhotos(page);
  if (grades) await anonymizeGrades(page);
  await sleep(800);
}

async function setDarkMode(page, enabled) {
  await page.evaluate((enabled) => {
    const KEY = "bl-feature-settings";
    let settings = {};
    try {
      settings = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      settings = {};
    }
    settings.version = settings.version ?? 1;
    settings.visual = { ...(settings.visual || {}), darkMode: enabled };
    localStorage.setItem(KEY, JSON.stringify(settings));
    document.documentElement.classList.toggle("dark", enabled);
  }, enabled);
}

async function setBypass(page, armed) {
  await page.evaluate((armed) => {
    const KEY = "bl-bypass-redesigns";
    if (armed) {
      localStorage.setItem(KEY, JSON.stringify({ activatedAt: Date.now() }));
    } else {
      localStorage.removeItem(KEY);
    }
  }, armed);
}

async function dismissChrome(page) {
  await page.evaluate(() => {
    localStorage.setItem("bl-welcome-popup-seen-v1", "true");
    // Kill leftover popups if mounted
    document
      .querySelectorAll('[data-state="open"][role="dialog"], [role="alertdialog"]')
      .forEach((el) => {
        const close = el.querySelector('button[aria-label*="Close"], button[aria-label*="Luk"]');
        if (close) close.click();
      });
  });
}

// ─── Image helpers ────────────────────────────────────────────

async function saveDesktop(rawPath, outName) {
  const out = resolve(OUT_DIR, outName);
  await sharp(rawPath)
    .resize(DESKTOP.w, DESKTOP.h, { fit: "cover", position: "top" })
    .png()
    .toFile(out);
  console.log(`    -> ${outName} (${DESKTOP.w}×${DESKTOP.h})`);
  return out;
}

async function saveFeature(rawPath, outName) {
  // Center-crop to 4:3 then scale to feature card size
  const out = resolve(OUT_DIR, outName);
  const meta = await sharp(rawPath).metadata();
  const srcW = meta.width || DESKTOP.w;
  const srcH = meta.height || DESKTOP.h;
  const targetRatio = FEATURE.w / FEATURE.h;
  const srcRatio = srcW / srcH;

  let extract;
  if (srcRatio > targetRatio) {
    // too wide
    const w = Math.round(srcH * targetRatio);
    extract = { left: Math.round((srcW - w) / 2), top: 0, width: w, height: srcH };
  } else {
    const h = Math.round(srcW / targetRatio);
    // Bias crop toward top content (below browser chrome / sidebar header)
    extract = {
      left: 0,
      top: Math.min(Math.round((srcH - h) * 0.15), srcH - h),
      width: srcW,
      height: h,
    };
  }

  await sharp(rawPath)
    .extract(extract)
    .resize(FEATURE.w, FEATURE.h, { fit: "fill" })
    .png()
    .toFile(out);
  console.log(`    -> ${outName} (${FEATURE.w}×${FEATURE.h})`);
  return out;
}

async function shot(page, tmpName) {
  const path = resolve(tmpdir(), `bl-web-${tmpName}-${Date.now()}.png`);
  await page.screenshot({ path, type: "png" });
  return path;
}

// ─── Main capture ─────────────────────────────────────────────

async function buildExtension() {
  console.log("\n═══ PHASE 0: Build Extension ═══\n");
  console.log("  Running: bun run build ...");
  execSync("bun run build", { cwd: EXT_ROOT, stdio: "inherit" });
  console.log("  Build complete.\n");
}

async function capture() {
  if (!existsSync(EXT_PATH)) {
    throw new Error(
      `Extension build not found at ${EXT_PATH}\nRun without --skip-build, or: bun run build`,
    );
  }
  mkdirSync(OUT_DIR, { recursive: true });

  console.log("\n═══ PHASE 1: Capture website shots ═══\n");
  console.log(`  School:    ${SCHOOL_ID}`);
  console.log(`  Week:      ${SCHEDULE_WEEK}  (${SKEMA_URL})`);
  console.log(`  Extension: ${EXT_PATH}`);
  console.log(`  Output:    ${OUT_DIR}\n`);

  const userDataDir = mkdtempSync(resolve(tmpdir(), "bl-website-shots-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--no-first-run",
      "--disable-default-apps",
    ],
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(`${BASE}/login_list.aspx`, { waitUntil: "domcontentloaded" });
  console.log("  Browser open — log in via MitID, then wait.\n");

  await waitForAuthenticated(page);
  await sleep(2000);
  await dismissChrome(page);

  // Block noisy background assignment fetches (same as CWS script)
  await page.route("**/OpgaverElev.aspx*", (route, request) => {
    if (request.resourceType() === "document") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body></body></html>",
    });
  });

  await page.addInitScript(() => {
    const strip = () => {
      document.querySelectorAll(".exercisemissing").forEach((el) => {
        const row = el.closest("tr");
        if (row) row.remove();
        else el.remove();
      });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", strip);
    } else {
      strip();
    }
  });

  // ── 1. Plain Lectio (before) ────────────────────────────────
  console.log(`  [1/5] Plain Lectio skema (before, week ${SCHEDULE_WEEK})...`);
  await setBypass(page, true);
  await setDarkMode(page, false);
  await page.goto(SKEMA_URL, { waitUntil: "domcontentloaded" });
  await waitForIdle(page, 3500);
  await page.evaluate(() => {
    document.getElementById("il-bypass-reenable")?.remove();
  });
  await anonymizeTeacherNames(page);
  await anonymizeStudents(page);
  await redactPhotos(page);
  // Second pass after any lazy-loaded header image
  await sleep(500);
  await redactPhotos(page);
  await sleep(500);
  {
    const raw = await shot(page, "before");
    await saveDesktop(raw, "lectio-before.png");
  }

  // ── 2. BetterLectio skema (after + web-skema) ────────────────
  console.log(`  [2/5] BetterLectio skema (week ${SCHEDULE_WEEK})...`);
  await setBypass(page, false);
  await setDarkMode(page, false);
  await page.goto(SKEMA_URL, { waitUntil: "domcontentloaded" });
  await waitForIdle(page, 4000);
  await prepPage(page);
  {
    const raw = await shot(page, "skema");
    await saveDesktop(raw, "betterlectio-after.png");
    await saveDesktop(raw, "web-skema.png");
  }

  // ── 3. Dark mode skema ──────────────────────────────────────
  console.log(`  [3/5] BetterLectio skema dark (week ${SCHEDULE_WEEK})...`);
  await setDarkMode(page, true);
  await page.goto(SKEMA_URL, { waitUntil: "domcontentloaded" });
  await waitForIdle(page, 4000);
  // Ensure dark class stuck after navigation
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await prepPage(page);
  {
    const raw = await shot(page, "dark");
    await saveDesktop(raw, "web-dark.png");
  }
  await setDarkMode(page, false);

  // ── 4. Karakterer (feature crop) — grades scrambled to demo values ──
  console.log("  [4/5] Karakterer (demo grades, not yours)...");
  await page.goto(`${BASE}/grades/grade_report.aspx`, {
    waitUntil: "domcontentloaded",
  });
  await waitForIdle(page, 4500);
  await prepPage(page, { grades: true });
  {
    const raw = await shot(page, "grades");
    await saveFeature(raw, "feat-grades.png");
  }

  // ── 5. Lektier (feature crop) ───────────────────────────────
  console.log("  [5/5] Lektier...");
  await page.goto(`${BASE}/material_lektieoversigt.aspx`, {
    waitUntil: "domcontentloaded",
  });
  await waitForIdle(page, 4000);
  await prepPage(page);
  {
    const raw = await shot(page, "lektier");
    await saveFeature(raw, "feat-homework.png");
  }

  await context.close();
  console.log("\n  Browser closed.\n");
  console.log("═══ Done ═══");
  console.log(`\nShots written to:\n  ${OUT_DIR}/\n`);
  console.log("Files:");
  for (const f of [
    "lectio-before.png",
    "betterlectio-after.png",
    "web-skema.png",
    "web-dark.png",
    "feat-grades.png",
    "feat-homework.png",
  ]) {
    const p = resolve(OUT_DIR, f);
    console.log(`  ${existsSync(p) ? "✓" : "✗"} ${f}`);
  }
  console.log("");
}

async function main() {
  const skipBuild = process.argv.includes("--skip-build");
  if (!skipBuild) {
    await buildExtension();
  } else {
    console.log("\n  Skipping build (--skip-build)\n");
  }
  await capture();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
