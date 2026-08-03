import type { DropdownItem } from './findskema-cache';
import type { StarredPerson } from './findskema-storage';
import { parsePersonInfo } from './findskema-storage';
import { classGroupsMatch } from './class-name';
import { fuzzyMatch, multiWordMatch, normalizeString } from './fuzzy-search';
import { isActiveStudent } from './active-user';
import {
  getPreferredStudentDisplayName,
  getPreferredStudentPictureUrl,
  getStudentFromLookupId,
  getStudentNameAliases,
  type StudentsMap,
} from './supabase/student-lookup';

export const REFERRAL_INVITE_SUBJECT = 'BetterLectio';
export const REFERRAL_INVITE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const INVITE_HISTORY_PREFIX = 'bl-referral-invites';

export interface ReferralInviteCandidate {
  id: string;
  studentId: string;
  lectioName: string;
  displayName: string;
  classCode: string;
  searchText: string;
  pictureUrl: string | null;
  pinnedAt: number | null;
}

export interface ReferralInviteCandidateGroups {
  pinned: ReferralInviteCandidate[];
  classmates: ReferralInviteCandidate[];
}

export type ReferralInviteHistory = Record<string, number>;

export function referralInviteBody(referralUrl: string): string {
  return `Hey, prøv lige BetterLectio: ${referralUrl}`;
}

export function buildReferralInviteCandidates(
  items: DropdownItem[],
  options: {
    schoolId: string;
    userStudentId: string;
    studentsMap: StudentsMap | null | undefined;
    pinnedPeople: StarredPerson[];
    now?: number;
  },
): ReferralInviteCandidate[] {
  const now = options.now ?? Date.now();
  const pinnedAtById = new Map<string, number>();
  for (const person of options.pinnedPeople) {
    if (person.type !== 'student' && !person.id.startsWith('S')) continue;
    if (person.schoolId && person.schoolId !== options.schoolId) continue;
    pinnedAtById.set(person.id, person.starredAt);
  }

  const candidates = new Map<string, ReferralInviteCandidate>();
  for (const item of items) {
    const rawName = typeof item[0] === 'string' ? item[0].trim() : '';
    const id = typeof item[1] === 'string' ? item[1].trim() : '';
    if (!rawName || !/^S\d+$/.test(id)) continue;

    const studentId = id.slice(1);
    if (studentId === options.userStudentId || candidates.has(id)) continue;

    const knownStudent = getStudentFromLookupId(options.studentsMap, id);
    if (
      knownStudent
      && (isActiveStudent(knownStudent, now) || Boolean(knownStudent.app_installed_at))
    ) {
      continue;
    }

    const { displayName: lectioDisplayName, classCode } = parsePersonInfo(rawName);
    const displayName = getPreferredStudentDisplayName(
      knownStudent,
      lectioDisplayName || rawName,
    );
    const extraFields = [item[7], item[8]]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    const aliases = getStudentNameAliases(knownStudent, lectioDisplayName);

    candidates.set(id, {
      id,
      studentId,
      lectioName: rawName,
      displayName,
      classCode,
      searchText: normalizeString(
        `${rawName} ${displayName} ${aliases.join(' ')} ${extraFields}`,
      ),
      pictureUrl: getPreferredStudentPictureUrl(knownStudent),
      pinnedAt: pinnedAtById.get(id) ?? null,
    });
  }

  return Array.from(candidates.values());
}

function compareNames(
  left: ReferralInviteCandidate,
  right: ReferralInviteCandidate,
): number {
  return left.displayName.localeCompare(right.displayName, 'da', { sensitivity: 'base' });
}

export function groupDefaultReferralInviteCandidates(
  candidates: ReferralInviteCandidate[],
  userClassName: string,
): ReferralInviteCandidateGroups {
  const pinned = candidates
    .filter((candidate) => candidate.pinnedAt !== null)
    .sort((left, right) => (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0));
  const pinnedIds = new Set(pinned.map((candidate) => candidate.id));
  const classmates = candidates
    .filter((candidate) => (
      !pinnedIds.has(candidate.id)
      && Boolean(candidate.classCode)
      && classGroupsMatch(candidate.classCode, userClassName)
    ))
    .sort(compareNames);

  return { pinned, classmates };
}

export function searchReferralInviteCandidates(
  candidates: ReferralInviteCandidate[],
  query: string,
  limit = 40,
): ReferralInviteCandidate[] {
  const normalizedQuery = normalizeString(query);
  if (!normalizedQuery) return [];

  return candidates
    .map((candidate) => {
      const directIndex = candidate.searchText.indexOf(normalizedQuery);
      const matchesAllTerms = multiWordMatch(normalizedQuery, candidate.searchText);
      const [fuzzyMatched, fuzzyScore] = fuzzyMatch(normalizedQuery, candidate.searchText);
      if (directIndex < 0 && !matchesAllTerms && !fuzzyMatched) return null;

      let score = fuzzyScore;
      if (matchesAllTerms) score += 180;
      if (directIndex >= 0) score += directIndex === 0 ? 300 : 220 - directIndex;
      if (candidate.pinnedAt !== null) score += 25;
      return { candidate, score };
    })
    .filter((entry): entry is { candidate: ReferralInviteCandidate; score: number } => (
      entry !== null
    ))
    .sort((left, right) => (
      right.score - left.score || compareNames(left.candidate, right.candidate)
    ))
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

function inviteHistoryKey(schoolId: string, senderStudentId: string): string {
  return `${INVITE_HISTORY_PREFIX}:${schoolId}:${senderStudentId}`;
}

function defaultStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function parseReferralInviteHistory(
  raw: string | null,
  now = Date.now(),
): ReferralInviteHistory {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const history: ReferralInviteHistory = {};
    for (const [recipientId, value] of Object.entries(parsed)) {
      if (
        /^S\d+$/.test(recipientId)
        && typeof value === 'number'
        && Number.isFinite(value)
        && now - value < REFERRAL_INVITE_COOLDOWN_MS
      ) {
        history[recipientId] = value;
      }
    }
    return history;
  } catch {
    return {};
  }
}

export function getReferralInviteHistory(
  schoolId: string,
  senderStudentId: string,
  now = Date.now(),
  storage: Storage | null = defaultStorage(),
): ReferralInviteHistory {
  if (!storage) return {};
  const key = inviteHistoryKey(schoolId, senderStudentId);
  const history = parseReferralInviteHistory(storage.getItem(key), now);
  try {
    storage.setItem(key, JSON.stringify(history));
  } catch {
    // Cooldown persistence is best-effort.
  }
  return history;
}

export function stampReferralInviteSent(
  schoolId: string,
  senderStudentId: string,
  recipientId: string,
  now = Date.now(),
  storage: Storage | null = defaultStorage(),
): ReferralInviteHistory {
  const history = getReferralInviteHistory(
    schoolId,
    senderStudentId,
    now,
    storage,
  );
  history[recipientId] = now;
  try {
    storage?.setItem(inviteHistoryKey(schoolId, senderStudentId), JSON.stringify(history));
  } catch {
    // Cooldown persistence is best-effort.
  }
  return history;
}

export function getReferralInviteInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';
}
