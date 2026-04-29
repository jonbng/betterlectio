"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export const POSTHOG_FORCE_REFRESH_COOKIE = "posthog-force-refresh";

export async function refreshDashboard() {
  const c = await cookies();
  c.set(POSTHOG_FORCE_REFRESH_COOKIE, String(Date.now()), {
    maxAge: 15,
    path: "/",
  });
  revalidatePath("/", "page");
}
