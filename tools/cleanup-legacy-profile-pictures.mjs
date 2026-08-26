#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';

const execute = process.argv.includes('--execute');
const confirmed = process.argv.includes('--confirm=delete-legacy-lectio-pictures');
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}
if (execute && !confirmed) {
  throw new Error('Execution requires --confirm=delete-legacy-lectio-pictures');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = supabase.storage.from('profile-pictures');
const legacyPath = /^\d+\/\d+\.(?:jpe?g|png|webp|gif)$/i;

async function listAll(prefix) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const roots = await listAll('');
const schoolFolders = roots.filter((entry) => /^\d+$/.test(entry.name));
const paths = [];
let bytes = 0;

for (const folder of schoolFolders) {
  const objects = await listAll(folder.name);
  for (const object of objects) {
    const path = `${folder.name}/${object.name}`;
    if (!legacyPath.test(path)) continue;
    paths.push(path);
    bytes += Number(object.metadata?.size ?? 0);
  }
}

console.log(JSON.stringify({
  mode: execute ? 'execute' : 'dry-run',
  legacyObjects: paths.length,
  bytes,
  schoolFolders: schoolFolders.length,
}, null, 2));

if (!execute || paths.length === 0) process.exit(0);

for (let offset = 0; offset < paths.length; offset += 100) {
  const batch = paths.slice(offset, offset + 100);
  const { error } = await bucket.remove(batch);
  if (error) throw error;
}

const remaining = [];
for (const folder of schoolFolders) {
  for (const object of await listAll(folder.name)) {
    const path = `${folder.name}/${object.name}`;
    if (legacyPath.test(path)) remaining.push(path);
  }
}
if (remaining.length > 0) {
  throw new Error(`Cleanup incomplete: ${remaining.length} legacy objects remain`);
}

console.log(JSON.stringify({ deleted: paths.length, remaining: 0 }, null, 2));
