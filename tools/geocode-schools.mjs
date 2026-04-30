import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const GOOGLE_GEOCODE_ENDPOINT = 'https://geocode.googleapis.com/v4beta/geocode/address';
const GOOGLE_FIELD_MASK = 'results.placeId,results.location,results.formattedAddress';
const CONCURRENCY = 5;

function requireEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  throw new Error(`Missing required environment variable. Tried: ${names.join(', ')}`);
}

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, googleKey: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--google-key') {
      args.googleKey = argv[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (arg === '--limit') {
      const raw = argv[i + 1];
      const limit = raw ? Number.parseInt(raw, 10) : Number.NaN;

      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error(`Invalid --limit value: ${raw ?? '(missing)'}`);
      }

      args.limit = limit;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

async function geocodeSchool(name, googleKey) {
  const query = `${name}, Denmark`;
  const url = new URL(GOOGLE_GEOCODE_ENDPOINT);

  url.searchParams.set('address.addressLines', query);
  url.searchParams.set('languageCode', 'da');
  url.searchParams.set('regionCode', 'DK');

  const response = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': googleKey,
      'X-Goog-FieldMask': GOOGLE_FIELD_MASK,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google geocoding failed for "${query}" (${response.status}): ${body}`);
  }

  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results : [];

  if (results.length !== 1) {
    return {
      ok: false,
      query,
      reason: results.length === 0 ? 'no_results' : 'ambiguous_results',
      resultCount: results.length,
    };
  }

  const [result] = results;
  const lat = result?.location?.latitude;
  const lon = result?.location?.longitude;

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return {
      ok: false,
      query,
      reason: 'missing_coordinates',
      resultCount: results.length,
    };
  }

  return {
    ok: true,
    query,
    lat,
    lon,
    placeId: result.placeId ?? null,
    formattedAddress: result.formattedAddress ?? null,
  };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = requireEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseKey = requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
  const googleKey = args.googleKey ?? process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (!googleKey) {
    throw new Error('Missing Google Maps API key. Pass --google-key or set GOOGLE_MAPS_API_KEY.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let query = supabase
    .from('schools')
    .select('id, name, lat, lon')
    .or('lat.is.null,lon.is.null')
    .order('id', { ascending: true });

  if (args.limit != null) {
    query = query.limit(args.limit);
  }

  const { data: schools, error } = await query;

  if (error) {
    throw new Error(`Failed to load schools: ${error.message}`);
  }

  if (!schools?.length) {
    console.log('No schools need geocoding.');
    return;
  }

  console.log(`Geocoding ${schools.length} schools${args.dryRun ? ' (dry run)' : ''}...`);

  const successes = [];
  const misses = [];

  await runWithConcurrency(schools, CONCURRENCY, async (school) => {
    const result = await geocodeSchool(school.name, googleKey);

    if (!result.ok) {
      misses.push({
        id: school.id,
        name: school.name,
        query: result.query,
        reason: result.reason,
        resultCount: result.resultCount,
      });
      return;
    }

    if (!args.dryRun) {
      const { error: updateError } = await supabase
        .from('schools')
        .update({ lat: result.lat, lon: result.lon })
        .eq('id', school.id);

      if (updateError) {
        throw new Error(`Failed to update school ${school.id} (${school.name}): ${updateError.message}`);
      }
    }

    successes.push({
      id: school.id,
      name: school.name,
      lat: result.lat,
      lon: result.lon,
      formattedAddress: result.formattedAddress,
      placeId: result.placeId,
    });
  });

  console.log(
    JSON.stringify(
      {
        geocoded: successes.length,
        missed: misses.length,
        dryRun: args.dryRun,
        misses,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
