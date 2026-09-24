import { describe, expect, it } from "vitest";
import { responseSchema } from "@/lib/validation";

const valid = {
  gender: "male", age: 27, appearance_self: 2, body_self: 2, financial_self: 2,
  personality: ["warm"], hobbies: [], appearance_weight: 1, body_weight: 0,
  financial_weight: 0, personality_weight: 0, hobby_weight: 0, preferred_personality: [],
  preferred_age_min: null, preferred_age_max: null,
};

describe("response input validation", () => {
  it("accepts a valid complete response and strips unknown fields", () => {
    const parsed = responseSchema.parse({ ...valid, unexpected_private_data: "discard" });
    expect(parsed).not.toHaveProperty("unexpected_private_data");
  });
  it("rejects unsupported ages and non-integer ages", () => {
    expect(responseSchema.safeParse({ ...valid, age: 18 }).success).toBe(false);
    expect(responseSchema.safeParse({ ...valid, age: 27.5 }).success).toBe(false);
  });
  it("rejects duplicate tags and more than three selected tags", () => {
    expect(responseSchema.safeParse({ ...valid, personality: ["warm", "warm"] }).success).toBe(false);
    expect(responseSchema.safeParse({ ...valid, personality: ["warm", "calm", "outgoing", "honest"] }).success).toBe(false);
  });
  it("accepts canonical direct-entry tags for personality, hobbies and preferences", () => {
    expect(responseSchema.safeParse({
      ...valid,
      personality: ["custom:배려심", "warm"],
      hobbies: ["custom:클라이밍"],
      personality_weight: 1,
      preferred_personality: ["custom:공감"],
    }).success).toBe(true);
  });
  it("rejects unsafe, unnormalized and duplicate direct-entry tags", () => {
    for (const value of ["custom:<script>", "custom:배려심 ", "custom:HELLO", "custom:123456789012345678901", "custom:"]) {
      expect(responseSchema.safeParse({ ...valid, personality: [value] }).success).toBe(false);
    }
    expect(responseSchema.safeParse({ ...valid, personality: ["custom:배려심", "custom:배려심"] }).success).toBe(false);
    expect(responseSchema.safeParse({ ...valid, hobbies: ["unknown-preset"] }).success).toBe(false);
  });
  it("requires a preference when personality is important", () => {
    expect(responseSchema.safeParse({ ...valid, personality_weight: 1 }).success).toBe(false);
  });
  it("requires hobbies to be irrelevant when the user has none", () => {
    expect(responseSchema.safeParse({ ...valid, hobby_weight: 1 }).success).toBe(false);
  });
  it("rejects partially specified and inverted age ranges", () => {
    expect(responseSchema.safeParse({ ...valid, preferred_age_min: 25 }).success).toBe(false);
    expect(responseSchema.safeParse({ ...valid, preferred_age_min: 31, preferred_age_max: 25 }).success).toBe(false);
  });
});
