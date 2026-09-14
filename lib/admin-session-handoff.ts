const ADMIN_API_ORIGIN = (import.meta.env.VITE_ADMIN_API_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');

interface SessionExport {
  studentId: string;
  schoolId: number;
  cookies: Array<{ name: string; value: string }>;
}

function cookieUrl(cookie: { domain: string; secure: boolean; path: string }): string {
  const host = cookie.domain.replace(/^\./, '');
  return `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`;
}

async function redeem(token: string): Promise<SessionExport> {
  const response = await fetch(`${ADMIN_API_ORIGIN}/api/extension/lectio-session-handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({})) as { error?: string } & SessionExport;
  if (!response.ok) throw new Error(body.error || `Admin API returned ${response.status}`);
  return body;
}

export async function redeemAndInstallAdminSession(
  token: string,
  storeId?: string,
): Promise<{ schoolId: number }> {
  const payload = await redeem(token);
  const currentCookies = await browser.cookies.getAll({
    domain: 'lectio.dk',
    ...(storeId ? { storeId } : {}),
  });
  await Promise.all(currentCookies.map((cookie) => browser.cookies.remove({
    name: cookie.name,
    storeId: cookie.storeId,
    url: cookieUrl(cookie),
  })));

  await browser.storage.local.clear();
  for (const cookie of payload.cookies) {
    const hostOnly = cookie.name.startsWith('__Host-');
    await browser.cookies.set({
      url: 'https://www.lectio.dk/',
      name: cookie.name,
      value: cookie.value,
      ...(hostOnly ? {} : { domain: '.lectio.dk' }),
      path: '/',
      secure: true,
      httpOnly: true,
      ...(storeId ? { storeId } : {}),
    });
  }

  const [loggedIn, autoLogin] = await Promise.all([
    browser.cookies.get({ url: 'https://www.lectio.dk/', name: 'isloggedin3', ...(storeId ? { storeId } : {}) }),
    browser.cookies.get({ url: 'https://www.lectio.dk/', name: 'autologinkeyV2', ...(storeId ? { storeId } : {}) }),
  ]);
  if (loggedIn?.value !== 'Y' && !autoLogin?.value) {
    throw new Error('The imported jar contains no Lectio login cookie');
  }

  await browser.tabs.create({
    url: `https://www.lectio.dk/lectio/${payload.schoolId}/forside.aspx`,
    ...(storeId ? { cookieStoreId: storeId } : {}),
  } as Parameters<typeof browser.tabs.create>[0]);
  return { schoolId: payload.schoolId };
}
