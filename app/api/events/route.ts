import { NextResponse, type NextRequest } from "next/server";
import { analyticsEventSchema } from "@/lib/validation";
import { readJson, verifySameOrigin } from "@/lib/server/http";
import { getDataStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return NextResponse.json({ error: "요청 출처를 확인할 수 없어요." }, { status: 403 });
  let body: unknown;
  try { body = await readJson(request, 4_000); }
  catch { return new NextResponse(null, { status: 204 }); }
  const parsed = analyticsEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "분석 이벤트를 확인해주세요." }, { status: 422 });
  try {
    await getDataStore().insertAnalytics(parsed.data);
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
}
