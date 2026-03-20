import { useState, useEffect } from 'preact/hooks';
import {
  User,
  Monitor,
  Smartphone,
  Shield,
  IdCard,
  Save,
  Clock,
  CalendarPlus,
  CalendarClock,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  ProfilData,
  StudiekortData,
  SessionEntry,
} from '@/lib/profil-parser';
import { fetchStudiekortData, fetchSessionsData, deleteSession } from '@/lib/profil-parser';

// ── Helpers ─────────────────────────────────────────────────────────────

function isMobileDevice(device: string): boolean {
  return /mobil/i.test(device);
}

function cleanDeviceName(device: string): string {
  return device.replace(/^Denne enhed:\s*/i, '').trim();
}

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

  // Trigger the native ASP.NET postback
  const win = window as unknown as { __doPostBack?: (target: string, arg: string) => void };
  if (win.__doPostBack) {
    win.__doPostBack('s$m$Content$Content$stamdataSaveBtn', '');
  }
}

// ── Skeleton ────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
    />
  );
}

// ── Info Row ────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="py-2.5">
      <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </p>
      <p className="text-sm text-foreground mt-0.5">{value}</p>
    </div>
  );
}

// ── Editable Row ────────────────────────────────────────────────────────

function EditableRow({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <div className="py-2.5">
      <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-medium block mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/40 transition-colors"
      />
      {hint && (
        <p className="text-[0.65rem] text-muted-foreground mt-1 italic">{hint}</p>
      )}
    </div>
  );
}

// ── Studiekort Card ─────────────────────────────────────────────────────

function StudiekortCard({
  data,
  loading,
}: {
  data: StudiekortData | null;
  loading: boolean;
}) {
  const [showQr, setShowQr] = useState(false);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2.5 mb-1">
          <IdCard className="w-4.5 h-4.5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Studiekort</h2>
        </div>
        <Skeleton className="w-full h-96 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <IdCard className="w-4.5 h-4.5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Studiekort</h2>
      </div>

      {/* Vertical card */}
      <div
        className="relative rounded-2xl overflow-hidden p-4 flex flex-col"
        style={{
          background: `linear-gradient(160deg, oklch(0.45 0.16 265), oklch(0.38 0.12 280))`,
        }}
      >
        {/* Photo / QR — click to toggle */}
        <div
          className="w-full aspect-[3/4] rounded-xl overflow-hidden mb-4 flex items-center justify-center cursor-pointer"
          style={{ backgroundColor: 'oklch(0.30 0.08 265 / 0.4)' }}
          onClick={() => setShowQr(!showQr)}
          title={showQr ? 'Klik for at vise foto' : 'Klik for at vise QR kode'}
        >
          {showQr && data.qrUrl ? (
            <img
              src={data.qrUrl}
              alt="QR kode"
              className="w-full h-full object-contain bg-white p-3"
            />
          ) : data.photoUrl ? (
            <img
              src={data.photoUrl}
              alt="Foto"
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <User
              className="w-12 h-12"
              style={{ color: 'oklch(0.65 0.06 265)' }}
            />
          )}
        </div>

        {/* Info */}
        <p
          className="text-lg font-bold leading-tight"
          style={{ color: 'oklch(0.96 0.01 265)' }}
        >
          {data.name}
        </p>
        <p
          className="text-sm mt-1.5 font-medium"
          style={{ color: 'oklch(0.78 0.04 265)' }}
        >
          {data.school}
        </p>
        <p
          className="text-sm mt-1"
          style={{ color: 'oklch(0.68 0.04 265)' }}
        >
          {data.birthday}
        </p>

        {/* Timestamp */}
        {data.timestamp && (
          <p
            className="text-[0.6rem] mt-3 text-center"
            style={{ color: 'oklch(0.52 0.03 265)' }}
          >
            {data.timestamp}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Sessions Card ───────────────────────────────────────────────────────

function SessionsCard({
  sessions,
  loading,
  onDelete,
}: {
  sessions: SessionEntry[];
  loading: boolean;
  onDelete: (deleteIndex: number) => void;
}) {
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <Shield className="w-4.5 h-4.5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Aktive sessioner
          </h2>
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Shield className="w-4.5 h-4.5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Aktive sessioner
        </h2>
        <span className="text-[0.6rem] text-muted-foreground ml-auto">
          {sessions.length} enhed{sessions.length !== 1 ? 'er' : ''}
        </span>
      </div>

      <div className="space-y-1">
        {sessions.map((session, i) => {
          const mobile = isMobileDevice(session.device);
          const DeviceIcon = mobile ? Smartphone : Monitor;
          const deviceName = session.isCurrent
            ? cleanDeviceName(session.device)
            : session.device;

          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                session.isCurrent
                  ? 'bg-[oklch(0.97_0.02_145)] dark:bg-[oklch(0.18_0.02_145)]'
                  : 'hover:bg-accent/30',
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
                  session.isCurrent
                    ? 'bg-[oklch(0.92_0.04_145)] dark:bg-[oklch(0.24_0.03_145)]'
                    : 'bg-muted',
                )}
              >
                <DeviceIcon
                  className={cn(
                    'w-4 h-4',
                    session.isCurrent
                      ? 'text-[oklch(0.45_0.15_145)] dark:text-[oklch(0.70_0.12_145)]'
                      : 'text-muted-foreground',
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {deviceName}
                  </span>
                  {session.isCurrent && (
                    <Badge
                      className="text-[0.55rem] px-1.5 py-0 border-0"
                      style={{
                        backgroundColor: 'oklch(0.88 0.06 145)',
                        color: 'oklch(0.35 0.12 145)',
                      }}
                    >
                      Denne enhed
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[0.65rem] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {session.lastLogin}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarPlus className="w-3 h-3" />
                    {session.created}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    {session.expiry}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setDeletingIndex(session.deleteIndex);
                  onDelete(session.deleteIndex);
                }}
                disabled={deletingIndex !== null}
                title="Slet session"
                className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deletingIndex === session.deleteIndex ? (
                  <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── BetterLectio Konto Card ─────────────────────────────────────────────

// ── Main Component ──────────────────────────────────────────────────────

export function ProfilPage({
  data,
  schoolId,
}: {
  data: ProfilData;
  schoolId: string;
}) {
  const [phone, setPhone] = useState(data.phone);
  const [email, setEmail] = useState(data.email);
  const [altContact, setAltContact] = useState(data.altContact);
  const [saving, setSaving] = useState(false);

  const [studiekort, setStudiekort] = useState<StudiekortData | null>(null);
  const [studiekortLoading, setStudiekortLoading] = useState(true);

  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Fetch studiekort + sessions in parallel
  useEffect(() => {
    fetchStudiekortData(schoolId)
      .then(setStudiekort)
      .catch((err) =>
        console.error('[BetterLectio] Failed to load studiekort:', err),
      )
      .finally(() => setStudiekortLoading(false));

    fetchSessionsData(schoolId)
      .then(setSessions)
      .catch((err) =>
        console.error('[BetterLectio] Failed to load sessions:', err),
      )
      .finally(() => setSessionsLoading(false));
  }, [schoolId]);

  function handleSave() {
    setSaving(true);
    triggerNativeSave(phone, email, altContact);
  }

  async function handleDeleteSession(deleteIndex: number) {
    try {
      const updated = await deleteSession(schoolId, deleteIndex);
      setSessions(updated);
    } catch (err) {
      console.error('[BetterLectio] Failed to delete session:', err);
    }
  }

  // Use the high-res fullsize picture (same as sidebar), fall back to thumbnail
  const profilePicUrl = (window as any).__IL_PROFILE_PIC__ || data.pictureUrl;

  const hasAddress = data.address || data.postalCode;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-border shrink-0 bg-muted">
          {profilePicUrl ? (
            <img
              src={profilePicUrl}
              alt={data.fullName}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground leading-tight">
              {data.fullName}
            </h1>
            {data.classCode && (
              <Badge variant="secondary" className="text-xs font-semibold">
                {data.classCode}
              </Badge>
            )}
            <Badge
              className="text-[0.6rem] border-0"
              style={{
                backgroundColor: 'oklch(0.92 0.04 265)',
                color: 'oklch(0.45 0.14 265)',
              }}
            >
              Elev
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.schoolName}
          </p>
        </div>
      </div>

      {/* ── Two-column: Personal Info + Studiekort ────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_18rem] gap-4">
        {/* Personal Info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <User className="w-4.5 h-4.5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Mine oplysninger
            </h2>
          </div>

          {/* Read-only fields */}
          <div className="space-y-0 divide-y divide-border/40">
            <InfoRow label="Fornavn" value={data.firstName} />
            <InfoRow label="Efternavn" value={data.lastName} />
            {data.coName && <InfoRow label="C/O navn" value={data.coName} />}
            {hasAddress && (
              <InfoRow
                label="Adresse"
                value={
                  [data.address, data.placeName, data.postalCode]
                    .filter(Boolean)
                    .join(', ')
                }
              />
            )}
          </div>

          {/* Editable fields */}
          <div className="divide-y divide-border/40">
            <EditableRow
              label="Telefon"
              value={phone}
              onChange={setPhone}
              type="tel"
              maxLength={8}
            />
            <EditableRow
              label="E-mail"
              value={email}
              onChange={setEmail}
              maxLength={100}
            />
            <EditableRow
              label="Alternativ kontakt"
              value={altContact}
              onChange={setAltContact}
              maxLength={100}
              hint="Tlf.nr til fx forældre eller anden kontaktperson. Eks. 'Far 12345678', 'Mor 87654321', 'Mormor 11112222'"
            />
          </div>

          {/* Save button */}
          <div className="flex justify-end mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Gemmer...' : 'Gem'}
            </button>
          </div>
        </div>

        {/* Studiekort */}
        <div>
          <StudiekortCard data={studiekort} loading={studiekortLoading} />
        </div>
      </div>

      {/* ── Sessions ──────────────────────────────────────────── */}
      <SessionsCard sessions={sessions} loading={sessionsLoading} onDelete={handleDeleteSession} />
    </div>
  );
}
