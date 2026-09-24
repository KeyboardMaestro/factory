import type { ResponseInput, StoredResponse } from "@/lib/domain";

export const MATCH_THRESHOLD = 70;
const SELF_SCORE = { 1: 40, 2: 70, 3: 100 } as const;

export function preferenceOverlapScore(preferences: readonly string[], candidate: readonly string[]): number {
  if (preferences.length === 0) return 100;
  const candidateSet = new Set(candidate);
  let matches = 0;
  for (const item of preferences) if (candidateSet.has(item)) matches += 1;
  return (matches / preferences.length) * 100;
}

export function ageScore(preferredMin: number | null, preferredMax: number | null, candidateAge: number): 0 | 100 {
  if (preferredMin === null && preferredMax === null) return 100;
  if (preferredMin === null || preferredMax === null) return 0;
  return candidateAge >= preferredMin && candidateAge <= preferredMax ? 100 : 0;
}

export function scoreDirection(from: ResponseInput, candidate: ResponseInput): number {
  if (ageScore(from.preferred_age_min, from.preferred_age_max, candidate.age) === 0) return 0;

  const rows: ReadonlyArray<readonly [number, number]> = [
    [from.appearance_weight, SELF_SCORE[candidate.appearance_self]],
    [from.body_weight, SELF_SCORE[candidate.body_self]],
    [from.financial_weight, SELF_SCORE[candidate.financial_self]],
    [from.personality_weight, preferenceOverlapScore(from.preferred_personality, candidate.personality)],
    [from.hobby_weight, preferenceOverlapScore(from.hobbies, candidate.hobbies)],
  ];

  let weightedTotal = 0;
  let totalWeight = 0;
  for (const [weight, score] of rows) {
    weightedTotal += weight * score;
    totalWeight += weight;
  }

  return totalWeight === 0 ? 100 : weightedTotal / totalWeight;
}

export interface MatchCounts {
  populationCount: number;
  preferredCount: number;
  mutualCount: number;
  sameGenderPopulationCount: number;
  sameGenderPersonalityCount: number;
  sameGenderHobbyCount: number;
  oppositeGenderPersonalityCount: number;
  oppositeGenderHobbyCount: number;
}

export interface MatchCandidate {
  response: ResponseInput;
  gender: string;
  expiresAt: string;
  id?: string;
  questionnaireVersion?: number;
}

export function hasSharedTag(left: readonly string[], right: readonly string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

export function countMatches(
  subject: StoredResponse,
  candidates: readonly MatchCandidate[],
  now = new Date(),
): MatchCounts {
  const oppositeGender = subject.gender === "male" ? "female" : "male";
  let populationCount = 0;
  let preferredCount = 0;
  let mutualCount = 0;
  let sameGenderPopulationCount = 0;
  let sameGenderPersonalityCount = 0;
  let sameGenderHobbyCount = 0;
  let oppositeGenderPersonalityCount = 0;
  let oppositeGenderHobbyCount = 0;

  for (const item of candidates) {
    if (item.response === subject || item.id === subject.id || Date.parse(item.expiresAt) <= now.getTime()
      || (item.questionnaireVersion !== undefined && item.questionnaireVersion !== subject.questionnaire_version)) continue;
    if (item.gender === subject.gender) {
      sameGenderPopulationCount += 1;
      if (hasSharedTag(subject.personality, item.response.personality)) sameGenderPersonalityCount += 1;
      if (hasSharedTag(subject.hobbies, item.response.hobbies)) sameGenderHobbyCount += 1;
      continue;
    }
    if (item.gender !== oppositeGender) continue;
    populationCount += 1;
    if (hasSharedTag(subject.personality, item.response.personality)) oppositeGenderPersonalityCount += 1;
    if (hasSharedTag(subject.hobbies, item.response.hobbies)) oppositeGenderHobbyCount += 1;
    const forward = scoreDirection(subject, item.response);
    if (forward >= MATCH_THRESHOLD) {
      preferredCount += 1;
      if (scoreDirection(item.response, subject) >= MATCH_THRESHOLD) mutualCount += 1;
    }
  }

  return {
    populationCount, preferredCount, mutualCount,
    sameGenderPopulationCount, sameGenderPersonalityCount, sameGenderHobbyCount,
    oppositeGenderPersonalityCount, oppositeGenderHobbyCount,
  };
}
