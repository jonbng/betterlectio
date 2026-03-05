import puppeteer, { Browser, Page, Cookie } from "puppeteer";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthResult } from "../types.js";
import { findChrome } from "./chrome-finder.js";

interface AuthOptions {
  schoolId: string;
  chromePath?: string;
  timeout?: number; // in milliseconds
  onMessage?: (message: string) => void;
}

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL = 500; // 500ms

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function authenticateWithBrowser(
  options: AuthOptions
): Promise<AuthResult> {
  const { schoolId, chromePath, timeout = DEFAULT_TIMEOUT, onMessage } = options;

  const executablePath = findChrome(chromePath);
  const userDataDir = mkdtempSync(join(tmpdir(), "lectio-cli-"));

  let browser: Browser | null = null;

  try {
    onMessage?.("Launching browser...");

    browser = await puppeteer.launch({
      headless: false,
      executablePath,
      userDataDir,
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-popup-blocking",
        "--window-size=1024,768",
      ],
      defaultViewport: {
        width: 1024,
        height: 768,
      },
    });

    const page = await browser.newPage();

    // Navigate to login page
    const loginUrl = `https://www.lectio.dk/lectio/${schoolId}/login.aspx`;
    onMessage?.(`Navigating to ${loginUrl}`);

    await page.goto(loginUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    onMessage?.("Please log in using the browser window...");

    // Poll for authentication cookie
    const cookies = await pollForAuthentication(page, browser, timeout);

    onMessage?.(`Authentication successful! (captured ${cookies.length} cookies)`);

    return { success: true, cookies };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      cookies: [],
      error: message,
    };
  } finally {
    // Close browser
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore close errors
      }
    }

    // Clean up temp directory
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function pollForAuthentication(
  page: Page,
  browser: Browser,
  timeout: number
): Promise<Cookie[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      // page.cookies() only returns cookies for the current page URL.
      // Use the CDP session to get ALL cookies from the browser, including
      // ones set on different subdomains or paths that we'd otherwise miss.
      const allCookies = await getAllBrowserCookies(browser, page);

      const authCookie = allCookies.find(
        (c) => c.name === "isloggedin3" && c.value === "Y"
      );

      if (authCookie) {
        // Also verify we have the school cookie
        const schoolCookie = allCookies.find((c) => c.name === "BaseSchoolUrl");
        if (schoolCookie) {
          return allCookies;
        }
      }
    } catch {
      // Page might be navigating, ignore and retry
    }

    await delay(POLL_INTERVAL);
  }

  throw new Error(
    "Authentication timeout. Please try again and complete the login within 5 minutes."
  );
}

/**
 * Get ALL cookies from the browser via CDP (Chrome DevTools Protocol).
 * This captures cookies across all domains/paths, not just the current page.
 * We filter to lectio.dk domains to avoid capturing unrelated cookies.
 */
async function getAllBrowserCookies(
  browser: Browser,
  page: Page
): Promise<Cookie[]> {
  try {
    // Use CDP to get all cookies from the browser
    const client = await page.createCDPSession();
    const { cookies } = await client.send("Network.getAllCookies") as {
      cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        expires: number;
        size: number;
        httpOnly: boolean;
        secure: boolean;
        session: boolean;
        sameSite?: string;
      }>;
    };
    await client.detach();

    // Filter to lectio.dk cookies only and map to Puppeteer's Cookie format
    return cookies
      .filter((c) => c.domain.includes("lectio.dk"))
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        session: c.session,
        sameSite: c.sameSite as Cookie["sameSite"],
        // These fields exist on Puppeteer Cookie but aren't in CDP response
        size: c.size,
      })) as Cookie[];
  } catch {
    // Fallback to page.cookies() if CDP fails
    return await page.cookies();
  }
}
