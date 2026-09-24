import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, getOwnerHash, verifySameOrigin } from "@/lib/server/http";
import { toPublicResult } from "@/lib/server/public-result";
import { getDataStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getResult(force: boolean) {
  const ownerHash = await getOwnerHash();
  if (!ownerHash) return NextResponse.json({ error: "저장된 응답을 찾지 못했어요." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const { response, snapshot } = await getDataStore().getResult(ownerHash, force);
    return NextResponse.json(toPublicResult(response, snapshot), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api] result_lookup_failed", error instanceof Error ? error.name : "unknown");
    return errorResponse(error);
  }
}

export async function GET() { return getResult(false); }

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return NextResponse.json({ error: "요청 출처를 확인할 수 없어요." }, { status: 403 });
  return getResult(true);
}
