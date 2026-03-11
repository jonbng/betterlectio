export interface LastSchool {
  id: string;
  name: string;
  url: string;
  lastUsed: number;
}

const LAST_SCHOOL_KEY = "bl-last-school";
const LEGACY_LAST_SCHOOL_KEY = "il-last-school";

export function getLastSchool(): LastSchool | null {
  try {
    const stored = localStorage.getItem(LAST_SCHOOL_KEY) ?? localStorage.getItem(LEGACY_LAST_SCHOOL_KEY);
    if (!localStorage.getItem(LAST_SCHOOL_KEY) && stored) {
      localStorage.setItem(LAST_SCHOOL_KEY, stored);
    }
    if (!stored) return null;
    return JSON.parse(stored) as LastSchool;
  } catch {
    return null;
  }
}

export function saveLastSchool(school: Omit<LastSchool, "lastUsed">): void {
  const data: LastSchool = {
    ...school,
    lastUsed: Date.now(),
  };
  localStorage.setItem(LAST_SCHOOL_KEY, JSON.stringify(data));
}

export function parseSchoolFromUrl(url: string): { id: string } | null {
  const match = url.match(/\/lectio\/(\d+)\//);
  if (!match) return null;
  return { id: match[1] };
}
