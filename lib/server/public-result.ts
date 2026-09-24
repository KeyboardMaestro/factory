import "server-only";
import { MATCHING_VERSION, MIN_SAMPLE_SIZE, type PublicResult, type ResultSnapshot, type StoredResponse } from "@/lib/domain";

export function toPublicResult(response: StoredResponse, snapshot: ResultSnapshot): PublicResult {
  const state = snapshot.population_count === 0 ? "empty" : snapshot.population_count < MIN_SAMPLE_SIZE ? "sample_small" : "ready";
  const oppositeReady = snapshot.population_count >= MIN_SAMPLE_SIZE;
  const sameReady = snapshot.same_gender_population_count >= MIN_SAMPLE_SIZE;

  return {
    state,
    population_count: snapshot.population_count,
    preferred_count: oppositeReady ? snapshot.preferred_count : null,
    mutual_count: oppositeReady ? snapshot.mutual_count : null,
    same_gender_population_count: snapshot.same_gender_population_count,
    same_gender_personality_count: sameReady ? snapshot.same_gender_personality_count : null,
    same_gender_hobby_count: sameReady ? snapshot.same_gender_hobby_count : null,
    opposite_gender_personality_count: oppositeReady ? snapshot.opposite_gender_personality_count : null,
    opposite_gender_hobby_count: oppositeReady ? snapshot.opposite_gender_hobby_count : null,
    computed_at: snapshot.computed_at,
    algorithm_version: MATCHING_VERSION,
    response_revision: response.revision,
  };
}
