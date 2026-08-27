// Safe wrappers around `browser.runtime` URL/manifest reads.
//
// Chrome invalidates a content script's extension context when the extension
// reloads, updates, or is disabled. The orphaned script keeps running on the
// old page, but every `browser.runtime` call then throws "Extension context
// invalidated.". React components read these APIs in their render body, so the
// throw crashes the render instead of degrading. These helpers return a
// fallback so an orphaned script shows a missing logo rather than a broken UI.
//
// Kept dependency-free so it's safe to import from content scripts, components,
// and shared libs alike.

import type { PublicPath } from 'wxt/browser';

// Returns the extension URL for `path`, or an empty string when the context is
// invalidated. An empty `src` renders as a missing image, not a crash.
export function safeRuntimeUrl(path: PublicPath): string {
  try {
    return browser.runtime.getURL(path);
  } catch {
    return '';
  }
}

// Returns the extension manifest, or `undefined` when the context is
// invalidated. Callers read fields with optional chaining.
export function safeGetManifest(): ReturnType<typeof browser.runtime.getManifest> | undefined {
  try {
    return browser.runtime.getManifest();
  } catch {
    return undefined;
  }
}
