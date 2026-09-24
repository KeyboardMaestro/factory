import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDataStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidSecret(request: NextRequest, expected: string | undefined): boolean {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBytes = Buffer.from(expected ?? "");
  const suppliedBytes = Buffer.from(supplied);
  return Boolean(expected && suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes));
}

async function cleanup(request: NextRequest, secret: string | undefined) {
  if (!hasValidSecret(request, secret)) return NextResponse.json({ error: "인증에 실패했어요." }, { status: 401 });
  try {
    return NextResponse.json(await getDataStore().cleanupExpired(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "정리 작업을 완료하지 못했어요." }, { status: 503 });
  }
}

// Vercel Cron sends an authenticated GET request using CRON_SECRET.
export async function GET(request: NextRequest) {
  return cleanup(request, process.env.CRON_SECRET);
}

// Keep POST available for external schedulers that use MAINTENANCE_SECRET.
export async function POST(request: NextRequest) {
  return cleanup(request, process.env.MAINTENANCE_SECRET);
}
