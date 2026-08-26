import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config, CookieStore, SchoolCache } from "../types.js";

const CONFIG_DIR = join(homedir(), ".lectio-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const COOKIES_FILE = join(CONFIG_DIR, "cookies.json");
const SCHOOLS_CACHE_FILE = join(CONFIG_DIR, "schools-cache.json");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  chmodSync(CONFIG_DIR, 0o700);
}

function readJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function writeJsonFile<T>(path: string, data: T): void {
  ensureConfigDir();
  writeFileSync(path, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
  chmodSync(path, 0o600);
}

// Config
export function getConfig(): Config {
  return readJsonFile<Config>(CONFIG_FILE) ?? {};
}

export function setConfig(config: Config): void {
  writeJsonFile(CONFIG_FILE, config);
}

export function updateConfig(updates: Partial<Config>): void {
  const current = getConfig();
  setConfig({ ...current, ...updates });
}

export function resetConfig(): void {
  writeJsonFile(CONFIG_FILE, {});
}

export function getConfigPath(): string {
  return CONFIG_DIR;
}

// Cookies
export function getCookies(): CookieStore | null {
  return readJsonFile<CookieStore>(COOKIES_FILE);
}

export function setCookies(cookies: CookieStore): void {
  writeJsonFile(COOKIES_FILE, cookies);
}

export function clearCookies(): void {
  if (existsSync(COOKIES_FILE)) {
    writeFileSync(COOKIES_FILE, "{}", { encoding: "utf-8", mode: 0o600 });
    chmodSync(COOKIES_FILE, 0o600);
  }
}

// Schools cache
export function getSchoolsCache(): SchoolCache | null {
  const cache = readJsonFile<SchoolCache>(SCHOOLS_CACHE_FILE);
  if (!cache) return null;

  // Check if cache is older than 7 days
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - cache.fetchedAt > weekMs) {
    return null; // Expired
  }

  return cache;
}

export function setSchoolsCache(cache: SchoolCache): void {
  writeJsonFile(SCHOOLS_CACHE_FILE, cache);
}

export function clearSchoolsCache(): void {
  if (existsSync(SCHOOLS_CACHE_FILE)) {
    writeFileSync(SCHOOLS_CACHE_FILE, "{}", { encoding: "utf-8", mode: 0o600 });
    chmodSync(SCHOOLS_CACHE_FILE, 0o600);
  }
}
