/**
 * Session keepalive — runs as a background daemon process that periodically
 * pings Lectio's forside.aspx to prevent the session from timing out.
 *
 * Uses a PID file at ~/.lectio-cli/keepalive.pid to track the daemon.
 * Logs activity to ~/.lectio-cli/keepalive.log.
 *
 * Lectio sessions expire after ~60 minutes of inactivity, so we ping
 * every 10 minutes by default to stay well within that window.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fetchLectio } from "./http.js";
import { getStoredSchoolId, updateCookiesFromResponse } from "./cookies.js";
import { getCookies, setCookies } from "./storage.js";

const CONFIG_DIR = join(homedir(), ".lectio-cli");
const PID_FILE = join(CONFIG_DIR, "keepalive.pid");
const LOG_FILE = join(CONFIG_DIR, "keepalive.log");

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export interface KeepaliveStatus {
  running: boolean;
  pid?: number;
  interval?: number; // seconds
  logFile?: string;
}

/**
 * Write a timestamped line to the keepalive log file.
 */
function log(message: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    // If we can't write to the log, just continue
  }
}

/**
 * Perform a single keepalive ping. GETs forside.aspx and saves any
 * updated cookies from the response (this is what keeps the session alive —
 * Lectio updates LastAuthenticatedPageLoad2 on each request).
 */
export async function ping(): Promise<{
  success: boolean;
  status?: number;
  error?: string;
}> {
  try {
    const schoolId = getStoredSchoolId();
    if (!schoolId) {
      return { success: false, error: "No authenticated session" };
    }

    const result = await fetchLectio("forside.aspx", { schoolId });

    return { success: true, status: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Get the current keepalive daemon status.
 */
export function getKeepaliveStatus(): KeepaliveStatus {
  if (!existsSync(PID_FILE)) {
    return { running: false };
  }

  try {
    const content = readFileSync(PID_FILE, "utf-8").trim();
    const data = JSON.parse(content) as { pid: number; interval: number };
    const pid = data.pid;

    // Check if process is still running
    try {
      process.kill(pid, 0); // Signal 0 = just check existence
      return {
        running: true,
        pid,
        interval: data.interval,
        logFile: LOG_FILE,
      };
    } catch {
      // Process is dead, clean up stale PID file
      cleanupPidFile();
      return { running: false };
    }
  } catch {
    cleanupPidFile();
    return { running: false };
  }
}

/**
 * Start the keepalive loop in the current process (foreground mode).
 * Used by the detached child process, or for testing.
 */
export async function runKeepaliveLoop(intervalMs: number): Promise<never> {
  const intervalSec = Math.round(intervalMs / 1000);
  log(`Keepalive started (PID ${process.pid}, interval ${intervalSec}s)`);

  // Write PID file
  writePidFile(process.pid, intervalSec);

  // Handle graceful shutdown
  const cleanup = () => {
    log("Keepalive stopping (signal received)");
    cleanupPidFile();
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  // Initial ping
  const initialResult = await ping();
  if (initialResult.success) {
    log(`Ping OK (status ${initialResult.status})`);
  } else {
    log(`Ping FAILED: ${initialResult.error}`);
  }

  // Periodic pings
  const interval = setInterval(async () => {
    const result = await ping();
    if (result.success) {
      log(`Ping OK (status ${result.status})`);
    } else {
      log(`Ping FAILED: ${result.error}`);
      // If session expired, stop the keepalive — no point pinging a dead session
      if (result.error?.includes("Session expired")) {
        log("Session expired, stopping keepalive");
        cleanupPidFile();
        clearInterval(interval);
        process.exit(1);
      }
    }
  }, intervalMs);

  // Keep the process alive forever
  return new Promise(() => {});
}

/**
 * Stop a running keepalive daemon.
 */
export function stopKeepalive(): boolean {
  const status = getKeepaliveStatus();
  if (!status.running || !status.pid) {
    cleanupPidFile();
    return false;
  }

  try {
    process.kill(status.pid, "SIGTERM");
    log(`Keepalive stopped (sent SIGTERM to PID ${status.pid})`);
    cleanupPidFile();
    return true;
  } catch {
    // Process might already be dead
    cleanupPidFile();
    return false;
  }
}

/**
 * Read the last N lines from the keepalive log.
 */
export function readLog(lines: number = 20): string[] {
  if (!existsSync(LOG_FILE)) return [];
  try {
    const content = readFileSync(LOG_FILE, "utf-8");
    const allLines = content.split("\n").filter((l) => l.trim().length > 0);
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}

function writePidFile(pid: number, intervalSec: number): void {
  writeFileSync(
    PID_FILE,
    JSON.stringify({ pid, interval: intervalSec }),
    "utf-8"
  );
}

function cleanupPidFile(): void {
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  } catch {
    // Ignore
  }
}
