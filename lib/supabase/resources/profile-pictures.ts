import { sendProfilePictureSubmission, sendRpc } from '../client';

export type ProfilePictureSubmissionStatus = 'uploading' | 'pending' | 'approved' | 'rejected';

export interface ProfilePictureState {
  unlocked: boolean;
  referralConversions: number;
  unlockThreshold: number;
  currentUrl: string | null;
  approvedAt: string | null;
  nextEligibleAt: string | null;
  canSubmit: boolean;
  submission: {
    id: string;
    status: ProfilePictureSubmissionStatus;
    createdAt: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    reviewNote: string | null;
    approvedUrl: string | null;
  } | null;
}

export type ProfilePictureSubmitResult =
  | { ok: true }
  | { ok: false; error: string; code?: string; nextEligibleAt?: string | null };

function asState(value: unknown): ProfilePictureState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ProfilePictureState>;
  return {
    unlocked: raw.unlocked === true,
    referralConversions: Number(raw.referralConversions ?? 0),
    unlockThreshold: Number(raw.unlockThreshold ?? 3),
    currentUrl: typeof raw.currentUrl === 'string' ? raw.currentUrl : null,
    approvedAt: typeof raw.approvedAt === 'string' ? raw.approvedAt : null,
    nextEligibleAt: typeof raw.nextEligibleAt === 'string' ? raw.nextEligibleAt : null,
    canSubmit: raw.canSubmit === true,
    submission: raw.submission && typeof raw.submission === 'object'
      ? raw.submission as ProfilePictureState['submission']
      : null,
  };
}

export async function getMyProfilePictureState(studentId: string): Promise<ProfilePictureState | null> {
  const response = await sendRpc('get_my_profile_picture_state', { p_student_id: studentId });
  if (!response.ok) return null;
  return asState(response.data);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function submitProfilePicture(
  studentId: string,
  schoolId: number,
  file: File,
): Promise<ProfilePictureSubmitResult> {
  const response = await sendProfilePictureSubmission({
    studentId,
    schoolId,
    dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
    contentType: file.type,
    fileName: file.name || 'profile-picture',
  });
  if (response.ok) return { ok: true };
  const detail = response.data && typeof response.data === 'object'
    ? response.data as Record<string, unknown>
    : null;
  return {
    ok: false,
    error: response.error ?? 'Upload failed',
    code: typeof detail?.code === 'string' ? detail.code : undefined,
    nextEligibleAt: typeof detail?.nextEligibleAt === 'string' ? detail.nextEligibleAt : null,
  };
}
