import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
const MAX_DIMENSION = 8_000;
const STUDENT_RE = /^[0-9A-Za-z_-]{1,48}$/;
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status = 400, extra?: Record<string, unknown>): Response {
  return json({ ok: false, code, error: message, ...extra }, status);
}

function detectedMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === 'image/png' && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }
      offset += 2 + length;
    }
  }
  if (mime === 'image/webp' && bytes.length >= 30) {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    if (kind === 'VP8X') {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
    if (kind === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return {
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      };
    }
    if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return error('method_not_allowed', 'Method not allowed', 405);
  if (Deno.env.get('PROFILE_PICTURES_ENABLED') === 'false') {
    return error('feature_disabled', 'Profile picture submissions are temporarily unavailable', 503);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return error('unauthorized', 'Missing bearer token', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const uid = authData?.user?.id;
  if (authError || !uid) return error('unauthorized', 'Unauthorized', 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error('invalid_request', 'Expected multipart form data');
  }

  const studentId = String(form.get('studentId') ?? '').trim();
  const schoolId = Number(String(form.get('schoolId') ?? ''));
  const platform = String(form.get('platform') ?? '').trim();
  const file = form.get('file');

  if (!STUDENT_RE.test(studentId) || !Number.isInteger(schoolId) || schoolId <= 0) {
    return error('invalid_request', 'Invalid student');
  }
  if (platform !== 'extension' && platform !== 'android' && platform !== 'ios') {
    return error('invalid_request', 'Invalid platform');
  }
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_BYTES) {
    return error('invalid_file', `Choose an image smaller than ${MAX_BYTES / 1024 / 1024} MB`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectedMime(bytes);
  if (!mime || !MIME_EXT[mime] || (file.type && file.type !== mime)) {
    return error('invalid_file', 'Only JPEG, PNG, and WebP images are supported');
  }
  const dimensions = imageDimensions(bytes, mime);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0 ||
      dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION ||
      dimensions.width * dimensions.height > MAX_PIXELS) {
    return error('invalid_file', 'Image dimensions are invalid or exceed the 25 megapixel limit');
  }

  const { data: student, error: studentError } = await admin
    .from('students')
    .select('id, school_id, supabase_id')
    .eq('id', studentId)
    .eq('school_id', schoolId)
    .eq('supabase_id', uid)
    .maybeSingle();
  if (studentError || !student) return error('unauthorized', 'Unauthorized', 401);

  // Release an interrupted upload after 15 minutes so it cannot block retry forever.
  await admin
    .from('profile_picture_submissions')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .eq('status', 'uploading')
    .lt('created_at', new Date(Date.now() - 15 * 60_000).toISOString());

  const { data: stateData, error: stateError } = await userClient.rpc(
    'get_my_profile_picture_state',
    { p_student_id: studentId },
  );
  if (stateError || !stateData || typeof stateData !== 'object') {
    return error('unauthorized', 'Could not verify profile', 401);
  }
  const state = stateData as Record<string, unknown>;
  if (!state.unlocked) return error('not_unlocked', 'Invite three classmates to unlock this feature', 403);
  const submission = state.submission as Record<string, unknown> | null;
  if (submission && (submission.status === 'uploading' || submission.status === 'pending')) {
    return error('pending_exists', 'You already have a picture awaiting review', 409);
  }
  if (!state.canSubmit) {
    return error('cooldown', 'Your next profile-picture change is not available yet', 409, {
      nextEligibleAt: state.nextEligibleAt ?? null,
    });
  }

  const id = crypto.randomUUID();
  const storagePath = `${schoolId}/${studentId}/${id}.${MIME_EXT[mime]}`;
  const now = new Date().toISOString();
  const { error: insertError } = await admin.from('profile_picture_submissions').insert({
    id,
    student_id: studentId,
    school_id: schoolId,
    supabase_uid: uid,
    platform,
    status: 'uploading',
    storage_path: storagePath,
    mime_type: mime,
    byte_size: bytes.byteLength,
    created_at: now,
    updated_at: now,
  });
  if (insertError) {
    const duplicate = insertError.code === '23505';
    return error(duplicate ? 'pending_exists' : 'submit_failed', duplicate
      ? 'You already have a picture awaiting review'
      : 'Could not create submission', duplicate ? 409 : 500);
  }

  const { error: uploadError } = await admin.storage
    .from('profile-picture-submissions')
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    await admin.from('profile_picture_submissions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', id);
    return error('upload_failed', 'Image upload failed', 500);
  }

  const submittedAt = new Date().toISOString();
  const { error: finalizeError } = await admin.from('profile_picture_submissions')
    .update({ status: 'pending', submitted_at: submittedAt, updated_at: submittedAt })
    .eq('id', id)
    .eq('status', 'uploading');
  if (finalizeError) {
    await admin.storage.from('profile-picture-submissions').remove([storagePath]);
    await admin.from('profile_picture_submissions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', id);
    return error('submit_failed', 'Could not finalize submission', 500);
  }

  return json({
    ok: true,
    submission: { id, status: 'pending', submittedAt },
  });
});
