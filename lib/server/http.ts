import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { StoreError } from "@/lib/server/store";

export const OWNER_COOKIE = "ti_owner";
export async function getOwnerHash(): Promise<string | null> {
  const token = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export function verifySameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const incoming = new URL(origin).origin;
    const configured = process.env.APP_ORIGIN;
    return incoming === (configured ? new URL(configured).origin : request.nextUrl.origin);
  } catch {
    return false;
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof StoreError) {
    const status: Record<string, number> = {
      CONFIGURATION_ERROR: 503,
      DATABASE_ERROR: 503,
      REQUEST_TOO_LARGE: 413,
      INVALID_JSON: 400,
      REVISION_CONFLICT: 409,
      IDEMPOTENCY_CONFLICT: 409,
      SUBMISSION_LIMIT: 429,
      RESPONSE_EXPIRED: 409,
      RESPONSE_NOT_FOUND: 404,
      NOT_FOUND: 404,
      CALCULATION_RATE_LIMIT: 429,
      UNSAFE_CONFIGURATION: 503,
    };
    return NextResponse.json(
      { error: publicError(error.code) },
      { status: status[error.code] ?? 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { error: "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요." },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

function publicError(code: string): string {
  const messages: Record<string, string> = {
    CONFIGURATION_ERROR: "서비스 저장 기능을 준비 중이에요. 잠시 후 다시 시도해주세요.",
    REVISION_CONFLICT: "다른 탭에서 응답이 바뀌었어요. 최신 응답을 다시 불러와주세요.",
    IDEMPOTENCY_CONFLICT: "제출 내용을 확인할 수 없어요. 다시 제출해주세요.",
    SUBMISSION_LIMIT: "응답 수정 횟수를 잠시 제한했어요. 나중에 다시 시도해주세요.",
    RESPONSE_EXPIRED: "응답 보관 기간이 끝났어요. 새로 참여해주세요.",
    RESPONSE_NOT_FOUND: "저장된 응답을 찾지 못했어요. 테스트를 다시 시작해주세요.",
    NOT_FOUND: "저장된 응답을 찾지 못했어요. 테스트를 다시 시작해주세요.",
    CALCULATION_RATE_LIMIT: "결과를 방금 계산했어요. 잠시 뒤 다시 확인해주세요.",
  };
  return messages[code] ?? "데이터를 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.";
}

export async function readJson(request: Request, maxBytes = 32_000): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new StoreError("요청이 너무 커요.", "REQUEST_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new StoreError("요청이 너무 커요.", "REQUEST_TOO_LARGE");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new StoreError("요청 내용을 읽을 수 없어요.", "INVALID_JSON");
  }
}
