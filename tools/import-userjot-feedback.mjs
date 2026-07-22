/**
 * Import UserJot feedback (CSV or JSON) into public.feedback_items.
 *
 * Default author: Jonathan Bangert (all rows attributed to him).
 * Imports: title, body, status, category, timestamps, attachment images.
 * Skips: tags, comments, votes (stored only in admin_notes when present).
 *
 * Usage (from repo root or extension/):
 *   node extension/tools/import-userjot-feedback.mjs [--dry-run] path/to/test.csv
 *   node extension/tools/import-userjot-feedback.mjs --apply path/to/userjot-tickets.json
 *
 * Env (admin/.env.local or shell):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional overrides:
 *   IMPORT_STUDENT_ID  IMPORT_SCHOOL_ID  IMPORT_SUPABASE_UID
 */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve, extname, basename } from "node:path";
import { randomUUID } from "node:crypto";

// Jonathan Bangert — school 94 / Aarhus Katedralskole
const DEFAULT_STUDENT_ID = "72721772841";
const DEFAULT_SCHOOL_ID = 94;
const DEFAULT_SUPABASE_UID = "88d6430e-52a6-42cf-a0b9-cb20c4bcd6ca";

const IMPORT_SOURCE = "userjot";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MESSAGE = 4000;
const MAX_TITLE = 200;

const STATUS_MAP = {
  pending: "pending",
  review: "review",
  reviewing: "review",
  planned: "planned",
  progress: "in_progress",
  in_progress: "in_progress",
  "in progress": "in_progress",
  completed: "completed",
  closed: "declined",
  declined: "declined",
  duplicate: "duplicate",
  PENDING: "pending",
  REVIEW: "review",
  PLANNED: "planned",
  PROGRESS: "in_progress",
  COMPLETED: "completed",
  CLOSED: "declined",
  DECLINED: "declined",
  DUPLICATE: "duplicate",
};

const CATEGORY_MAP = {
  features: "idea",
  feature: "idea",
  ideas: "idea",
  idea: "idea",
  bugs: "bug",
  bug: "bug",
  other: "other",
};

function parseArgs(argv) {
  const args = {
    apply: false,
    dryRun: true,
    path: null,
    limit: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else if (a === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
    } else if (a === "--limit") {
      args.limit = Number.parseInt(argv[++i], 10);
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      args.path = a;
    }
  }
  return args;
}

function requireEnv(...keys) {
  for (const k of keys) {
    if (process.env[k]) return process.env[k];
  }
  return null;
}

/** Minimal CSV parser that handles quoted multiline fields. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });
}

function splitUrls(value) {
  if (!value || !String(value).trim()) return [];
  const s = String(value).trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String).filter((u) => u.startsWith("http"));
    } catch {
      /* fall through */
    }
  }
  return s
    .split(/[\s|;,]+/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"));
}

function toIso(value) {
  if (!value || !String(value).trim()) return null;
  let v = String(value).trim().replace(" ", "T");
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) v += "Z";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function mapStatus(raw) {
  if (!raw) return "pending";
  const key = String(raw).trim();
  return STATUS_MAP[key] || STATUS_MAP[key.toLowerCase()] || "pending";
}

function mapCategory(raw) {
  if (!raw) return "other";
  const key = String(raw).trim().toLowerCase();
  return CATEGORY_MAP[key] || "other";
}

function normalizeRow(raw) {
  // Support both test.csv shape and our userjot-tickets.json shape
  const id =
    (raw.id || raw.import_external_id || raw.external_id || raw.slug || "").trim();
  const title = (raw.title || "").trim() || null;
  let message = (raw.message || raw.body || "").trim();
  if (!message) message = title || "(no description)";
  if (message.length > MAX_MESSAGE) message = message.slice(0, MAX_MESSAGE);

  const titleOut = title
    ? title.length > MAX_TITLE
      ? title.slice(0, MAX_TITLE)
      : title
    : null;

  const status = mapStatus(raw.status || raw.status_raw);
  const category = mapCategory(raw.category || raw.board);
  const image_urls = Array.isArray(raw.image_urls)
    ? raw.image_urls
    : splitUrls(raw.image_urls || raw.attachments || "");

  const author = (raw.author || raw.authorName || "").trim() || null;
  const authorEmail = (raw.author_email || raw.authorEmail || "").trim() || null;
  const url = (raw.url || raw.import_url || "").trim() || null;
  const votesRaw = raw.votes;
  const votes =
    votesRaw === null || votesRaw === undefined || votesRaw === ""
      ? null
      : Number.parseInt(String(votesRaw), 10);

  const created_at = toIso(raw.created_at || raw.createdAt);
  const updated_at = toIso(raw.updated_at || raw.updatedAt);

  if (!id) return null;

  return {
    id,
    title: titleOut,
    message,
    status,
    category,
    image_urls,
    author,
    authorEmail,
    url,
    votes: Number.isFinite(votes) ? votes : null,
    created_at,
    updated_at,
  };
}

function buildAdminNotes(row) {
  const bits = ["Imported from UserJot."];
  if (row.author) bits.push(`Original author: ${row.author}`);
  if (row.authorEmail) bits.push(`Author email: ${row.authorEmail}`);
  if (row.votes != null) bits.push(`Votes: ${row.votes}`);
  return bits.join(" ");
}

function extFromMime(mime, url) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  const m = String(url).match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  return "jpg";
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { Accept: "image/*,*/*" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0) throw new Error("empty body");
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`too large (${buf.byteLength} bytes)`);
  }
  let mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!mime.startsWith("image/")) {
    // Guess from magic bytes
    if (buf[0] === 0x89 && buf[1] === 0x50) mime = "image/png";
    else if (buf[0] === 0xff && buf[1] === 0xd8) mime = "image/jpeg";
    else if (buf[0] === 0x52 && buf[1] === 0x49) mime = "image/webp";
    else mime = "image/jpeg";
  }
  // Bucket only allows jpeg/png/webp/text
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    if (mime === "image/gif") {
      // store as other? bucket may reject — skip gif
      throw new Error(`unsupported mime ${mime}`);
    }
    throw new Error(`unsupported mime ${mime}`);
  }
  return { buf, mime, byteSize: buf.byteLength };
}

async function loadRows(filePath) {
  const abs = resolve(process.cwd(), filePath);
  const text = await readFile(abs, "utf8");
  const ext = extname(abs).toLowerCase();
  let rawRows;
  if (ext === ".json") {
    const data = JSON.parse(text);
    rawRows = Array.isArray(data) ? data : data.tickets || data.posts || data.rows || [];
  } else {
    rawRows = parseCsv(text);
  }
  return rawRows.map(normalizeRow).filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv);
  const filePath =
    args.path ||
    resolve(process.cwd(), "test.csv");

  const supabaseUrl = requireEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_KEY",
  );
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (load admin/.env.local).",
    );
  }

  const studentId = process.env.IMPORT_STUDENT_ID || DEFAULT_STUDENT_ID;
  const schoolId = Number.parseInt(
    process.env.IMPORT_SCHOOL_ID || String(DEFAULT_SCHOOL_ID),
    10,
  );
  const supabaseUid = process.env.IMPORT_SUPABASE_UID || DEFAULT_SUPABASE_UID;

  let rows = await loadRows(filePath);
  if (args.limit != null && Number.isFinite(args.limit)) {
    rows = rows.slice(0, args.limit);
  }

  console.log(`Loaded ${rows.length} rows from ${basename(filePath)}`);
  console.log(
    `Author → student_id=${studentId} school_id=${schoolId} uid=${supabaseUid}`,
  );
  console.log(args.dryRun ? "Mode: DRY-RUN (no writes)" : "Mode: APPLY");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Existing imports for idempotency
  const { data: existing, error: existErr } = await supabase
    .from("feedback_items")
    .select("id, import_external_id")
    .eq("import_source", IMPORT_SOURCE);
  if (existErr) {
    throw new Error(
      `Failed to list existing imports (did migration run?): ${existErr.message}`,
    );
  }
  const existingByExt = new Map(
    (existing || []).map((r) => [r.import_external_id, r.id]),
  );
  console.log(`Already imported: ${existingByExt.size}`);

  const stats = {
    skipped: 0,
    inserted: 0,
    imagesOk: 0,
    imagesFail: 0,
    errors: 0,
  };

  for (const [index, row] of rows.entries()) {
    const label = `[${index + 1}/${rows.length}] ${row.id.slice(0, 12)}… ${row.title || "(no title)"}`;

    if (existingByExt.has(row.id)) {
      console.log(`  skip (exists) ${label}`);
      stats.skipped++;
      continue;
    }

    if (args.dryRun) {
      console.log(
        `  would insert ${label} status=${row.status} cat=${row.category} imgs=${row.image_urls.length}`,
      );
      stats.inserted++;
      continue;
    }

    const feedbackId = randomUUID();
    const now = new Date().toISOString();
    const item = {
      id: feedbackId,
      student_id: studentId,
      school_id: schoolId,
      supabase_uid: supabaseUid,
      category: row.category,
      status: row.status,
      title: row.title,
      message: row.message,
      platform: "extension",
      admin_notes: buildAdminNotes(row),
      tags: ["imported:userjot"],
      import_source: IMPORT_SOURCE,
      import_external_id: row.id,
      import_url: row.url,
      created_at: row.created_at || now,
      updated_at: row.updated_at || row.created_at || now,
      last_status_changed_at: row.updated_at || row.created_at || now,
      last_status_changed_by: "import:userjot",
    };

    const { error: insErr } = await supabase.from("feedback_items").insert(item);
    if (insErr) {
      console.error(`  ERROR insert ${label}: ${insErr.message}`);
      stats.errors++;
      continue;
    }

    const { error: evErr } = await supabase.from("feedback_status_events").insert({
      feedback_id: feedbackId,
      from_status: null,
      to_status: row.status,
      actor: "import:userjot",
      note: "imported from UserJot",
    });
    if (evErr) {
      console.warn(`  warn status event: ${evErr.message}`);
    }

    for (const [imgIdx, imageUrl] of row.image_urls.entries()) {
      try {
        const { buf, mime, byteSize } = await downloadImage(imageUrl);
        const ext = extFromMime(mime, imageUrl);
        const storagePath = `${schoolId}/${studentId}/${feedbackId}/userjot-${imgIdx}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("feedback-attachments")
          .upload(storagePath, buf, {
            contentType: mime,
            upsert: true,
          });
        if (upErr) throw new Error(`upload: ${upErr.message}`);

        const { error: attErr } = await supabase.from("feedback_attachments").insert({
          feedback_id: feedbackId,
          kind: "screenshot",
          storage_path: storagePath,
          mime_type: mime,
          byte_size: byteSize,
        });
        if (attErr) throw new Error(`register: ${attErr.message}`);
        stats.imagesOk++;
      } catch (e) {
        console.warn(
          `  image fail ${imageUrl}: ${e instanceof Error ? e.message : e}`,
        );
        stats.imagesFail++;
      }
    }

    existingByExt.set(row.id, feedbackId);
    stats.inserted++;
    console.log(`  ok ${label}`);
  }

  console.log("\nDone.");
  console.log(stats);
  if (args.dryRun) {
    console.log("Re-run with --apply to write.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
