import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import {
  User,
  IdCard,
  Save,
  Loader2,
  Instagram,
  Check,
  ChevronDown,
  Lock,
  Cake,
  Phone,
  Mail,
  MapPin,
  Camera,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
  Copy,
  Share2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { createPortal } from 'preact/compat';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ProfilData, StudiekortData } from '@/lib/profil-parser';
import { fetchStudiekortData } from '@/lib/profil-parser';
import type { Tables } from '@/database.types';
import { useQuery, useMutation } from '@/lib/supabase/hooks';
import { invalidateStudentsCacheIfStale } from '@/lib/supabase/student-lookup';
import { getLoggedInUserId } from '@/lib/profile-cache';
import { capture, captureFeatureUsedOncePerSession, getDistinctId } from '@/lib/posthog';
import { formatInstagramHandle, normalizeInstagramHandle } from '@/lib/instagram';
import { useTranslation } from '@/lib/i18n';
import {
  getMyProfilePictureState,
  submitProfilePicture,
  type ProfilePictureState,
} from '@/lib/supabase/resources/profile-pictures';
import { buildReferralUrl } from '@/lib/supabase/resources/referrals';

type Student = Tables<'students'>;

// ── Helpers ─────────────────────────────────────────────────────────────

function triggerNativeSave(phone: string, email: string, altContact: string) {
  const phoneInput = document.getElementById(
    's_m_Content_Content_phoneno3txt_tb',
  ) as HTMLInputElement | null;
  const emailInput = document.getElementById(
    's_m_Content_Content_emailtxt_tb',
  ) as HTMLInputElement | null;
  const altContactInput = document.getElementById(
    's_m_Content_Content_alternativKontakt_tb',
  ) as HTMLInputElement | null;

  if (phoneInput) phoneInput.value = phone;
  if (emailInput) emailInput.value = email;
  if (altContactInput) altContactInput.value = altContact;

  const win = window as unknown as { __doPostBack?: (target: string, arg: string) => void };
  if (win.__doPostBack) {
    win.__doPostBack('s$m$Content$Content$stamdataSaveBtn', '');
  }
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} />
  );
}

// ── Studiekort Dialog ────────────────────────────────────────────────────

function StudiekortDialog({ schoolId }: { schoolId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StudiekortData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const fetchedRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetchStudiekortData(schoolId)
      .then(setData)
      .catch((err) => console.error('[BetterLectio] Failed to load studiekort:', err))
      .finally(() => setLoading(false));
  }, [open, schoolId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const portalTarget = document.getElementById('il-root') || document.body;

  const modal = open
    ? createPortal(
        <div
          className="fixed inset-0 z-200 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label={t('profilPage.closeStudiekort')}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200"
            onClick={() => setOpen(false)}
          />
          {/* Content */}
          <div
            ref={contentRef}
            className="relative z-10 bg-background w-full max-w-sm mx-4 rounded-xl border shadow-lg p-6 animate-in fade-in-0 zoom-in-95 duration-200"
          >
            <h2 className="text-lg font-semibold text-foreground mb-4">{t('profilPage.studiekort')}</h2>

            {loading && (
              <div className="space-y-4">
                <Skeleton className="w-full h-80 rounded-lg" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            )}

            {!loading && data && (
              <div
                className="relative rounded-2xl overflow-hidden p-4 flex flex-col"
                style={{ background: 'linear-gradient(160deg, oklch(0.45 0.16 265), oklch(0.38 0.12 280))' }}
              >
                <button
                  type="button"
                  className="w-full aspect-[3/4] rounded-xl overflow-hidden mb-4 flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: 'oklch(0.30 0.08 265 / 0.4)' }}
                  onClick={() => setShowQr(!showQr)}
                  title={showQr ? t('profilPage.showPhoto') : t('profilPage.showQr')}
                >
                  {showQr && data.qrUrl ? (
                    <img src={data.qrUrl} alt={t('profilPage.showQr')} className="w-full h-full object-contain bg-white p-3" />
                  ) : data.photoUrl ? (
                    <img src={data.photoUrl} alt={t('profilPage.showPhoto')} className="w-full h-full object-cover object-top" />
                  ) : (
                    <User className="w-12 h-12" style={{ color: 'oklch(0.65 0.06 265)' }} />
                  )}
                </button>
                <p className="text-lg font-bold leading-tight" style={{ color: 'oklch(0.96 0.01 265)' }}>
                  {data.name}
                </p>
                <p className="text-sm mt-1.5 font-medium" style={{ color: 'oklch(0.78 0.04 265)' }}>
                  {data.school}
                </p>
                <p className="text-sm mt-1" style={{ color: 'oklch(0.68 0.04 265)' }}>
                  {data.birthday}
                </p>
                {data.timestamp && (
                  <p className="text-xs mt-3 text-center" style={{ color: 'oklch(0.52 0.03 265)' }}>
                    {data.timestamp}
                  </p>
                )}
              </div>
            )}

            {!loading && !data && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {t('profilPage.fetchStudiekortFailed')}
              </p>
            )}
          </div>
        </div>,
        portalTarget,
      )
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all duration-150 cursor-pointer active:scale-[0.97]"
      >
        <IdCard className="size-4" />
        {t('profilPage.studiekort')}
      </button>
      {modal}
    </>
  );
}

// ── Saved indicator ─────────────────────────────────────────────────────

function SavedIndicator({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium transition-all duration-200',
        visible
          ? 'opacity-100 translate-y-0 text-[oklch(0.45_0.15_145)] dark:text-[oklch(0.70_0.12_145)]'
          : 'opacity-0 translate-y-1',
      )}
    >
      <Check className="size-3.5" strokeWidth={2.5} />
      {t('profilPage.saved')}
    </span>
  );
}

// ── Referral-unlocked profile picture ────────────────────────────────

export function ProfilePictureEditor({
  studentId,
  schoolId,
  onStateChange,
  hideWhenLocked = false,
}: {
  studentId: string;
  schoolId: string;
  onStateChange?: (state: ProfilePictureState | null) => void;
  hideWhenLocked?: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ProfilePictureState | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await getMyProfilePictureState(studentId);
    setState(next);
    onStateChange?.(next);
    setLoading(false);
  }, [studentId, onStateChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectFile(next: File | null) {
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) {
      setError(t('profilPage.profilePicture.invalidType'));
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      setError(t('profilPage.profilePicture.tooLarge'));
      return;
    }
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  }

  async function submit() {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    const result = await submitProfilePicture(studentId, Number(schoolId), file);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    selectFile(null);
    await refresh();
  }

  function rejectionLabel(reason: string | null): string {
    switch (reason) {
      case 'inappropriate': return t('profilPage.profilePicture.reasonInappropriate');
      case 'privacy_or_impersonation': return t('profilPage.profilePicture.reasonPrivacy');
      case 'unsuitable': return t('profilPage.profilePicture.reasonUnsuitable');
      default: return t('profilPage.profilePicture.reasonOther');
    }
  }

  async function copyReferralLink() {
    setError(null);
    try {
      await navigator.clipboard.writeText(buildReferralUrl(studentId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      capture('referral share link copied', getDistinctId(studentId), { method: 'copy' });
    } catch {
      setError(t('profilPage.profilePicture.copyFailed'));
    }
  }

  async function shareReferralLink() {
    if (typeof navigator.share !== 'function') {
      await copyReferralLink();
      return;
    }
    try {
      await navigator.share({
        title: 'BetterLectio',
        text: t('profilPage.profilePicture.shareText'),
        url: buildReferralUrl(studentId),
      });
      capture('referral share link copied', getDistinctId(studentId), { method: 'native_share' });
    } catch {
      // Closing the native share sheet is not an error.
    }
  }

  if (loading && !state) {
    if (hideWhenLocked) return null;
    return (
      <section id="bl-profile-picture-editor" className="scroll-mt-6" aria-label={t('profilPage.profilePicture.title')}>
        <Skeleton className="h-24 w-full rounded-xl" />
      </section>
    );
  }
  if (!state) {
    return (
      <section id="bl-profile-picture-editor" className="flex scroll-mt-6 items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">{t('profilPage.profilePicture.title')}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('profilPage.profilePicture.loadFailed')}</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="shrink-0 text-xs font-semibold text-primary hover:underline">
          {t('profilPage.profilePicture.tryAgain')}
        </button>
      </section>
    );
  }
  if (hideWhenLocked && !state.unlocked) return null;

  const active = state.submission?.status === 'pending' || state.submission?.status === 'uploading';
  const rejected = state.submission?.status === 'rejected';
  const nextDate = state.nextEligibleAt
    ? new Date(state.nextEligibleAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const canChoose = state.unlocked && state.canSubmit && !active;
  const canNativeShare = typeof navigator.share === 'function';
  const imageUrl = previewUrl || state.currentUrl;

  return (
    <section
      id="bl-profile-picture-editor"
      tabIndex={-1}
      className="scroll-mt-6 rounded-xl border border-border bg-background px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <div className="flex items-start gap-3.5">
        <div className="relative shrink-0">
          <div className="h-16 w-12 overflow-hidden rounded-lg border border-border bg-muted">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-full w-full object-cover object-top" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {state.unlocked ? <Camera className="size-5" /> : <Lock className="size-4" />}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{t('profilPage.profilePicture.title')}</h3>
            {state.unlocked && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('profilPage.profilePicture.unlocked')}
              </span>
            )}
          </div>

          {!state.unlocked ? (
            <div className="mt-1">
              <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                {t('profilPage.profilePicture.locked', {
                  current: state.referralConversions,
                  target: state.unlockThreshold,
                  remaining: Math.max(0, state.unlockThreshold - state.referralConversions),
                })}
              </p>
              <div className="mt-2 h-1 max-w-48 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground/45 transition-[width] duration-500"
                  style={{ width: `${Math.min(100, (state.referralConversions / state.unlockThreshold) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {t('profilPage.profilePicture.progress', {
                  current: state.referralConversions,
                  target: state.unlockThreshold,
                })}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                {canNativeShare && (
                  <button
                    type="button"
                    onClick={() => void shareReferralLink()}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Share2 className="size-3.5" />
                    {t('profilPage.profilePicture.shareInvite')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void copyReferralLink()}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? t('profilPage.profilePicture.copied') : t('profilPage.profilePicture.copyInvite')}
                </button>
              </div>
            </div>
          ) : active ? (
            <div className="mt-1.5 flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-foreground">{t('profilPage.profilePicture.pendingTitle')}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('profilPage.profilePicture.pendingBody')}</p>
                <button type="button" onClick={() => void refresh()} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  <RefreshCw className="size-3" /> {t('profilPage.profilePicture.refresh')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {rejected && (
                <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <XCircle className="size-3.5" /> {t('profilPage.profilePicture.rejectedTitle')}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {rejectionLabel(state.submission?.rejectionReason ?? null)}
                    {state.submission?.reviewNote ? ` — ${state.submission.reviewNote}` : ''}
                  </p>
                </div>
              )}

              {!state.canSubmit && nextDate ? (
                <div className="mt-1.5 flex items-start gap-2">
                  <Clock3 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {t('profilPage.profilePicture.cooldown', { date: nextDate })}
                  </p>
                </div>
              ) : (
                <>
                  {!file && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('profilPage.profilePicture.readyBody')}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent">
                      <Camera className="size-3.5" />
                      {file ? t('profilPage.profilePicture.chooseAnother') : t('profilPage.profilePicture.choose')}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={!canChoose}
                        onChange={(event) => selectFile((event.currentTarget.files || [])[0] ?? null)}
                      />
                    </label>
                    {file && (
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => void submit()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                      >
                        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                        {uploading ? t('profilPage.profilePicture.uploading') : t('profilPage.profilePicture.submit')}
                      </button>
                    )}
                  </div>
                </>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">{t('profilPage.profilePicture.formatHint')}</p>
            </>
          )}
          {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
        </div>
      </div>
    </section>
  );
}

// ── Social Profile Section ──────────────────────────────────────────────

function SocialProfileSection({ schoolId }: { schoolId: string }) {
  const { t } = useTranslation();
  const loggedInId = getLoggedInUserId();
  const distinctId = loggedInId ? getDistinctId(loggedInId) : null;

  const { data: student, isLoading } = useQuery<Student>({
    schoolId,
    table: 'students',
    filters: [{ column: 'id', op: 'eq', value: loggedInId || '' }],
    single: true,
    enabled: !!loggedInId,
  });

  // Force-fresh on mount so cross-device edits (e.g. updated on phone, then
  // open ProfilPage on laptop) show current values instead of the long-TTL
  // cache. 30s debounce in `invalidateStudentsCacheIfStale` keeps this cheap.
  useEffect(() => {
    void invalidateStudentsCacheIfStale(schoolId);
  }, [schoolId]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instagram, setInstagram] = useState('');
  const [showBirthday, setShowBirthday] = useState(false);
  const initializedRef = useRef(false);
  const [savedField, setSavedField] = useState<string | null>(null);

  const { mutate: updateProfile } = useMutation({
    table: 'students',
    method: 'update',
    schoolId,
  });

  // Only sync form fields on first load — never on refetches after mutations
  useEffect(() => {
    if (student && !initializedRef.current) {
      initializedRef.current = true;
      setName(student.name || '');
      setDescription(student.description || '');
      setInstagram(formatInstagramHandle(student.instagram));
      setShowBirthday(student.show_birthday ?? false);
    }
  }, [student]);

  useEffect(() => {
    if (distinctId && student && (student.extension_installed_at || student.app_installed_at)) {
      captureFeatureUsedOncePerSession('betterlectio_profile_edit', distinctId, {
        school_id: schoolId,
      });
    }
  }, [distinctId, schoolId, student]);

  const saveField = useCallback((field: string, value: unknown) => {
    if (!loggedInId) return;
    updateProfile(
      { [field]: value } as Record<string, unknown>,
      [{ column: 'id', op: 'eq', value: loggedInId }],
    );
    setSavedField(field);
    setTimeout(() => setSavedField(null), 2000);

    if (distinctId) {
      capture('betterlectio profile updated', distinctId, {
        school_id: schoolId,
        field,
      });
    }
  }, [loggedInId, schoolId, distinctId, updateProfile]);

  if (!loggedInId) return null;

  // Only show skeleton on first load (no data yet), not on refetches
  const showSkeleton = isLoading && !initializedRef.current;
  if (!showSkeleton && !student?.extension_installed_at && !student?.app_installed_at) return null;

  if (showSkeleton) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-foreground tracking-tight">
          {t('profilPage.editProfile')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('profilPage.visibleToOthers')}
        </p>
      </div>

      {/* Name + Instagram — side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Display name */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="bl-name" className="text-sm font-medium text-foreground">
              {t('profilPage.displayName')}
            </label>
            <SavedIndicator visible={savedField === 'name'} />
          </div>
          <input
            id="bl-name"
            type="text"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onBlur={() => {
              if (name !== (student?.name || '')) {
                saveField('name', name || null);
              }
            }}
            placeholder={t('profilPage.displayNamePlaceholder')}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/40 transition-all duration-150"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            {t('profilPage.displayNameHint')}
          </p>
        </div>

        {/* Instagram */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="bl-ig" className="text-sm font-medium text-foreground">
              Instagram
            </label>
            <SavedIndicator visible={savedField === 'instagram'} />
          </div>
          <div className="relative">
            <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground/40" />
            <input
              id="bl-ig"
              type="text"
              value={instagram}
              onInput={(e) => setInstagram((e.target as HTMLInputElement).value)}
              onBlur={() => {
                const normalizedInstagram = normalizeInstagramHandle(instagram);
                if (normalizedInstagram !== normalizeInstagramHandle(student?.instagram)) {
                  saveField('instagram', normalizedInstagram);
                }
                setInstagram(formatInstagramHandle(instagram));
              }}
              placeholder={t('profilPage.instagramPlaceholder')}
              className="w-full rounded-xl border border-border bg-background pl-11 pr-4 py-3 text-base text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/40 transition-all duration-150"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {t('profilPage.instagramHint')}
          </p>
        </div>
      </div>

      {/* Description — full width */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="bl-desc" className="text-sm font-medium text-foreground">
            {t('profilPage.bio')}
          </label>
          <SavedIndicator visible={savedField === 'description'} />
        </div>
        <textarea
          id="bl-desc"
          value={description}
          onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
          onBlur={() => {
            if (description !== (student?.description || '')) {
              saveField('description', description || null);
            }
          }}
          maxLength={200}
          rows={3}
          placeholder={t('profilPage.bioPlaceholder')}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/40 transition-all duration-150 resize-none leading-relaxed"
        />
        <div className="flex justify-end mt-1">
          <span className={cn(
            'text-xs tabular-nums transition-[color,background-color] duration-150',
            description.length > 180 ? 'text-[oklch(0.55_0.2_25)]' : 'text-muted-foreground/50',
          )}>
            {description.length}/200
          </span>
        </div>
      </div>

      {/* Birthday toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-background px-5 py-4">
        <div className="flex items-center gap-3">
          <Cake className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {t('profilPage.showBirthday')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('profilPage.birthdayHint')}
            </p>
          </div>
        </div>
        <Switch
          id="bl-bday"
          checked={showBirthday}
          onCheckedChange={(checked) => {
            setShowBirthday(checked);
            saveField('show_birthday', checked);
          }}
        />
      </div>
    </div>
  );
}

// ── Lectio Info Section (collapsible) ───────────────────────────────────

function LectioInfoSection({ data }: { data: ProfilData }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(data.phone);
  const [email, setEmail] = useState(data.email);
  const [altContact, setAltContact] = useState(data.altContact);
  const [saving, setSaving] = useState(false);

  const hasAddress = data.address || data.postalCode;
  const addressStr = [data.address, data.placeName, data.postalCode].filter(Boolean).join(', ');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-accent/20 transition-[color,background-color] duration-150 cursor-pointer active:scale-[0.995]"
          >
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-foreground">{t('profilPage.lectioInfo')}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t('profilPage.lectioInfoHint')}
              </p>
            </div>
            <ChevronDown
              className={cn(
                'size-5 text-muted-foreground/60 transition-transform duration-200 shrink-0',
                open && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-6 pb-6 border-t border-border/40">
            {/* Read-only info in a compact grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-5 pb-6">
              <InfoItem label={t('profilPage.firstName')} value={data.firstName} />
              <InfoItem label={t('profilPage.lastName')} value={data.lastName} />
              {data.coName && <InfoItem label={t('profilPage.coName')} value={data.coName} />}
              {hasAddress && (
                <InfoItem label={t('profilPage.address')} value={addressStr} icon={MapPin} />
              )}
            </div>

            <div className="border-t border-border/40 pt-5">
              <p className="text-sm font-medium text-foreground mb-4">{t('profilPage.contactInfo')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <EditableField
                  label={t('profilPage.phone')}
                  value={phone}
                  onChange={setPhone}
                  type="tel"
                  maxLength={8}
                  icon={Phone}
                />
                <EditableField
                  label={t('profilPage.email')}
                  value={email}
                  onChange={setEmail}
                  maxLength={100}
                  icon={Mail}
                />
              </div>
              <div className="mt-5">
                <EditableField
                  label={t('profilPage.altContact')}
                  value={altContact}
                  onChange={setAltContact}
                  maxLength={100}
                  hint={t('profilPage.altContactHint')}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 pt-5 border-t border-border/40">
              <p className="text-xs text-muted-foreground">
                {t('profilPage.savedInLectio')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSaving(true);
                  triggerNativeSave(phone, email, altContact);
                }}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all duration-150 disabled:opacity-50 cursor-pointer active:scale-[0.97]"
              >
                <Save className="size-4" />
                {saving ? t('profilPage.saving') : t('profilPage.saveChanges')}
              </button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function InfoItem({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof MapPin }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
      <p className="text-sm text-foreground flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5 text-muted-foreground/60 shrink-0" />}
        {value}
      </p>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  maxLength?: number;
  hint?: string;
  icon?: typeof Phone;
}) {
  const fieldId = `profil-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div>
      <label htmlFor={fieldId} className="text-xs text-muted-foreground font-medium block mb-1.5">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
        )}
        <input
          id={fieldId}
          type={type}
          value={value}
          maxLength={maxLength}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          className={cn(
            'w-full rounded-xl border border-border bg-background pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/40 transition-all duration-150',
            Icon ? 'pl-10' : 'px-4',
          )}
        />
      </div>
      {hint && (
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export function ProfilPage({
  data,
  schoolId,
}: {
  data: ProfilData;
  schoolId: string;
}) {
  const { t } = useTranslation();
  const profilePicUrl = (window as any).__IL_PROFILE_PIC__ || data.pictureUrl;
  const loggedInId = getLoggedInUserId();
  const [profilePictureState, setProfilePictureState] = useState<ProfilePictureState | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!loggedInId) return;
    getMyProfilePictureState(loggedInId).then((state) => {
      if (!cancelled) setProfilePictureState(state);
    });
    return () => { cancelled = true; };
  }, [loggedInId]);
  const referralsRemaining = profilePictureState
    ? Math.max(0, profilePictureState.unlockThreshold - profilePictureState.referralConversions)
    : null;
  const pictureAction = profilePictureState?.unlocked
    ? t('profilPage.profilePicture.editAction')
    : referralsRemaining === 1
      ? t('profilPage.profilePicture.unlockActionOne')
      : referralsRemaining !== null
        ? t('profilPage.profilePicture.unlockActionMany', { remaining: referralsRemaining })
        : t('profilPage.profilePicture.viewOptions');

  const openProfilePictureSettings = () => {
    window.dispatchEvent(new CustomEvent('betterlectio:openSettings', {
      detail: { section: 'invite' },
    }));
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-6 mb-10">
        {/* Profile picture */}
        <button
          type="button"
          onClick={openProfilePictureSettings}
          aria-label={pictureAction}
          className="relative w-28 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-border shrink-0 bg-muted group shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {profilePicUrl ? (
            <img
              src={profilePicUrl}
              alt={data.fullName}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="size-10 text-muted-foreground/60" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 group-focus-visible:bg-black/50 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
            <div className="flex flex-col items-center gap-1">
              {profilePictureState?.unlocked ? <Camera className="size-4 text-white" /> : <Lock className="size-4 text-white" />}
              <span className="max-w-24 text-center text-xs font-medium leading-tight text-white/90">{pictureAction}</span>
            </div>
          </div>
          <span className="absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-background/95 text-foreground shadow-sm ring-1 ring-border transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
            {profilePictureState?.unlocked ? <Camera className="size-3.5" /> : <Lock className="size-3.5" />}
          </span>
        </button>

        <div className="flex-1 min-w-0 pt-1">
          <h1 className="text-4xl font-bold text-foreground tracking-tight leading-none">
            {data.fullName}
          </h1>
          <div className="flex items-center gap-3 mt-2.5">
            {data.classCode && (
              <span className="text-lg text-muted-foreground font-medium">{data.classCode}</span>
            )}
            <span className="text-lg text-muted-foreground/50">·</span>
            <span className="text-lg text-muted-foreground">{data.schoolName}</span>
          </div>
          <div className="mt-4">
            <StudiekortDialog schoolId={schoolId} />
          </div>
        </div>
      </div>

      {/* ── Social Profile (primary) ──────────────────────────── */}
      <div className="mb-8">
        <SocialProfileSection schoolId={schoolId} />
      </div>

      {/* ── Lectio Info (secondary, collapsible) ──────────────── */}
      <LectioInfoSection data={data} />
    </div>
  );
}
