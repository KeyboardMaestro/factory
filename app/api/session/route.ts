import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OWNER_COOKIE, verifySameOrigin } from "@/lib/server/http";
import { getDataStore } from "@/lib/server/store";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return NextResponse.json({ error: "요청 출처를 확인할 수 없어요." }, { status: 403 });
  if (process.env.NODE_ENV === "production" && (
    !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !process.env.APP_ORIGIN
  )) {
    return NextResponse.json({ error: "서비스 운영 설정을 완료하고 있어요. 잠시 후 다시 시도해주세요." }, { status: 503 });
  }
  const cookieStore = await cookies();
  const oldToken = cookieStore.get(OWNER_COOKIE)?.value;
  let token = oldToken && /^[a-f0-9]{64}$/.test(oldToken) ? oldToken : null;
  if (token) {
    const hash = createHash("sha256").update(token).digest("hex");
    try {
      if (!(await getDataStore().getResponse(hash))) token = null;
    } catch {
      return NextResponse.json({ error: "테스트를 시작할 수 없어요. 잠시 후 다시 시도해주세요." }, { status: 503 });
    }
  }
  if (!token) token = randomBytes(32).toString("hex");
  cookieStore.set(OWNER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 90 * 24 * 60 * 60,
  });
  return NextResponse.json({ ready: true }, { headers: { "Cache-Control": "no-store" } });
}
