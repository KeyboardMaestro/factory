import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { MATCHING_VERSION, type ResponseInput, type ResultSnapshot, type StoredResponse } from "@/lib/domain";
import { countMatches } from "@/lib/matching";
import type { AnalyticsEventInput } from "@/lib/validation";

export class StoreError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "StoreError";
  }
}

export interface SaveRequest {
  ownerHash: string;
  input: ResponseInput;
  expectedRevision: number | null;
  submissionId: string;
  submissionHash: string;
  consentVersion: string;
}

export interface DataStore {
  getResponse(ownerHash: string): Promise<StoredResponse | null>;
  saveResponse(request: SaveRequest): Promise<StoredResponse>;
  getResult(ownerHash: string, force?: boolean): Promise<{ response: StoredResponse; snapshot: ResultSnapshot }>;
  deleteResponse(ownerHash: string): Promise<boolean>;
  insertAnalytics(event: AnalyticsEventInput): Promise<void>;
  cleanupExpired(): Promise<{ responses: number; events: number }>;
}

export function hashSubmission(input: ResponseInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

type DbRow = Record<string, unknown>;

function asStoredResponse(row: DbRow): StoredResponse {
  return {
    ...(row as unknown as ResponseInput),
    id: String(row.id),
    owner_token_hash: String(row.owner_token_hash),
    questionnaire_version: Number(row.questionnaire_version),
    revision: Number(row.revision),
    consent_version: String(row.consent_version),
    consented_at: String(row.consented_at),
    last_submission_id: String(row.last_submission_id),
    last_submission_hash: String(row.last_submission_hash),
    submission_window_started_at: String(row.submission_window_started_at),
    submission_count: Number(row.submission_count),
    last_compute_attempt_at: row.last_compute_attempt_at ? String(row.last_compute_attempt_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    expires_at: String(row.expires_at),
  };
}

function asSnapshot(row: DbRow): ResultSnapshot {
  return {
    response_id: String(row.response_id),
    response_revision: Number(row.response_revision),
    algorithm_version: String(row.algorithm_version),
    population_count: Number(row.population_count),
    preferred_count: Number(row.preferred_count),
    mutual_count: Number(row.mutual_count),
    same_gender_population_count: Number(row.same_gender_population_count),
    same_gender_personality_count: Number(row.same_gender_personality_count),
    same_gender_hobby_count: Number(row.same_gender_hobby_count),
    opposite_gender_personality_count: Number(row.opposite_gender_personality_count),
    opposite_gender_hobby_count: Number(row.opposite_gender_hobby_count),
    computed_at: String(row.computed_at),
    cache_expires_at: String(row.cache_expires_at),
  };
}

function assertData<T>(data: T | null, error: { message: string; code?: string } | null): T {
  if (error) {
    const message = error.message;
    const match = [
      "REVISION_CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "SUBMISSION_LIMIT",
      "RESPONSE_EXPIRED",
      "RESPONSE_NOT_FOUND",
      "CALCULATION_RATE_LIMIT",
      "ALGORITHM_VERSION_UNSUPPORTED",
    ].find((code) => message.includes(code));
    if (match) throw new StoreError(match, match);
    throw new StoreError("데이터 저장소에 연결할 수 없어요.", error.code ?? "DATABASE_ERROR");
  }
  if (data === null) throw new StoreError("데이터 저장소에서 결과를 찾지 못했어요.", "NOT_FOUND");
  return data;
}

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new StoreError("Supabase 환경변수를 설정해야 저장 기능을 사용할 수 있어요.", "CONFIGURATION_ERROR");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "taste-intersection-server" } },
  });
}

class SupabaseStore implements DataStore {
  async getResponse(ownerHash: string): Promise<StoredResponse | null> {
    const { data, error } = await getSupabase()
      .from("responses")
      .select("*")
      .eq("owner_token_hash", ownerHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) assertData(null, error);
    return data ? asStoredResponse(data as DbRow) : null;
  }

  async saveResponse(request: SaveRequest): Promise<StoredResponse> {
    const { data, error } = await getSupabase().rpc("save_response", {
      p_owner_token_hash: request.ownerHash,
      p_response: request.input,
      p_expected_revision: request.expectedRevision,
      p_submission_id: request.submissionId,
      p_submission_hash: request.submissionHash,
      p_consent_version: request.consentVersion,
    });
    if (error) assertData(null, error);
    const row = Array.isArray(data) ? data[0] : data;
    return asStoredResponse(assertData(row as DbRow | null, null));
  }

  async getResult(ownerHash: string, force = false): Promise<{ response: StoredResponse; snapshot: ResultSnapshot }> {
    const response = await this.getResponse(ownerHash);
    if (!response) throw new StoreError("저장된 응답을 찾지 못했어요.", "NOT_FOUND");

    if (!force) {
      const { data, error } = await getSupabase()
        .from("result_snapshots")
        .select("*")
        .eq("response_id", response.id)
        .eq("response_revision", response.revision)
        .eq("algorithm_version", MATCHING_VERSION)
        .gt("cache_expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) assertData(null, error);
      if (data) return { response, snapshot: asSnapshot(data as DbRow) };
    }

    const { data, error } = await getSupabase().rpc("calculate_user_result", {
      p_response_id: response.id,
      p_algorithm_version: MATCHING_VERSION,
      p_force: force,
    });
    if (error) assertData(null, error);
    const row = Array.isArray(data) ? data[0] : data;
    return { response, snapshot: asSnapshot(assertData(row as DbRow | null, null)) };
  }

  async deleteResponse(ownerHash: string): Promise<boolean> {
    const { data, error } = await getSupabase()
      .from("responses")
      .delete()
      .eq("owner_token_hash", ownerHash)
      .select("id")
      .maybeSingle();
    if (error) assertData(null, error);
    return Boolean(data);
  }

  async insertAnalytics(event: AnalyticsEventInput): Promise<void> {
    const properties = Object.fromEntries(
      Object.entries({
        step_id: event.stepId,
        source: event.source,
        channel: event.channel,
        result_state: event.resultState,
        is_repeat: event.isRepeat,
        duration_bucket: event.durationBucket,
        outcome: event.outcome,
        error_code: event.errorCode,
      }).filter(([, value]) => value !== undefined),
    );
    const { error } = await getSupabase().from("analytics_events").upsert(
      { event_id: event.eventId, flow_id: event.flowId, event_name: event.name, properties },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
    if (error) assertData(null, error);
  }

  async cleanupExpired(): Promise<{ responses: number; events: number }> {
    const { data, error } = await getSupabase().rpc("cleanup_expired_data");
    if (error) assertData(null, error);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      responses: Number((row as DbRow | null)?.deleted_responses ?? 0),
      events: Number((row as DbRow | null)?.deleted_events ?? 0),
    };
  }
}

interface MemoryState {
  responses: Map<string, StoredResponse>;
  snapshots: Map<string, ResultSnapshot>;
  events: Map<string, { event: AnalyticsEventInput; createdAt: string }>;
}

declare global {
  // Isolated test adapter; never enabled by the production runtime.
  var __tasteIntersectionTestState: MemoryState | undefined;
}

function getMemoryState(): MemoryState {
  globalThis.__tasteIntersectionTestState ??= {
    responses: new Map(),
    snapshots: new Map(),
    events: new Map(),
  };
  return globalThis.__tasteIntersectionTestState;
}

class TestMemoryStore implements DataStore {
  private get state(): MemoryState { return getMemoryState(); }

  async getResponse(ownerHash: string): Promise<StoredResponse | null> {
    const response = this.state.responses.get(ownerHash);
    if (!response || Date.parse(response.expires_at) <= Date.now()) return null;
    return structuredClone(response);
  }

  async saveResponse(request: SaveRequest): Promise<StoredResponse> {
    const state = this.state;
    const now = new Date();
    const nowIso = now.toISOString();
    const current = state.responses.get(request.ownerHash);
    if (current && Date.parse(current.expires_at) <= now.getTime()) {
      state.responses.delete(request.ownerHash);
      state.snapshots.delete(current.id);
    }
    const existing = state.responses.get(request.ownerHash);
    if (existing?.last_submission_id === request.submissionId) {
      if (existing.last_submission_hash !== request.submissionHash) throw new StoreError("IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT");
      return structuredClone(existing);
    }
    if (existing && request.expectedRevision !== existing.revision) throw new StoreError("REVISION_CONFLICT", "REVISION_CONFLICT");
    if (!existing && request.expectedRevision !== null) throw new StoreError("REVISION_CONFLICT", "REVISION_CONFLICT");
    let windowStarted = existing?.submission_window_started_at ?? nowIso;
    let count = existing?.submission_count ?? 0;
    if (now.getTime() - Date.parse(windowStarted) >= 24 * 60 * 60 * 1000) { windowStarted = nowIso; count = 0; }
    if (existing && count >= 3) throw new StoreError("SUBMISSION_LIMIT", "SUBMISSION_LIMIT");
    count += 1;
    const saved: StoredResponse = {
      ...structuredClone(request.input),
      id: existing?.id ?? randomUUID(),
      owner_token_hash: request.ownerHash,
      questionnaire_version: 1,
      revision: (existing?.revision ?? 0) + 1,
      consent_version: request.consentVersion,
      consented_at: existing?.consent_version === request.consentVersion ? existing.consented_at : nowIso,
      last_submission_id: request.submissionId,
      last_submission_hash: request.submissionHash,
      submission_window_started_at: windowStarted,
      submission_count: count,
      last_compute_attempt_at: null,
      created_at: existing?.created_at ?? nowIso,
      updated_at: nowIso,
      expires_at: existing?.expires_at ?? new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
    state.responses.set(request.ownerHash, saved);
    state.snapshots.delete(saved.id);
    return structuredClone(saved);
  }

  async getResult(ownerHash: string, force = false): Promise<{ response: StoredResponse; snapshot: ResultSnapshot }> {
    const response = await this.getResponse(ownerHash);
    if (!response) throw new StoreError("RESPONSE_NOT_FOUND", "NOT_FOUND");
    const old = this.state.snapshots.get(response.id);
    if (!force && old && Number.isFinite(old.same_gender_population_count)
      && old.response_revision === response.revision && old.algorithm_version === MATCHING_VERSION && Date.parse(old.cache_expires_at) > Date.now()) {
      return { response, snapshot: structuredClone(old) };
    }
    if (response.last_compute_attempt_at && Date.now() - Date.parse(response.last_compute_attempt_at) < 10_000) {
      throw new StoreError("CALCULATION_RATE_LIMIT", "CALCULATION_RATE_LIMIT");
    }
    const lastAttempt = new Date().toISOString();
    response.last_compute_attempt_at = lastAttempt;
    this.state.responses.set(ownerHash, response);
    const candidates = [...this.state.responses.values()]
      .filter((candidate) => candidate.id !== response.id)
      .map((candidate) => ({ response: candidate, gender: candidate.gender, expiresAt: candidate.expires_at, id: candidate.id, questionnaireVersion: candidate.questionnaire_version }));
    const counts = countMatches(response, candidates);
    const computedAt = new Date().toISOString();
    const snapshot: ResultSnapshot = {
      response_id: response.id,
      response_revision: response.revision,
      algorithm_version: MATCHING_VERSION,
      population_count: counts.populationCount,
      preferred_count: counts.preferredCount,
      mutual_count: counts.mutualCount,
      same_gender_population_count: counts.sameGenderPopulationCount,
      same_gender_personality_count: counts.sameGenderPersonalityCount,
      same_gender_hobby_count: counts.sameGenderHobbyCount,
      opposite_gender_personality_count: counts.oppositeGenderPersonalityCount,
      opposite_gender_hobby_count: counts.oppositeGenderHobbyCount,
      computed_at: computedAt,
      cache_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    this.state.snapshots.set(response.id, snapshot);
    return { response, snapshot: structuredClone(snapshot) };
  }

  async deleteResponse(ownerHash: string): Promise<boolean> {
    const response = this.state.responses.get(ownerHash);
    if (!response) return false;
    this.state.responses.delete(ownerHash);
    this.state.snapshots.delete(response.id);
    return true;
  }

  async insertAnalytics(event: AnalyticsEventInput): Promise<void> {
    this.state.events.set(event.eventId, { event, createdAt: new Date().toISOString() });
  }

  async cleanupExpired(): Promise<{ responses: number; events: number }> {
    const now = Date.now();
    let responseCount = 0;
    let eventCount = 0;
    for (const [hash, response] of this.state.responses) {
      if (Date.parse(response.expires_at) <= now) {
        this.state.responses.delete(hash);
        this.state.snapshots.delete(response.id);
        responseCount += 1;
      }
    }
    for (const [id, event] of this.state.events) {
      if (Date.now() - Date.parse(event.createdAt) > 30 * 24 * 60 * 60 * 1000) {
        this.state.events.delete(id);
        eventCount += 1;
      }
    }
    return { responses: responseCount, events: eventCount };
  }
}

let singleton: DataStore | undefined;

export function getDataStore(): DataStore {
  if (process.env.NODE_ENV === "production" && process.env.TEST_STORAGE_DRIVER) {
    throw new StoreError("테스트 저장소는 운영 환경에서 사용할 수 없어요.", "UNSAFE_CONFIGURATION");
  }
  if (process.env.TEST_STORAGE_DRIVER === "memory") return new TestMemoryStore();
  singleton ??= new SupabaseStore();
  return singleton;
}

export function resetMemoryStoreForTests(): void {
  if (process.env.TEST_STORAGE_DRIVER !== "memory" || process.env.NODE_ENV === "production") {
    throw new StoreError("테스트 저장소를 초기화할 수 없는 환경이에요.", "UNSAFE_CONFIGURATION");
  }
  globalThis.__tasteIntersectionTestState = undefined;
}
