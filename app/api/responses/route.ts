import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { submitSchema } from "@/lib/validation";
import { errorResponse, getOwnerHash, readJson, verifySameOrigin } from "@/lib/server/http";
import { toPublicResult } from "@/lib/server/public-result";
import { getDataStore, hashSubmission, StoreError } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return NextResponse.json({ error: "요청 출처를 확인할 수 없어요." }, { status: 403 });
  const ownerHash = await getOwnerHash();
  if (!ownerHash) return NextResponse.json({ error: "테스트 세션이 만료됐어요. 다시 시작해주세요." }, { status: 401 });

  let body: unknown;
  try { body = await readJson(request); }
  catch (error) { return errorResponse(error); }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "응답을 확인해주세요.", fields: parsed.error.flatten().fieldErrors }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
  const payload = parsed.data;
  const canonicalHash = hashSubmission(payload.response);
  const requestHash = createHash("sha256").update(`${payload.consentVersion}:${canonicalHash}`).digest("hex");
  if (payload.expectedRevision !== null && payload.expectedRevision < 1) {
    return NextResponse.json({ error: "저장된 응답 정보를 다시 확인해주세요." }, { status: 409 });
  }

  let saved;
  try {
    saved = await getDataStore().saveResponse({
      ownerHash,
      input: payload.response,
      expectedRevision: payload.expectedRevision,
      submissionId: payload.submissionId,
      submissionHash: requestHash,
      consentVersion: payload.consentVersion,
    });
  } catch (error) {
    console.error("[api] response_save_failed", error instanceof StoreError ? error.code : "unknown");
    return errorResponse(error);
  }

  try {
    const { response, snapshot } = await getDataStore().getResult(ownerHash);
    return NextResponse.json({
      saved: true,
      revision: saved.revision,
      result: toPublicResult(response, snapshot),
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api] result_calculation_failed_after_save", error instanceof StoreError ? error.code : "unknown");
    return NextResponse.json({ saved: true, revision: saved.revision, resultPending: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
}
