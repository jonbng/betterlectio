import { fetchOpgaveDetail, isMeaningfulAssignmentGrade, type OpgaveDetail } from './opgave-detail';

export type TeacherReturnState = 'unknown' | 'none' | 'returned';
export type TeacherReturnKind = 'grade' | 'comment' | 'file';

export interface TeacherReturnSummary {
  state: TeacherReturnState;
  kinds: TeacherReturnKind[];
  grade: string;
  teacherName: string;
  returnedAt: string;
  commentCount: number;
  fileCount: number;
}

const CACHE_PREFIX = 'bl-opgave-return:v1';
const RETURNED_TTL = 30 * 24 * 60 * 60 * 1000;
const NONE_TTL = 15 * 60 * 1000;
const CONCURRENCY = 3;

interface CachedTeacherReturn {
  checkedAt: number;
  summary: TeacherReturnSummary;
}

export const UNKNOWN_TEACHER_RETURN: TeacherReturnSummary = {
  state: 'unknown',
  kinds: [],
  grade: '',
  teacherName: '',
  returnedAt: '',
  commentCount: 0,
  fileCount: 0,
};

export function teacherReturnFromListFields(input: {
  grade?: string;
  gradeNote?: string;
  studentNote?: string;
}): TeacherReturnSummary {
  const grade = isMeaningfulAssignmentGrade(input.grade) ? input.grade!.trim() : '';
  const commentCount = [input.gradeNote, input.studentNote].filter(value => !!value?.trim()).length;
  const kinds: TeacherReturnKind[] = [];
  if (grade) kinds.push('grade');
  if (commentCount > 0) kinds.push('comment');

  if (kinds.length === 0) return UNKNOWN_TEACHER_RETURN;
  return {
    ...UNKNOWN_TEACHER_RETURN,
    state: 'returned',
    kinds,
    grade,
    commentCount,
  };
}

function requestedStudentContextCardId(sourceUrl: string): string {
  try {
    const id = new URL(sourceUrl, 'https://www.lectio.dk').searchParams.get('elevid');
    return id ? `S${id}` : '';
  } catch {
    return '';
  }
}

export function summarizeTeacherReturn(detail: OpgaveDetail): TeacherReturnSummary {
  const requestedId = requestedStudentContextCardId(detail.sourceUrl);
  const student = detail.students.find(item => item.contextCardId === requestedId)
    || detail.students.find(item => (
      isMeaningfulAssignmentGrade(item.grade)
      || item.gradeNote.trim()
      || item.studentNote.trim()
    ))
    || detail.students[0]
    || null;

  const teacherEntries = detail.entries.filter(entry => (
    entry.isTeacher && (entry.comment.trim() || entry.documentName.trim())
  ));
  const latest = teacherEntries.at(-1) || null;
  const grade = isMeaningfulAssignmentGrade(student?.grade) ? student!.grade.trim() : '';
  const noteCount = [student?.gradeNote, student?.studentNote]
    .filter(value => !!value?.trim()).length;
  const entryCommentCount = teacherEntries.filter(entry => !!entry.comment.trim()).length;
  const fileCount = teacherEntries.filter(entry => !!entry.documentName.trim()).length;
  const kinds: TeacherReturnKind[] = [];
  if (grade) kinds.push('grade');
  if (noteCount + entryCommentCount > 0) kinds.push('comment');
  if (fileCount > 0) kinds.push('file');

  return {
    state: kinds.length > 0 ? 'returned' : 'none',
    kinds,
    grade,
    teacherName: latest?.user || '',
    returnedAt: latest?.timestamp || '',
    commentCount: noteCount + entryCommentCount,
    fileCount,
  };
}

function cacheIdentity(url: string, schoolId: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    const exerciseId = parsed.searchParams.get('exerciseid');
    const studentId = parsed.searchParams.get('elevid');
    if (!exerciseId || !studentId) return null;
    return `${CACHE_PREFIX}:${schoolId}:${studentId}:${exerciseId}`;
  } catch {
    return null;
  }
}

export function getCachedTeacherReturn(url: string, schoolId: string): TeacherReturnSummary | null {
  const key = cacheIdentity(url, schoolId);
  if (!key) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || '') as CachedTeacherReturn;
    const ttl = cached.summary.state === 'returned' ? RETURNED_TTL : NONE_TTL;
    if (Date.now() - cached.checkedAt > ttl) return null;
    return cached.summary;
  } catch {
    return null;
  }
}

export function cacheTeacherReturn(url: string, schoolId: string, summary: TeacherReturnSummary): void {
  if (summary.state === 'unknown') return;
  const key = cacheIdentity(url, schoolId);
  if (!key) return;
  try {
    const value: CachedTeacherReturn = { checkedAt: Date.now(), summary };
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Enrichment is optional; quota/privacy modes must not break assignments.
  }
}

export async function enrichTeacherReturns(
  urls: string[],
  schoolId: string,
  onResult: (url: string, summary: TeacherReturnSummary) => void,
): Promise<void> {
  const pending: string[] = [];
  for (const url of [...new Set(urls)]) {
    const cached = getCachedTeacherReturn(url, schoolId);
    if (cached) onResult(url, cached);
    else pending.push(url);
  }

  let cursor = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && cursor < pending.length) {
      const url = pending[cursor++];
      try {
        const detail = await fetchOpgaveDetail(url);
        const summary = summarizeTeacherReturn(detail);
        cacheTeacherReturn(url, schoolId, summary);
        onResult(url, summary);
      } catch (error) {
        if (error instanceof Error && error.message === 'SESSION_EXPIRED') stopped = true;
        // Keep this assignment unknown. Detail view still exposes its own retry.
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
}
