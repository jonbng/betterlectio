import type { Cookie as PuppeteerCookie } from "puppeteer";

export interface School {
  id: string;
  name: string;
  url: string;
}

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface CookieStore {
  schoolId: string;
  schoolName: string;
  cookies: StoredCookie[];
  savedAt: number;
}

export interface Config {
  lastSchool?: {
    id: string;
    name: string;
  };
  chromePath?: string;
  defaultOutputDir?: string;
}

export interface SchoolCache {
  schools: School[];
  fetchedAt: number;
}

export interface AuthResult {
  success: boolean;
  cookies: PuppeteerCookie[];
  error?: string;
}

export interface FetchResult {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: string;
  redirected: boolean;
}

export interface SessionStatus {
  authenticated: boolean;
  school?: {
    id: string;
    name: string;
  };
  session?: {
    valid: boolean;
    expiresIn: number; // seconds remaining
    lastActivity: string; // ISO date string
  };
}

export type OutputFormat = "text" | "json";

// ASP.NET WebForms types

/** Map of ASP.NET hidden field names to their values */
export type ASPFormData = Record<string, string>;

/** A single form field extracted from the page */
export interface ASPFormField {
  /** The name attribute (used in form submission) */
  name: string;
  /** The id attribute */
  id: string;
  /** Input type (text, hidden, checkbox, radio, submit, select, textarea) */
  type: string;
  /** Current value */
  value: string;
}

/** Result of full form extraction from an HTML page */
export interface ExtractedForm {
  /** ASP.NET hidden fields (__VIEWSTATE, __EVENTVALIDATION, etc.) */
  aspFields: ASPFormData;
  /** All other form fields (inputs, selects, textareas) */
  formFields: ASPFormField[];
  /** The form action URL, if found */
  formAction: string | null;
}

/** A postback target found in the page (__doPostBack calls) */
export interface PostbackTarget {
  /** The __EVENTTARGET value */
  target: string;
  /** The __EVENTARGUMENT value */
  argument: string;
  /** Contextual text near the postback (link text, title, etc.) */
  context: string;
}
