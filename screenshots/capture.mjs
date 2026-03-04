import { chromium } from "playwright";
import { resolve } from "path";
import { setTimeout as sleep } from "timers/promises";
import { mkdtempSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const EXT_PATH = resolve(import.meta.dirname, "../.output/chrome-mv3");
const OUT_DIR = resolve(import.meta.dirname);
const SCHOOL_ID = "94";
const BASE = `https://www.lectio.dk/lectio/${SCHOOL_ID}`;

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
      if (sidebar) { console.log("  BetterLectio sidebar detected!"); return; }
      const header = await page.$(".ls-master-header");
      if (header) { console.log("  Lectio header detected, waiting for extension..."); await sleep(3000); return; }
    } catch { /* navigating */ }
    await sleep(1500);
  }
  throw new Error("Authentication timeout");
}

async function anonymizeFindSkema(page) {
  await page.evaluate(() => {
    const first = ["Magnus","Frederik","Oscar","Victor","Oliver","Noah","Lucas","Emil","Mikkel","Sebastian","Mathias","Rasmus","Christian","Emma","Ida","Freja","Clara","Sofie","Laura","Anna","Astrid","Maja","Nora","Ella","Olivia","Alma","Lea"];
    const last = ["Nielsen","Jensen","Hansen","Pedersen","Andersen","Christensen","Larsen","Sørensen","Rasmussen","Jørgensen","Petersen","Madsen"];
    let i = 0;
    const fake = () => { const n = `${first[i%first.length]} ${last[(i*7+3)%last.length]}`; i++; return n; };

    document.querySelectorAll(".findskema-card-name").forEach(el => { el.textContent = fake(); });
    document.querySelectorAll(".findskema-card-image-container").forEach(c => {
      c.style.overflow = "hidden";
      const img = c.querySelector("img");
      if (img) { img.style.filter = "blur(20px) grayscale(1) brightness(1.1)"; img.style.transform = "scale(1.3)"; }
      const fb = c.querySelector(".findskema-card-fallback");
      if (fb) { const n = fake(); fb.textContent = n[0] + n.split(" ")[1][0]; }
    });
    document.querySelectorAll(".findskema-starred-name, .findskema-recent-name").forEach(el => { el.textContent = fake(); });
  });
}

// ─── Screenshot definitions ───────────────────────────────────

const pages = [
  {
    name: "1-schedule",
    url: `${BASE}/SkemaNy.aspx`,
    label: "Schedule",
    prep: async (page) => { await ensureSidebarExpanded(page); },
  },
  {
    name: "2-forside",
    url: `${BASE}/forside.aspx`,
    label: "Forside",
    prep: async (page) => { await ensureSidebarExpanded(page); },
  },
  {
    name: "3-opgaver",
    url: `${BASE}/OpgaverElev.aspx`,
    label: "Opgaver",
    prep: async (page) => { await ensureSidebarExpanded(page); },
  },
  {
    name: "4-findskema",
    url: `${BASE}/FindSkema.aspx?type=elev`,
    label: "FindSkema",
    prep: async (page) => {
      await ensureSidebarExpanded(page);
      const input = await page.$('#il-findskema-root input[type="text"], #il-findskema-root input[placeholder]');
      if (input) { await input.click(); await input.type("a", { delay: 50 }); await sleep(2500); }
      await anonymizeFindSkema(page);
    },
  },
  {
    name: "5-lektier",
    url: `${BASE}/material_lektieoversigt.aspx`,
    label: "Lektier",
    prep: async (page) => { await ensureSidebarExpanded(page); },
  },
];

// ─── Phase 1: Capture raw screenshots ─────────────────────────

async function captureScreenshots() {
  console.log("\n═══ PHASE 1: Capture Screenshots ═══\n");
  console.log(`Extension: ${EXT_PATH}`);

  const userDataDir = mkdtempSync(resolve(tmpdir(), "bl-screenshots-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--no-first-run", "--disable-default-apps",
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(`${BASE}/login_list.aspx`, { waitUntil: "domcontentloaded" });
  console.log("  Browser open — please log in via MitID.\n");

  await waitForAuthenticated(page);
  await sleep(2000);

  for (const shot of pages) {
    console.log(`  Capturing: ${shot.label}...`);
    await page.goto(shot.url, { waitUntil: "domcontentloaded" });
    await waitForIdle(page, 4000);
    if (shot.prep) await shot.prep(page);
    await sleep(2000);
    await page.screenshot({ path: `${OUT_DIR}/${shot.name}.png`, type: "png" });
    console.log(`    -> ${shot.name}.png`);
  }

  await context.close();
  console.log("  Browser closed.\n");
}

// ─── Phase 2: Generate promotional images ─────────────────────
// Design: "Vercel Frost" — clean white, indigo top accent, confident spacing

const C = {
  white: "#FFFFFF",
  bg: "#FAFAFA",           // Cool near-white
  bgEdge: "#F3F3F5",       // Subtle edge tint
  indigo: "#5b4fc7",
  indigoLight: "#7B6FE8",
  indigoFaint: "rgba(91,79,199,0.05)",
  text: "#111119",         // Near-black, slightly warm
  textMuted: "#64648C",    // Cool gray-indigo
  textLight: "#9898B0",
};

function loadFonts() {
  return {
    regular: readFileSync("/usr/share/fonts/rsms-inter-fonts/Inter-Regular.ttf"),
    bold: readFileSync("/usr/share/fonts/rsms-inter-fonts/Inter-Bold.ttf"),
  };
}

function loadOwlIcon() {
  const p = resolve(import.meta.dirname, "../public/icon/128.png");
  if (!existsSync(p)) return null;
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
}

async function renderBackground(jsx, width, height, fonts) {
  const svg = await satori(jsx, { width, height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width * 2 } });
  return resvg.render().asPng();
}

// ─── Marquee background (1400x560) ───
function marqueeBackground(owlSrc) {
  return {
    type: "div",
    props: {
      style: {
        width: "100%", height: "100%", display: "flex",
        flexDirection: "row", alignItems: "center",
        background: `linear-gradient(180deg, ${C.white} 0%, ${C.bg} 100%)`,
        padding: "0 60px", fontFamily: "Inter", overflow: "hidden",
        position: "relative",
      },
      children: [
        // Top accent bar — bold indigo gradient, full width
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: "0", left: "0",
              width: "100%", height: "4px",
              background: `linear-gradient(90deg, ${C.indigo} 0%, ${C.indigoLight} 50%, ${C.indigo} 100%)`,
            },
          },
        },
        // Subtle radial glow — centered behind screenshot area
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: "50px", right: "100px",
              width: "600px", height: "400px", borderRadius: "300px",
              background: `radial-gradient(circle, rgba(91,79,199,0.04) 0%, transparent 70%)`,
            },
          },
        },
        // Left content
        {
          type: "div",
          props: {
            style: {
              display: "flex", flexDirection: "column", maxWidth: "400px",
            },
            children: [
              // Logo row
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "row", alignItems: "center", gap: "12px", marginBottom: "16px" },
                  children: [
                    owlSrc ? {
                      type: "img",
                      props: { src: owlSrc, width: 40, height: 40, style: { borderRadius: "10px" } },
                    } : null,
                    {
                      type: "div",
                      props: {
                        style: { fontSize: "34px", fontWeight: 700, color: C.text, letterSpacing: "-0.04em" },
                        children: "BetterLectio",
                      },
                    },
                  ].filter(Boolean),
                },
              },
              // Tagline
              {
                type: "div",
                props: {
                  style: { fontSize: "17px", color: C.textMuted, lineHeight: "1.55", letterSpacing: "-0.01em" },
                  children: "Et moderne design til Lectio — med skema, lektier, opgaver og hurtig søgning.",
                },
              },
              // Feature pills
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "row", gap: "6px", marginTop: "22px", flexWrap: "wrap" },
                  children: ["Skema", "Forside", "Lektier", "Søgning"].map(label => ({
                    type: "div",
                    props: {
                      style: {
                        fontSize: "11px", fontWeight: 500, color: C.indigo,
                        background: C.indigoFaint,
                        border: "1px solid rgba(91,79,199,0.1)",
                        borderRadius: "14px", padding: "4px 12px",
                      },
                      children: label,
                    },
                  })),
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ─── Screenshot card background (1280x800) ───
function cardBackground(title, subtitle, owlSrc) {
  return {
    type: "div",
    props: {
      style: {
        width: "100%", height: "100%", display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
        background: `linear-gradient(180deg, ${C.white} 0%, ${C.bg} 100%)`,
        fontFamily: "Inter", overflow: "hidden",
        padding: "0", position: "relative",
      },
      children: [
        // Top accent bar
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: "0", left: "0",
              width: "100%", height: "3px",
              background: `linear-gradient(90deg, ${C.indigo} 0%, ${C.indigoLight} 50%, ${C.indigo} 100%)`,
            },
          },
        },
        // Header area
        {
          type: "div",
          props: {
            style: {
              display: "flex", flexDirection: "row", alignItems: "center",
              gap: "8px", paddingTop: "20px", paddingBottom: "12px",
            },
            children: [
              owlSrc ? {
                type: "img",
                props: { src: owlSrc, width: 18, height: 18, style: { borderRadius: "4px" } },
              } : null,
              {
                type: "div",
                props: {
                  style: { fontSize: "12px", fontWeight: 700, color: C.text, letterSpacing: "-0.01em" },
                  children: "BetterLectio",
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: "12px", color: C.textLight },
                  children: `— ${title}`,
                },
              },
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}

// ─── Sharp compositing helpers ───

async function roundCorners(buf, w, h, r) {
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/></svg>`
  );
  return sharp(buf).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

function shadowSvg(w, h, r, blur, color) {
  const sw = w + blur * 4;
  const sh = h + blur * 4;
  return Buffer.from(
    `<svg width="${sw}" height="${sh}">
      <defs><filter id="s"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>
      <rect x="${blur*2}" y="${blur*2}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${color}" filter="url(#s)"/>
    </svg>`
  );
}

async function compositeScreenshotCard(bgPng, screenshotPath, outputPath) {
  // @2x output: 2560x1600
  const outW = 2560;
  const outH = 1600;
  const HEADER_H = 104;  // @2x: 52px logical header space
  const PAD_X = 80;      // @2x: 40px logical side padding
  const PAD_BOT = 60;    // @2x: 30px logical bottom padding
  const RADIUS = 24;     // @2x corner radius

  const ssMaxW = outW - PAD_X * 2; // 2400
  const ssMaxH = outH - HEADER_H - PAD_BOT; // 1436

  // Fit FULLY, no crop
  const screenshot = await sharp(screenshotPath)
    .resize(ssMaxW, ssMaxH, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(screenshot).metadata();
  const ssW = meta.width;
  const ssH = meta.height;

  const rounded = await roundCorners(screenshot, ssW, ssH, RADIUS);
  const shadow = shadowSvg(ssW, ssH, RADIUS, 24, "rgba(17,17,25,0.10)");

  // Center horizontally, place below header
  const x = Math.round((outW - ssW) / 2);
  const y = HEADER_H;

  // Thin border around screenshot for crispness
  const borderSvg = Buffer.from(
    `<svg width="${ssW + 2}" height="${ssH + 2}">
      <rect x="0.5" y="0.5" width="${ssW + 1}" height="${ssH + 1}" rx="${RADIUS}" ry="${RADIUS}" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
    </svg>`
  );

  await sharp(bgPng)
    .composite([
      { input: shadow, left: x - 48, top: y - 24 },
      { input: rounded, left: x, top: y },
      { input: borderSvg, left: x - 1, top: y - 1 },
    ])
    .toFile(outputPath);
}

async function compositeMarquee(bgPng, screenshotPath, outputPath) {
  // @2x output: 2800x1120
  const outW = 2800;
  const outH = 1120;
  const RADIUS = 20;

  // Screenshot on the right, constrained to fit fully
  const ssMaxW = 1560;
  const ssMaxH = outH - 100; // 50px padding top+bottom

  const screenshot = await sharp(screenshotPath)
    .resize(ssMaxW, ssMaxH, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(screenshot).metadata();
  const ssW = meta.width;
  const ssH = meta.height;

  const rounded = await roundCorners(screenshot, ssW, ssH, RADIUS);
  const shadow = shadowSvg(ssW, ssH, RADIUS, 30, "rgba(91,79,199,0.10)");

  // Right-aligned, vertically centered
  const x = outW - ssW - 60;
  const y = Math.round((outH - ssH) / 2);

  const borderSvg = Buffer.from(
    `<svg width="${ssW + 2}" height="${ssH + 2}">
      <rect x="0.5" y="0.5" width="${ssW + 1}" height="${ssH + 1}" rx="${RADIUS}" ry="${RADIUS}" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
    </svg>`
  );

  await sharp(bgPng)
    .composite([
      { input: shadow, left: x - 60, top: y - 30 },
      { input: rounded, left: x, top: y },
      { input: borderSvg, left: x - 1, top: y - 1 },
    ])
    .toFile(outputPath);
}

async function generatePromoImages() {
  console.log("═══ PHASE 2: Generate Promotional Images ═══\n");

  const { regular, bold } = loadFonts();
  const fonts = [
    { name: "Inter", data: regular, weight: 400, style: "normal" },
    { name: "Inter", data: bold, weight: 700, style: "normal" },
  ];
  const owl = loadOwlIcon();

  // 1. Marquee banner (1400x560)
  console.log("  Generating: promo-marquee.png (1400x560)...");
  const marqueeBg = await renderBackground(marqueeBackground(owl), 1400, 560, fonts);
  const scheduleFile = `${OUT_DIR}/1-schedule.png`;
  if (existsSync(scheduleFile)) {
    await compositeMarquee(marqueeBg, scheduleFile, `${OUT_DIR}/promo-marquee.png`);
  } else {
    await sharp(marqueeBg).toFile(`${OUT_DIR}/promo-marquee.png`);
  }
  console.log("    -> promo-marquee.png");

  // 2. Screenshot cards (1280x800) — Lektier replaces Opgaver
  const cards = [
    { screenshot: "1-schedule", name: "promo-schedule", title: "Skema", subtitle: "Ugentligt overblik med farvekodede moduler" },
    { screenshot: "2-forside", name: "promo-forside", title: "Forside", subtitle: "Personlig velkomst med dagens overblik" },
    { screenshot: "5-lektier", name: "promo-lektier", title: "Lektier", subtitle: "Dag-grupperet overblik med filer og noter" },
    { screenshot: "4-findskema", name: "promo-findskema", title: "Find Skema", subtitle: "Hurtig søgning med person-kort og favoritter" },
  ];

  for (const card of cards) {
    const ssFile = `${OUT_DIR}/${card.screenshot}.png`;
    if (!existsSync(ssFile)) { console.log(`  Skipping ${card.name} (no screenshot: ${card.screenshot})`); continue; }
    console.log(`  Generating: ${card.name}.png (1280x800)...`);
    const bgPng = await renderBackground(cardBackground(card.title, card.subtitle, owl), 1280, 800, fonts);
    await compositeScreenshotCard(bgPng, ssFile, `${OUT_DIR}/${card.name}.png`);
    console.log(`    -> ${card.name}.png`);
  }

  console.log("\n  All promotional images generated!\n");
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const skipCapture = process.argv.includes("--promo-only");

  if (!skipCapture) {
    await captureScreenshots();
  } else {
    console.log("\n  Skipping screenshot capture (--promo-only flag)\n");
  }

  await generatePromoImages();

  console.log("═══ Done! ═══");
  console.log(`\nAll files in: ${OUT_DIR}/\n`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
