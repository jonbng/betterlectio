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
  const lectioWindow = window as Window & {
    __IL_PROFILE_PIC__?: string;
    __IL_CACHED_PROFILE__?: { pictureUrl?: string | null };
  };
  const lectioUrl = lectioWindow.__IL_PROFILE_PIC__ ?? lectioWindow.__IL_CACHED_PROFILE__?.pictureUrl;
  if (!lectioUrl) {
    return { ok: false, error: 'Could not find your current Lectio picture. Refresh Lectio and try again.' };
  }
  let lectioFile: File;
  try {
    const lectioResponse = await fetch(lectioUrl, { credentials: 'include' });
    if (!lectioResponse.ok) throw new Error('Lectio image request failed');
    const lectioBlob = await lectioResponse.blob();
    const lectioType = lectioBlob.type.split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(lectioType) || lectioBlob.size <= 0 || lectioBlob.size > 5 * 1024 * 1024) {
      throw new Error('Invalid Lectio image');
    }
    const extension = lectioType === 'image/png' ? 'png' : lectioType === 'image/webp' ? 'webp' : 'jpg';
    lectioFile = new File([lectioBlob], `lectio-profile.${extension}`, { type: lectioType });
  } catch {
    return { ok: false, error: 'Could not load your current Lectio picture. Refresh Lectio and try again.' };
  }
  const response = await sendProfilePictureSubmission({
    studentId,
    schoolId,
    dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
    contentType: file.type,
    fileName: file.name || 'profile-picture',
    lectioDataBase64: arrayBufferToBase64(await lectioFile.arrayBuffer()),
    lectioContentType: lectioFile.type,
    lectioFileName: lectioFile.name,
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
