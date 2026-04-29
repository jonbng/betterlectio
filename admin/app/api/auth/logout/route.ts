import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "admin_session";

export async function POST(req: Request) {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  const url = new URL("/login", req.url);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(req: Request) {
  return POST(req);
}
