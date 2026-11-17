// Content scripts share `window` with Lectio, so the global `error` and
// `unhandledrejection` listeners also receive failures thrown by Lectio's own
// page scripts (for example CKEditor in `vendor.bundle.js`). Those are not
// BetterLectio bugs and must not reach error tracking.
//
// Kept dependency-free so it can be unit-tested without the extension runtime.

const EXTENSION_URL_PATTERN = /\b[a-z-]*extension:\/\//i;

export function isExtensionScriptUrl(url: unknown): boolean {
  return typeof url === 'string' && EXTENSION_URL_PATTERN.test(url);
}

function hasExtensionStackFrame(value: unknown): boolean {
  try {
    return isExtensionScriptUrl((value as { stack?: unknown } | null | undefined)?.stack);
  } catch {
    return false;
  }
}

/** True only when an unhandled rejection reason has an extension stack frame. */
export function isExtensionRejection(reason: unknown): boolean {
  return hasExtensionStackFrame(reason);
}

/** True only when a global `error` event comes from extension code. */
export function isExtensionWindowError(filename: unknown, error: unknown): boolean {
  if (typeof filename === 'string' && filename) return isExtensionScriptUrl(filename);
  return hasExtensionStackFrame(error);
}
