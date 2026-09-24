import { z } from "zod";
import { CONSENT_VERSION, GENDERS, HOBBY_TAGS, PERSONALITY_TAGS, type CustomTag } from "@/lib/domain";
import { isValidTagValue } from "@/lib/tags";

const uniqueArray = <T extends string>(values: readonly [T, ...T[]], min: number, max: number) =>
  z.array(z.custom<T | CustomTag>((value) => typeof value === "string" && isValidTagValue(value, values), { message: "선택한 항목을 확인해주세요." }))
    .min(min).max(max).refine((items) => new Set(items).size === items.length, {
    message: "중복 선택할 수 없어요.",
  });

export const responseSchema = z
  .object({
    gender: z.enum(GENDERS),
    age: z.number().int().min(19).max(99),
    appearance_self: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    body_self: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    financial_self: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    personality: uniqueArray(PERSONALITY_TAGS, 1, 3),
    hobbies: uniqueArray(HOBBY_TAGS, 0, 3),
    appearance_weight: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    body_weight: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    financial_weight: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    personality_weight: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    hobby_weight: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    preferred_personality: uniqueArray(PERSONALITY_TAGS, 0, 3),
    preferred_age_min: z.number().int().min(19).max(99).nullable(),
    preferred_age_max: z.number().int().min(19).max(99).nullable(),
  })
  .superRefine((value, context) => {
    if (value.hobbies.length === 0 && value.hobby_weight !== 0) {
      context.addIssue({ code: "custom", path: ["hobby_weight"], message: "취미가 없으면 취미 중요도는 상관없음이어야 해요." });
    }
    if (value.personality_weight === 0 && value.preferred_personality.length > 0) {
      context.addIssue({ code: "custom", path: ["preferred_personality"], message: "성격이 상관없다면 선호 성격을 비워주세요." });
    }
    if (value.personality_weight > 0 && value.preferred_personality.length === 0) {
      context.addIssue({ code: "custom", path: ["preferred_personality"], message: "원하는 성격을 하나 이상 골라주세요." });
    }
    const { preferred_age_min: min, preferred_age_max: max } = value;
    if ((min === null) !== (max === null)) {
      context.addIssue({ code: "custom", path: [min === null ? "preferred_age_min" : "preferred_age_max"], message: "나이 범위의 시작과 끝을 모두 입력해주세요." });
    } else if (min !== null && max !== null && min > max) {
      context.addIssue({ code: "custom", path: ["preferred_age_min"], message: "시작 나이는 끝 나이보다 작거나 같아야 해요." });
    }
  });

export const submitSchema = z.object({
  consent: z.literal(true),
  consentVersion: z.literal(CONSENT_VERSION),
  expectedRevision: z.number().int().positive().nullable(),
  submissionId: z.string().uuid(),
  response: responseSchema,
});

const allowedAnalyticsEvents = [
  "landing_view",
  "test_start",
  "question_progress",
  "test_complete",
  "result_view",
  "share_click",
  "submit_error",
  "result_error",
  "share_outcome",
] as const;

export const analyticsEventSchema = z.object({
  eventId: z.string().uuid(),
  flowId: z.string().uuid(),
  name: z.enum(allowedAnalyticsEvents),
  stepId: z.number().int().min(1).max(7).optional(),
  source: z.enum(["direct", "kakao", "copy", "native", "instagram"]).optional(),
  channel: z.enum(["kakao", "native", "copy", "instagram"]).optional(),
  resultState: z.enum(["ready", "sample_small", "empty", "error"]).optional(),
  isRepeat: z.boolean().optional(),
  durationBucket: z.enum(["under_30s", "30_60s", "over_60s"]).optional(),
  outcome: z.enum(["returned", "cancelled", "failed", "copied"]).optional(),
  errorCode: z.enum(["validation", "storage", "calculation", "network", "unknown"]).optional(),
});

export type ResponseInput = z.infer<typeof responseSchema>;
export type SubmitInput = z.infer<typeof submitSchema>;
export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;
