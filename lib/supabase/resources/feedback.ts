import { sendRpc, sendStorageUpload } from '../client';
import { getDistinctId } from '@/lib/posthog';

export type FeedbackCategory = 'bug' | 'idea' | 'other';

export type FeedbackSubmitInput = {
  studentId: string;
  schoolId: number;
  category: FeedbackCategory;
  message: string;
  browserInfo?: string;
  lectioVersion?: string;
  screenshot?: {
    /** Base64 without data: prefix */
    base64: string;
    mimeType: string;
    byteSize: number;
    width?: number;
    height?: number;
  } | null;
};

export type FeedbackSubmitResult =
  | { ok: true; feedbackId: string; attachmentError?: string }
  | { ok: false; error: string };

/**
 * Submit private feedback via submit_feedback RPC (+ optional Storage screenshot).
 */
export async function submitFeedback(
  input: FeedbackSubmitInput,
): Promise<FeedbackSubmitResult> {
  const message = input.message.trim();
  if (!message) return { ok: false, error: 'Message required' };
  if (!input.studentId || !Number.isFinite(input.schoolId)) {
    return { ok: false, error: 'Not signed in' };
  }

  const version = browser.runtime.getManifest().version;
  const context: Record<string, unknown> = {
    app_version: version,
    browser_info: input.browserInfo ?? null,
    lectio_version: input.lectioVersion ?? null,
    locale: typeof navigator !== 'undefined' ? navigator.language : null,
    posthog_distinct_id: getDistinctId(input.studentId),
  };

  const resp = await sendRpc('submit_feedback', {
    p_student_id: input.studentId,
    p_school_id: input.schoolId,
    p_category: input.category,
    p_message: message.slice(0, 4000),
    p_platform: 'extension',
    p_context: context,
  });

  if (!resp.ok) {
    return { ok: false, error: resp.error ?? 'Submit failed' };
  }

  const feedbackId = typeof resp.data === 'string' ? resp.data : String(resp.data ?? '');
  if (!feedbackId) {
    return { ok: false, error: 'No feedback id returned' };
  }

  const shot = input.screenshot;
  if (shot?.base64) {
    const mime = shot.mimeType || 'image/jpeg';
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : 'jpg';
    // Normalize content-type — some browsers report image/jpg
    const contentType =
      mime === 'image/jpg' || (!mime.startsWith('image/') && ext === 'jpg')
        ? 'image/jpeg'
        : mime;
    const path = `${input.schoolId}/${input.studentId}/${feedbackId}/${crypto.randomUUID()}.${ext}`;
    const upload = await sendStorageUpload({
      bucket: 'feedback-attachments',
      path,
      dataBase64: shot.base64,
      contentType,
    });
    if (!upload.ok) {
      console.warn('[feedback] screenshot upload failed:', upload.error);
      return {
        ok: true,
        feedbackId,
        attachmentError: upload.error || 'Screenshot upload failed',
      };
    }

    const reg = await sendRpc('register_feedback_attachment', {
      p_feedback_id: feedbackId,
      p_kind: 'screenshot',
      p_storage_path: path,
      p_mime_type: contentType,
      p_byte_size: shot.byteSize,
      p_width: shot.width ?? null,
      p_height: shot.height ?? null,
    });
    if (!reg.ok) {
      console.warn('[feedback] register_feedback_attachment failed:', reg.error);
      return {
        ok: true,
        feedbackId,
        attachmentError: reg.error || 'Could not register screenshot',
      };
    }
  }

  return { ok: true, feedbackId };
}
