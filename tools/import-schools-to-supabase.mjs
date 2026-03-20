import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BATCH_SIZE = 100;
const SCHOOL_LINK_RE = /<a\s+href="\/lectio\/(\d+)\/default\.aspx">([\s\S]*?)<\/a>/g;

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseSchools(html) {
  const schools = [];

  for (const match of html.matchAll(SCHOOL_LINK_RE)) {
    const id = Number.parseInt(match[1], 10);
    const name = decodeHtml(match[2]);

    if (!Number.isFinite(id) || !name) {
      continue;
    }

    schools.push({ id, name });
  }

  return schools;
}

async function upsertSchools(supabase, schools) {
  for (let i = 0; i < schools.length; i += BATCH_SIZE) {
    const batch = schools.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('school').upsert(batch, { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to upsert batch starting at index ${i}: ${error.message}`);
    }
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const htmlPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(process.cwd(), 'schools.html');

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL environment variable.');
  }

  if (!supabaseKey) {
    throw new Error(
      'Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY, or VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  const html = await readFile(htmlPath, 'utf8');
  const schools = parseSchools(html);

  if (schools.length === 0) {
    throw new Error(`No schools found in ${htmlPath}.`);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await upsertSchools(supabase, schools);

  console.log(`Upserted ${schools.length} schools into public.school.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
