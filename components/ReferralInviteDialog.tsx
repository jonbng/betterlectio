import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Check,
  Loader2,
  Mail,
  Pin,
  RotateCcw,
  Search,
  Send,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  addRecipientViaIframe,
  beginStandaloneComposeViaIframe,
  sendMessageViaIframe,
  type StandaloneComposeSession,
  type SubmitError,
} from '@/lib/beskeder-submit';
import { fetchBeskederRecipientItems } from '@/lib/beskeder-recipients-cache';
import { fetchPictureUrl, getCachedPictureUrl, getStarredPeople, isPictureCacheStale } from '@/lib/findskema-storage';
import {
  buildReferralInviteCandidates,
  getReferralInviteHistory,
  getReferralInviteInitials,
  groupDefaultReferralInviteCandidates,
  referralInviteBody,
  REFERRAL_INVITE_SUBJECT,
  searchReferralInviteCandidates,
  stampReferralInviteSent,
  type ReferralInviteCandidate,
  type ReferralInviteHistory,
} from '@/lib/referral-invite';
import type { StudentsMap } from '@/lib/supabase/student-lookup';
import { cn } from '@/lib/utils';

interface ReferralInviteDialogProps {
  schoolId: string;
  studentId: string;
  className: string;
  shareUrl: string;
  studentsMap: StudentsMap | null;
  studentsLoading: boolean;
}

type InviteFailure = Error & { kind?: SubmitError['kind'] };

function submitFailure(error: SubmitError): InviteFailure {
  const failure = new Error(
    error.kind === 'unknown' || error.kind === 'parse_failure'
      ? error.message
      : error.kind,
  ) as InviteFailure;
  failure.kind = error.kind;
  return failure;
}

function setupErrorMessage(error: unknown): string {
  const kind = (error as InviteFailure)?.kind;
  if (kind === 'session_expired') {
    return 'Din Lectio-session er udløbet. Genindlæs siden og prøv igen.';
  }
  return 'Kunne ikke hente eleverne. Prøv igen om lidt.';
}

export function ReferralInviteDialog({
  schoolId,
  studentId,
  className,
  shareUrl,
  studentsMap,
  studentsLoading,
}: ReferralInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [rawItems, setRawItems] = useState<Awaited<ReturnType<typeof fetchBeskederRecipientItems>> | null>(null);
  const [session, setSession] = useState<StandaloneComposeSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [uncertainIds, setUncertainIds] = useState<Set<string>>(() => new Set());
  const [history, setHistory] = useState<ReferralInviteHistory>(() => (
    getReferralInviteHistory(schoolId, studentId)
  ));
  const [pictureById, setPictureById] = useState<Record<string, string | null>>({});
  const pictureInflight = useRef<Set<string>>(new Set());

  const createComposeSession = useCallback(async (): Promise<StandaloneComposeSession> => {
    const result = await beginStandaloneComposeViaIframe(schoolId);
    if (!result.success) throw submitFailure(result.error);
    return result.data;
  }, [schoolId]);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const freshSession = await createComposeSession();
      const items = await fetchBeskederRecipientItems(
        freshSession.document,
        ['bcstudent'],
      );
      if (items.length === 0) throw new Error('No student recipients found');
      setSession(freshSession);
      setRawItems(items);
    } catch (error) {
      setSession(null);
      setLoadError(setupErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [createComposeSession]);

  useEffect(() => {
    if (!open) return;
    setHistory(getReferralInviteHistory(schoolId, studentId));
    if (rawItems === null && !loading && !loadError) void loadDirectory();
  }, [open, rawItems, loading, loadError, loadDirectory, schoolId, studentId]);

  const candidates = useMemo(() => buildReferralInviteCandidates(
    rawItems ?? [],
    {
      schoolId,
      userStudentId: studentId,
      studentsMap,
      pinnedPeople: getStarredPeople(),
    },
  ), [rawItems, schoolId, studentId, studentsMap]);

  const defaultGroups = useMemo(
    () => groupDefaultReferralInviteCandidates(candidates, className),
    [candidates, className],
  );
  const searchResults = useMemo(
    () => searchReferralInviteCandidates(candidates, query),
    [candidates, query],
  );
  const isSearching = query.trim().length > 0;
  const isPreparing = loading || studentsLoading;
  const visibleCandidates = isSearching
    ? searchResults
    : [...defaultGroups.pinned, ...defaultGroups.classmates];

  useEffect(() => {
    setActiveResultIndex(0);
  }, [query]);

  useEffect(() => {
    for (const candidate of visibleCandidates.slice(0, 14)) {
      if (candidate.pictureUrl) continue;
      if (Object.prototype.hasOwnProperty.call(pictureById, candidate.id)) continue;
      if (pictureInflight.current.has(candidate.id)) continue;

      const cached = getCachedPictureUrl(candidate.id, { allowStale: true });
      if (cached !== undefined) {
        setPictureById((current) => ({ ...current, [candidate.id]: cached }));
        if (!isPictureCacheStale(candidate.id)) continue;
      }

      pictureInflight.current.add(candidate.id);
      fetchPictureUrl(candidate.id, schoolId)
        .then((url) => {
          setPictureById((current) => ({ ...current, [candidate.id]: url }));
        })
        .finally(() => {
          pictureInflight.current.delete(candidate.id);
        });
    }
  }, [visibleCandidates, pictureById, schoolId]);

  const handleInvite = useCallback(async (candidate: ReferralInviteCandidate) => {
    if (sendingId || history[candidate.id] || uncertainIds.has(candidate.id)) return;
    setSendingId(candidate.id);

    let activeSession = session;
    try {
      if (!activeSession) activeSession = await createComposeSession();

      const compose = activeSession.compose;
      const added = await addRecipientViaIframe(
        activeSession.formState,
        compose.addRecipientPostbackTarget,
        compose.addRecipientInputName,
        candidate.lectioName,
        compose.addRecipientHiddenInputName,
        candidate.id,
      );
      if (!added.success) throw submitFailure(added.error);
      if (added.data.recipients.length === 0) {
        throw submitFailure({ kind: 'parse_failure', message: 'Recipient was not added' });
      }

      const titleFieldName = compose.nativeTitleInput.getAttribute('name') || '';
      const bodyFieldName = compose.nativeBodyTextarea.getAttribute('name') || '';
      if (!titleFieldName || !bodyFieldName) {
        throw submitFailure({ kind: 'parse_failure', message: 'Message fields missing' });
      }

      const sent = await sendMessageViaIframe(
        added.formState,
        compose.sendPostbackTarget,
        titleFieldName,
        bodyFieldName,
        REFERRAL_INVITE_SUBJECT,
        referralInviteBody(shareUrl),
        true,
      );
      setSession(null);

      if (!sent.success) {
        if (sent.error.kind === 'session_expired') throw submitFailure(sent.error);
        setUncertainIds((current) => new Set(current).add(candidate.id));
        toast.error('Kunne ikke bekræfte om beskeden blev sendt. Tjek dine sendte beskeder.');
        return;
      }

      const nextHistory = stampReferralInviteSent(
        schoolId,
        studentId,
        candidate.id,
      );
      setHistory(nextHistory);
      toast.success(`Invitation sendt til ${candidate.displayName}`);
    } catch (error) {
      setSession(null);
      const kind = (error as InviteFailure)?.kind;
      if (kind === 'session_expired') {
        toast.error('Din Lectio-session er udløbet. Genindlæs siden og prøv igen.');
      } else {
        toast.error('Kunne ikke sende invitationen. Prøv igen.');
      }
    } finally {
      setSendingId(null);
    }
  }, [
    createComposeSession,
    history,
    schoolId,
    sendingId,
    session,
    shareUrl,
    studentId,
    uncertainIds,
  ]);

  const handleSearchKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!isSearching || searchResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveResultIndex((index) => Math.min(index + 1, searchResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveResultIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const candidate = searchResults[activeResultIndex] ?? searchResults[0];
      if (candidate) void handleInvite(candidate);
    }
  }, [activeResultIndex, handleInvite, isSearching, searchResults]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setActiveResultIndex(0);
    }
  }, []);

  const renderCandidate = (candidate: ReferralInviteCandidate, index: number) => {
    const sent = Boolean(history[candidate.id]);
    const uncertain = uncertainIds.has(candidate.id);
    const sending = sendingId === candidate.id;
    const pictureUrl = candidate.pictureUrl ?? pictureById[candidate.id] ?? null;

    return (
      <li
        key={candidate.id}
        className={cn(
          'flex items-center gap-3 rounded-xl px-2 py-2 transition-colors',
          isSearching && index === activeResultIndex && 'bg-accent',
        )}
      >
        <Avatar className="size-10 border">
          {pictureUrl && (
            <AvatarImage
              src={pictureUrl}
              alt=""
              className="object-cover object-top"
            />
          )}
          <AvatarFallback className="text-xs font-semibold text-muted-foreground">
            {getReferralInviteInitials(candidate.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {candidate.displayName}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{candidate.classCode || 'Elev'}</span>
            {candidate.pinnedAt !== null && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[0.625rem]">
                <Pin /> Fastgjort
              </Badge>
            )}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={sent || uncertain ? 'secondary' : 'default'}
          disabled={Boolean(sendingId) || sent || uncertain}
          onClick={() => void handleInvite(candidate)}
          aria-label={sent ? `Invitation sendt til ${candidate.displayName}` : `Inviter ${candidate.displayName}`}
        >
          {sending ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : sent ? (
            <Check data-icon="inline-start" />
          ) : uncertain ? (
            <Mail data-icon="inline-start" />
          ) : (
            <Send data-icon="inline-start" />
          )}
          {sending ? 'Sender' : sent ? 'Sendt' : uncertain ? 'Tjek Beskeder' : 'Inviter'}
        </Button>
      </li>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger type="button" className={buttonVariants()}>
        <UserPlus data-icon="inline-start" />
        Inviter
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="border-b bg-muted/35 px-6 pb-5 pt-6">
          <DialogHeader className="pr-8">
            <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <UserPlus className="size-5" />
            </div>
            <DialogTitle>Inviter en ven</DialogTitle>
            <DialogDescription>
              Vi sender en kort Lectio-besked med dit personlige link.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-start gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              “Hey, prøv lige BetterLectio: <span className="text-foreground">dit link</span>”
            </span>
          </div>
        </div>

        <div className="px-6 py-4">
          <label htmlFor="referral-invite-search" className="sr-only">
            Søg efter en elev
          </label>
          <div className="flex items-center gap-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              id="referral-invite-search"
              value={query}
              onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Søg efter en elev"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-4 pb-5">
          {isPreparing && (
            <div className="flex flex-col gap-2 px-2" aria-label="Henter elever">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex items-center gap-3 py-2">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          )}

          {!isPreparing && loadError && (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Mail className="size-5" />
              </div>
              <p className="max-w-sm text-sm text-muted-foreground">{loadError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadDirectory()}>
                <RotateCcw data-icon="inline-start" />
                Prøv igen
              </Button>
            </div>
          )}

          {!isPreparing && !loadError && isSearching && (
            <section aria-labelledby="referral-search-results">
              <h3 id="referral-search-results" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Resultater
              </h3>
              {searchResults.length > 0 ? (
                <ul>{searchResults.map(renderCandidate)}</ul>
              ) : (
                <p className="px-2 py-10 text-center text-sm text-muted-foreground">
                  Ingen elever matcher “{query.trim()}”.
                </p>
              )}
            </section>
          )}

          {!isPreparing && !loadError && !isSearching && (
            <div className="flex flex-col gap-4">
              {defaultGroups.pinned.length > 0 && (
                <section aria-labelledby="referral-pinned-heading">
                  <h3 id="referral-pinned-heading" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fastgjorte
                  </h3>
                  <ul>{defaultGroups.pinned.map(renderCandidate)}</ul>
                </section>
              )}
              {defaultGroups.classmates.length > 0 && (
                <section aria-labelledby="referral-class-heading">
                  <h3 id="referral-class-heading" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Din klasse{className ? ` · ${className}` : ''}
                  </h3>
                  <ul>{defaultGroups.classmates.map((candidate, index) => renderCandidate(candidate, defaultGroups.pinned.length + index))}</ul>
                </section>
              )}
              {defaultGroups.pinned.length === 0 && defaultGroups.classmates.length === 0 && rawItems !== null && (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">Ingen forslag endnu</p>
                  <p className="mt-1 text-sm text-muted-foreground">Søg efter en elev ovenfor.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
