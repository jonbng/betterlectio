import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "admin_session";
const SESSION_VALUE = "authenticated";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(request: Request) {
  const { pin } = await request.json();
  const expected = process.env.ADMIN_PIN;

  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_PIN not configured" },
      { status: 500 },
    );
  }

  if (pin !== expected) {
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, SESSION_VALUE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
