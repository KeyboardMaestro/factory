import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { OWNER_COOKIE, getOwnerHash, verifySameOrigin } from "@/lib/server/http";
import { getDataStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  if (!verifySameOrigin(request)) return NextResponse.json({ error: "요청 출처를 확인할 수 없어요." }, { status: 403 });
  const ownerHash = await getOwnerHash();
  if (!ownerHash) return NextResponse.json({ deleted: false }, { headers: { "Cache-Control": "no-store" } });
  try {
    const deleted = await getDataStore().deleteResponse(ownerHash);
    (await cookies()).delete(OWNER_COOKIE);
    return NextResponse.json({ deleted }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "응답을 삭제하지 못했어요. 다시 시도해주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
