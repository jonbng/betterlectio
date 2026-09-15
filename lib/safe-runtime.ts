import { browser, type PublicPath } from 'wxt/browser';

/** Read an extension asset URL without crashing an orphaned content script. */
export function safeRuntimeUrl(path: PublicPath): string | undefined {
  try {
    return browser.runtime.getURL(path);
  } catch {
    return undefined;
  }
}

/** Read the manifest without crashing after the extension context is invalidated. */
export function safeGetManifest(): ReturnType<typeof browser.runtime.getManifest> | undefined {
  try {
    return browser.runtime.getManifest();
  } catch {
    return undefined;
  }
}
