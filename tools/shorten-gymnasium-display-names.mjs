import { createClient } from '@supabase/supabase-js';

const GYMNASIUM_SUFFIX_RE = /\s+Gymnasium$/;

function shortenName(name) {
  return name.replace(GYMNASIUM_SUFFIX_RE, ' Gym');
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL environment variable.');
  }

  if (!supabaseKey) {
    throw new Error(
      'Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY, or VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  const dryRun = process.argv.includes('--dry-run');

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: schools, error: fetchError } = await supabase
    .from('schools')
    .select('id, name, display_name')
    .ilike('name', '% Gymnasium');

  if (fetchError) {
    throw new Error(`Failed to fetch schools: ${fetchError.message}`);
  }

  if (!schools || schools.length === 0) {
    console.log('No schools ending in "Gymnasium" found.');
    return;
  }

  const updates = schools
    .map((school) => ({
      id: school.id,
      name: school.name,
      current: school.display_name,
      next: shortenName(school.name),
    }))
    .filter((row) => row.current !== row.next);

  if (updates.length === 0) {
    console.log(`Found ${schools.length} Gymnasium schools, all already have the correct display_name.`);
    return;
  }

  console.log(`Found ${schools.length} Gymnasium schools, ${updates.length} need updating:`);
  for (const row of updates) {
    console.log(`  [${row.id}] ${row.name} -> ${row.next}${row.current ? ` (was: ${row.current})` : ''}`);
  }

  if (dryRun) {
    console.log('\nDry run — no changes written.');
    return;
  }

  let updated = 0;
  for (const row of updates) {
    const { error } = await supabase
      .from('schools')
      .update({ display_name: row.next })
      .eq('id', row.id);

    if (error) {
      throw new Error(`Failed to update school ${row.id}: ${error.message}`);
    }
    updated += 1;
  }

  console.log(`\nUpdated ${updated} school display_name(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
