import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || req.headers.get('authorization') !== `Bearer ${serviceKey}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data: failed, error: listError } = await admin
    .from('profile_picture_submissions')
    .select('storage_path')
    .eq('status', 'failed')
    .lt('updated_at', cutoff);
  if (listError) return Response.json({ error: listError.message }, { status: 500 });

  const { data: reviewed, error: reviewedError } = await admin
    .from('profile_picture_submissions')
    .select('storage_path')
    .in('status', ['approved', 'rejected'])
    .is('source_deleted_at', null)
    .lt('reviewed_at', new Date(Date.now() - 60 * 60_000).toISOString());
  if (reviewedError) return Response.json({ error: reviewedError.message }, { status: 500 });

  const paths = [...new Set([...(failed ?? []), ...(reviewed ?? [])].map((row) => row.storage_path))];
  if (paths.length) {
    const { error } = await admin.storage.from('profile-picture-submissions').remove(paths);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await admin.from('profile_picture_submissions')
      .update({ source_deleted_at: new Date().toISOString() })
      .in('storage_path', paths);
  }
  const { data, error } = await admin.rpc('cleanup_referral_and_profile_upload_data');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    ok: true,
    storageObjectsDeleted: paths.length,
    ...((data ?? {}) as Record<string, unknown>),
  });
});
