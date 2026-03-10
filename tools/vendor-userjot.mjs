import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENTRY_URL = "https://cdn.userjot.com/sdk/v2/uj.js";
const ALLOWED_ORIGINS = new Set(["https://cdn.userjot.com"]);
const OUTPUT_ROOT = path.resolve("public/vendor/userjot");

const JS_EXTENSIONS = new Set([".js", ".mjs"]);
const ASSET_EXTENSIONS = new Set([".css"]);

function extractModuleSpecifiers(source) {
  const specifiers = new Set();

  // import ... from "x", export ... from "x"
  const fromRegex = /\b(?:import|export)\s+(?:[^"'`]+?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(fromRegex)) {
    specifiers.add(match[1]);
  }

  // import("x")
  const dynamicRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(dynamicRegex)) {
    specifiers.add(match[1]);
  }

  // fallback for embedded chunk paths in generated code
  const chunkRegex = /["'](\.\/chunks\/[^"']+\.(?:js|css))["']/g;
  for (const match of source.matchAll(chunkRegex)) {
    specifiers.add(match[1]);
  }

  return [...specifiers];
}

function toOutputPath(url) {
  const safePathname = url.pathname.replace(/^\/+/, "");
  return path.join(OUTPUT_ROOT, url.hostname, safePathname);
}

async function writeFetchedFile(url, bodyText) {
  const outputPath = toOutputPath(url);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bodyText, "utf8");
}

function shouldQueue(url) {
  if (!ALLOWED_ORIGINS.has(url.origin)) return false;
  const ext = path.extname(url.pathname);
  return JS_EXTENSIONS.has(ext) || ASSET_EXTENSIONS.has(ext);
}

async function fetchText(urlString) {
  const res = await fetch(urlString);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${urlString}: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function main() {
  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });

  const queue = [new URL(ENTRY_URL)];
  const seen = new Set();
  let fetchedCount = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    const key = current.href;
    if (seen.has(key)) continue;
    seen.add(key);

    const body = await fetchText(current.href);
    await writeFetchedFile(current, body);
    fetchedCount += 1;

    const ext = path.extname(current.pathname);
    if (!JS_EXTENSIONS.has(ext)) continue;

    for (const specifier of extractModuleSpecifiers(body)) {
      let resolved;
      try {
        resolved = new URL(specifier, current.href);
      } catch {
        continue;
      }
      if (!shouldQueue(resolved)) continue;
      if (!seen.has(resolved.href)) {
        queue.push(resolved);
      }
    }
  }

  const entryLocalPath = `/vendor/userjot/${new URL(ENTRY_URL).hostname}${new URL(ENTRY_URL).pathname}`;
  console.log(`[vendor-userjot] Downloaded ${fetchedCount} files`);
  console.log(`[vendor-userjot] Entry path: ${entryLocalPath}`);
}

main().catch((error) => {
  console.error("[vendor-userjot] Failed:", error);
  process.exitCode = 1;
});
