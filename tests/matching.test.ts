import { describe, expect, it } from "vitest";
import type { ResponseInput, StoredResponse } from "@/lib/domain";
import { ageScore, countMatches, hasSharedTag, MATCH_THRESHOLD, preferenceOverlapScore, scoreDirection } from "@/lib/matching";

function response(overrides: Partial<ResponseInput> = {}): ResponseInput {
  return {
    gender: "male",
    age: 27,
    appearance_self: 2,
    body_self: 2,
    financial_self: 2,
    personality: ["warm"],
    hobbies: ["music"],
    appearance_weight: 0,
    body_weight: 0,
    financial_weight: 0,
    personality_weight: 0,
    hobby_weight: 0,
    preferred_personality: [],
    preferred_age_min: null,
    preferred_age_max: null,
    ...overrides,
  };
}

function stored(overrides: Partial<ResponseInput> = {}, id = "subject"): StoredResponse {
  const now = new Date("2026-09-24T00:00:00.000Z");
  return {
    ...response(overrides),
    id,
    owner_token_hash: id.padEnd(64, "0").slice(0, 64),
    questionnaire_version: 1,
    revision: 1,
    consent_version: "2026-09-24-v1",
    consented_at: now.toISOString(),
    last_submission_id: id,
    last_submission_hash: "a".repeat(64),
    submission_window_started_at: now.toISOString(),
    submission_count: 1,
    last_compute_attempt_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: "2026-12-23T00:00:00.000Z",
  };
}

describe("directional matching scores", () => {
  it("maps self assessments to 40, 70 and 100", () => {
    expect(scoreDirection(response({ appearance_weight: 1 }), response({ appearance_self: 1 }))).toBe(40);
    expect(scoreDirection(response({ appearance_weight: 1 }), response({ appearance_self: 2 }))).toBe(70);
    expect(scoreDirection(response({ appearance_weight: 1 }), response({ appearance_self: 3 }))).toBe(100);
  });

  it("removes zero-weight fields from both sides of the average", () => {
    const from = response({ appearance_weight: 1, body_weight: 0 });
    const candidate = response({ appearance_self: 2, body_self: 1 });
    expect(scoreDirection(from, candidate)).toBe(70);
  });

  it("uses 100 when every importance is zero and the age preference passes", () => {
    expect(scoreDirection(response({ preferred_age_min: 24, preferred_age_max: 30 }), response({ age: 27 }))).toBe(100);
    expect(scoreDirection(response({ preferred_age_min: 24, preferred_age_max: 30 }), response({ age: 31 }))).toBe(0);
  });

  it("includes both age endpoints and rejects candidates outside the range", () => {
    expect(ageScore(24, 30, 24)).toBe(100);
    expect(ageScore(24, 30, 30)).toBe(100);
    expect(ageScore(24, 30, 23)).toBe(0);
    expect(ageScore(null, null, 99)).toBe(100);
  });

  it("calculates personality and hobby overlap relative to the preference set", () => {
    expect(preferenceOverlapScore(["warm", "outgoing"], ["warm", "calm", "organized"])).toBe(50);
    expect(preferenceOverlapScore(["music", "outdoors", "screen"], ["music", "outdoors", "gaming"])).toBeCloseTo(200 / 3);
    expect(preferenceOverlapScore([], ["anything"])).toBe(100);
  });

  it("is directional: the two participants can receive different scores", () => {
    const a = response({ appearance_weight: 2, personality_weight: 1, preferred_personality: ["warm"] });
    const b = response({ appearance_self: 3, personality: ["calm"], appearance_weight: 1, personality_weight: 2, preferred_personality: ["warm"] });
    expect(scoreDirection(a, b)).toBeCloseTo(200 / 3);
    expect(scoreDirection(b, a)).toBe(90);
    expect(scoreDirection(a, b)).not.toBe(scoreDirection(b, a));
  });

  it("reproduces the handoff example: A to B is 72.777... and B to A is 85", () => {
    const a = response({
      gender: "male", age: 27, appearance_self: 2, body_self: 2,
      personality: ["warm", "humorous", "organized"], hobbies: ["music", "outdoors", "screen"],
      appearance_weight: 2, body_weight: 0, financial_weight: 1, personality_weight: 2, hobby_weight: 1,
      preferred_personality: ["warm", "outgoing"], preferred_age_min: 24, preferred_age_max: 30,
    });
    const b = response({
      gender: "female", age: 26, appearance_self: 3, body_self: 2, financial_self: 2,
      personality: ["warm", "calm", "organized"], hobbies: ["music", "outdoors", "gaming"],
      appearance_weight: 1, body_weight: 1, financial_weight: 0, personality_weight: 2, hobby_weight: 0,
      preferred_personality: ["warm", "humorous"], preferred_age_min: 25, preferred_age_max: 30,
    });
    expect(scoreDirection(a, b)).toBeCloseTo(72.7777777778);
    expect(scoreDirection(b, a)).toBe(85);
  });

  it("accepts exactly 70 and rejects a score below 70", () => {
    expect(MATCH_THRESHOLD).toBe(70);
    expect(scoreDirection(response({ appearance_weight: 1 }), response({ appearance_self: 2 }))).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(scoreDirection(response({ appearance_weight: 1 }), response({ appearance_self: 1 }))).toBeLessThan(MATCH_THRESHOLD);
    expect(MATCH_THRESHOLD - 0.001).toBeLessThan(MATCH_THRESHOLD);
  });

  it("counts T, P, and mutual D independently and excludes self, same-gender and expired rows", () => {
    const subject = stored({ gender: "male", appearance_weight: 1 }, "subject");
    const reciprocal = stored({
      gender: "female", appearance_self: 3, appearance_weight: 1,
      personality_weight: 1, preferred_personality: ["warm"],
    }, "reciprocal");
    const oneWay = stored({
      gender: "female", appearance_self: 3, appearance_weight: 1,
      personality_weight: 2, preferred_personality: ["outgoing"],
    }, "one-way");
    const sameGender = stored({ gender: "male", appearance_self: 3 }, "same-gender");
    const expired = stored({ gender: "female", appearance_self: 3 }, "expired");
    expired.expires_at = "2026-09-23T23:59:59.000Z";

    const counts = countMatches(subject, [
      { id: subject.id, response: subject, gender: subject.gender, expiresAt: subject.expires_at },
      { id: reciprocal.id, response: reciprocal, gender: reciprocal.gender, expiresAt: reciprocal.expires_at },
      { id: oneWay.id, response: oneWay, gender: oneWay.gender, expiresAt: oneWay.expires_at },
      { id: sameGender.id, response: sameGender, gender: sameGender.gender, expiresAt: sameGender.expires_at },
      { id: expired.id, response: expired, gender: expired.gender, expiresAt: expired.expires_at },
    ], new Date("2026-09-24T00:00:00.000Z"));
    expect(counts).toEqual({
      populationCount: 2, preferredCount: 2, mutualCount: 1,
      sameGenderPopulationCount: 1, sameGenderPersonalityCount: 1, sameGenderHobbyCount: 1,
      oppositeGenderPersonalityCount: 2, oppositeGenderHobbyCount: 2,
    });
  });

  it("counts a shared custom tag once per person, across both genders, and excludes empty hobbies", () => {
    const subject = stored({ personality: ["custom:배려심", "warm"], hobbies: ["custom:클라이밍"] }, "subject");
    const same = stored({ gender: "male", personality: ["custom:배려심", "calm"], hobbies: [] }, "same");
    const opposite = stored({ gender: "female", personality: ["warm", "custom:배려심"], hobbies: ["custom:클라이밍", "music"] }, "opposite");
    const unrelated = stored({ gender: "female", personality: ["outgoing"], hobbies: ["music"] }, "unrelated");
    const counts = countMatches(subject, [same, opposite, unrelated].map((item) => ({
      id: item.id, gender: item.gender, response: item, expiresAt: item.expires_at,
    })), new Date("2026-09-24T00:00:00.000Z"));
    expect(counts).toMatchObject({
      sameGenderPopulationCount: 1, sameGenderPersonalityCount: 1, sameGenderHobbyCount: 0,
      populationCount: 2, oppositeGenderPersonalityCount: 1, oppositeGenderHobbyCount: 1,
    });
    expect(hasSharedTag([], ["music"])).toBe(false);
    expect(hasSharedTag(["custom:클라이밍"], ["custom:클라이밍", "music"])).toBe(true);
  });
});
