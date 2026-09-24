import { NextResponse } from "next/server";
import { getOwnerHash } from "@/lib/server/http";
import { getDataStore } from "@/lib/server/store";
import type { ResponseInput } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ownerHash = await getOwnerHash();
  if (!ownerHash) return NextResponse.json({ response: null }, { headers: { "Cache-Control": "no-store" } });
  try {
    const response = await getDataStore().getResponse(ownerHash);
    if (!response) return NextResponse.json({ response: null }, { headers: { "Cache-Control": "no-store" } });
    const input: ResponseInput = {
      gender: response.gender,
      age: response.age,
      appearance_self: response.appearance_self,
      body_self: response.body_self,
      financial_self: response.financial_self,
      personality: response.personality,
      hobbies: response.hobbies,
      appearance_weight: response.appearance_weight,
      body_weight: response.body_weight,
      financial_weight: response.financial_weight,
      personality_weight: response.personality_weight,
      hobby_weight: response.hobby_weight,
      preferred_personality: response.preferred_personality,
      preferred_age_min: response.preferred_age_min,
      preferred_age_max: response.preferred_age_max,
    };
    return NextResponse.json({ response: input, revision: response.revision }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api] response_lookup_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "저장된 응답을 불러오지 못했어요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
