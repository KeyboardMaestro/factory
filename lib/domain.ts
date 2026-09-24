export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const PERSONALITY_TAGS = [
  "warm",
  "calm",
  "outgoing",
  "humorous",
  "honest",
  "organized",
  "spontaneous",
  "independent",
] as const;
export type PersonalityTag = (typeof PERSONALITY_TAGS)[number];
export type CustomTag = `custom:${string}`;
export type PersonalityValue = PersonalityTag | CustomTag;

export const HOBBY_TAGS = [
  "screen",
  "music",
  "exercise",
  "gaming",
  "reading",
  "travel",
  "food_cafe",
  "arts",
  "making",
  "outdoors",
] as const;
export type HobbyTag = (typeof HOBBY_TAGS)[number];
export type HobbyValue = HobbyTag | CustomTag;

export interface ResponseInput {
  gender: Gender;
  age: number;
  appearance_self: 1 | 2 | 3;
  body_self: 1 | 2 | 3;
  financial_self: 1 | 2 | 3;
  personality: PersonalityValue[];
  hobbies: HobbyValue[];
  appearance_weight: 0 | 1 | 2;
  body_weight: 0 | 1 | 2;
  financial_weight: 0 | 1 | 2;
  personality_weight: 0 | 1 | 2;
  hobby_weight: 0 | 1 | 2;
  preferred_personality: PersonalityValue[];
  preferred_age_min: number | null;
  preferred_age_max: number | null;
}

export interface StoredResponse extends ResponseInput {
  id: string;
  owner_token_hash: string;
  questionnaire_version: number;
  revision: number;
  consent_version: string;
  consented_at: string;
  last_submission_id: string;
  last_submission_hash: string;
  submission_window_started_at: string;
  submission_count: number;
  last_compute_attempt_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface ResultSnapshot {
  response_id: string;
  response_revision: number;
  algorithm_version: string;
  population_count: number;
  preferred_count: number;
  mutual_count: number;
  same_gender_population_count: number;
  same_gender_personality_count: number;
  same_gender_hobby_count: number;
  opposite_gender_personality_count: number;
  opposite_gender_hobby_count: number;
  computed_at: string;
  cache_expires_at: string;
}

export interface PublicResult {
  state: "ready" | "sample_small" | "empty";
  population_count: number;
  preferred_count: number | null;
  mutual_count: number | null;
  same_gender_population_count: number;
  same_gender_personality_count: number | null;
  same_gender_hobby_count: number | null;
  opposite_gender_personality_count: number | null;
  opposite_gender_hobby_count: number | null;
  computed_at: string;
  algorithm_version: string;
  response_revision: number;
}

export const CONSENT_VERSION = "2026-09-24-v1";
export const MATCHING_VERSION = "matching-v1";
export const MIN_SAMPLE_SIZE = 20;
