import { sendRpc } from '@/lib/supabase/client';
import { safeGetManifest } from '@/lib/safe-runtime';

export type ExtensionBrowser = 'chrome' | 'edge' | 'firefox' | 'safari';
export type ExtensionIssueSeverity = 'info' | 'warning' | 'critical';

export type ExtensionHealthIssue = {
  id: string;
  title: string;
  message: string;
  workaround: string | null;
  severity: ExtensionIssueSeverity;
  fixedInVersion: string | null;
  showAnnouncement: boolean;
  snoozeHours: number;
  canUpdateToFix: boolean;
};

export type ExtensionHealth = {
  browser: ExtensionBrowser;
  installedVersion: string;
  latestAvailableVersion: string | null;
  updateAvailable: boolean;
  issues: ExtensionHealthIssue[];
};

export type ExtensionUpdateCheckResult = {
  ok: boolean;
  status: 'update_available' | 'no_update' | 'throttled' | 'unsupported' | 'error';
  version?: string;
  error?: string;
};

const CACHE_PREFIX = 'betterlectio_extension_health_v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let memoryCache: { key: string; fetchedAt: number; data: ExtensionHealth } | null = null;
let inFlight: Promise<ExtensionHealth | null> | null = null;

export function getExtensionBrowser(): ExtensionBrowser {
  const ua = navigator.userAgent;
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/Safari\//i.test(ua) && !/(Chrome|Chromium|CriOS)\//i.test(ua)) return 'safari';
  return 'chrome';
}

function currentIdentity() {
  return {
    browser: getExtensionBrowser(),
    version: safeGetManifest()?.version ?? '0.0.0',
  };
}

function isHealth(value: unknown): value is ExtensionHealth {
  if (!value || typeof value !== 'object') return false;
  const health = value as Partial<ExtensionHealth>;
  return (
    typeof health.browser === 'string' &&
    typeof health.installedVersion === 'string' &&
    (typeof health.latestAvailableVersion === 'string' || health.latestAvailableVersion === null) &&
    typeof health.updateAvailable === 'boolean' &&
    Array.isArray(health.issues)
  );
}

export async function loadExtensionHealth(force = false): Promise<ExtensionHealth | null> {
  const { browser, version } = currentIdentity();
  const key = `${CACHE_PREFIX}:${browser}:${version}`;
  const now = Date.now();

  if (!force && memoryCache?.key === key && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.data;
  }

  if (!force) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cached = JSON.parse(raw) as { fetchedAt?: number; data?: unknown };
        if (
          typeof cached.fetchedAt === 'number' &&
          now - cached.fetchedAt < CACHE_TTL_MS &&
          isHealth(cached.data)
        ) {
          memoryCache = { key, fetchedAt: cached.fetchedAt, data: cached.data };
          return cached.data;
        }
      }
    } catch {
      // Health status is best effort; malformed local cache is ignored.
    }
  }

  if (inFlight) return inFlight;
  inFlight = (async () => {
    const response = await sendRpc('get_extension_health', {
      p_browser: browser,
      p_installed_version: version,
    });
    if (!response.ok || !isHealth(response.data)) return null;

    const data = response.data;
    memoryCache = { key, fetchedAt: Date.now(), data };
    try {
      localStorage.setItem(key, JSON.stringify({ fetchedAt: Date.now(), data }));
    } catch {
      // Storage may be unavailable; keep the in-memory result.
    }
    return data;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export async function requestExtensionUpdateCheck(): Promise<ExtensionUpdateCheckResult> {
  try {
    const result = await browser.runtime.sendMessage({ type: 'bl-extension:update-check' });
    if (!result || typeof result !== 'object') {
      return { ok: false, status: 'error', error: 'Browseren svarede ikke' };
    }
    return result as ExtensionUpdateCheckResult;
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Opdateringstjek mislykkedes',
    };
  }
}

