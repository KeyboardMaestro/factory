-- Initial schema for 나와 맞는 사람 찾아보기. Apply before 202609240002_custom_tags_and_overlap.sql.
create or replace function public.is_unique_text_array(input_values text[])
returns boolean language sql immutable set search_path = ''
as $$ select cardinality(input_values) = cardinality(array(select distinct unnest(input_values))) $$;

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  owner_token_hash text not null unique check (owner_token_hash ~ '^[0-9a-f]{64}$'),
  gender text not null check (gender in ('male', 'female')),
  age smallint not null check (age between 19 and 99),
  appearance_self smallint not null check (appearance_self between 1 and 3),
  body_self smallint not null check (body_self between 1 and 3),
  financial_self smallint not null check (financial_self between 1 and 3),
  personality text[] not null check (
    cardinality(personality) between 1 and 3 and
    personality <@ array['warm','calm','outgoing','humorous','honest','organized','spontaneous','independent']::text[] and
    public.is_unique_text_array(personality)
  ),
  hobbies text[] not null default '{}',
  appearance_weight smallint not null check (appearance_weight between 0 and 2),
  body_weight smallint not null check (body_weight between 0 and 2),
  financial_weight smallint not null check (financial_weight between 0 and 2),
  personality_weight smallint not null check (personality_weight between 0 and 2),
  hobby_weight smallint not null check (hobby_weight between 0 and 2),
  preferred_personality text[] not null default '{}',
  preferred_age_min smallint,
  preferred_age_max smallint,
  questionnaire_version smallint not null default 1 check (questionnaire_version = 1),
  revision integer not null default 1 check (revision > 0),
  consent_version text not null check (length(consent_version) between 1 and 80),
  consented_at timestamptz not null,
  last_submission_id uuid not null,
  last_submission_hash text not null check (last_submission_hash ~ '^[0-9a-f]{64}$'),
  submission_window_started_at timestamptz not null,
  submission_count smallint not null check (submission_count between 1 and 3),
  last_compute_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (cardinality(hobbies) <= 3),
  check (hobbies <@ array['screen','music','exercise','gaming','reading','travel','food_cafe','arts','making','outdoors']::text[]),
  check (public.is_unique_text_array(hobbies)),
  check (cardinality(preferred_personality) <= 3),
  check (preferred_personality <@ array['warm','calm','outgoing','humorous','honest','organized','spontaneous','independent']::text[]),
  check (public.is_unique_text_array(preferred_personality)),
  check ((hobby_weight = 0) or cardinality(hobbies) > 0),
  check ((personality_weight = 0 and cardinality(preferred_personality) = 0) or (personality_weight > 0 and cardinality(preferred_personality) > 0)),
  check ((preferred_age_min is null and preferred_age_max is null) or
         (preferred_age_min between 19 and 99 and preferred_age_max between 19 and 99 and preferred_age_min <= preferred_age_max)),
  check (expires_at = created_at + interval '90 days')
);

create index if not exists responses_cohort_expiry_idx
  on public.responses (gender, questionnaire_version, expires_at);
create index if not exists responses_expiry_idx on public.responses (expires_at);

create table if not exists public.result_snapshots (
  response_id uuid primary key references public.responses(id) on delete cascade,
  response_revision integer not null check (response_revision > 0),
  algorithm_version text not null check (algorithm_version = 'matching-v1'),
  population_count bigint not null check (population_count >= 0),
  preferred_count bigint not null check (preferred_count >= 0),
  mutual_count bigint not null check (mutual_count >= 0),
  computed_at timestamptz not null default now(),
  cache_expires_at timestamptz not null,
  check (mutual_count <= preferred_count and preferred_count <= population_count)
);

create table if not exists public.analytics_events (
  event_id uuid primary key,
  flow_id uuid not null,
  event_name text not null check (event_name in (
    'landing_view','test_start','question_progress','test_complete','result_view','share_click',
    'submit_error','result_error','share_outcome'
  )),
  occurred_at timestamptz not null default now(),
  step_id smallint check (step_id between 1 and 7),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  check (not (properties ?| array[
    'response','response_id','owner_token_hash','age','gender','personality','hobbies',
    'appearance_self','body_self','financial_self','mutual_count','preferred_count','population_count','url','ip','user_agent'
  ]))
);
create index if not exists analytics_events_time_idx on public.analytics_events (occurred_at);

alter table public.responses enable row level security;
alter table public.result_snapshots enable row level security;
alter table public.analytics_events enable row level security;

revoke all on public.responses, public.result_snapshots, public.analytics_events from public, anon, authenticated;
grant select, insert, update, delete on public.responses, public.result_snapshots, public.analytics_events to service_role;

create or replace function public.score_direction_v1(a public.responses, b public.responses)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  weighted_total numeric := 0;
  total_weight integer := 0;
  item_score numeric;
begin
  if a.preferred_age_min is not null and b.age not between a.preferred_age_min and a.preferred_age_max then
    return 0;
  end if;

  if a.appearance_weight > 0 then
    item_score := case b.appearance_self when 1 then 40 when 2 then 70 else 100 end;
    weighted_total := weighted_total + a.appearance_weight * item_score;
    total_weight := total_weight + a.appearance_weight;
  end if;
  if a.body_weight > 0 then
    item_score := case b.body_self when 1 then 40 when 2 then 70 else 100 end;
    weighted_total := weighted_total + a.body_weight * item_score;
    total_weight := total_weight + a.body_weight;
  end if;
  if a.financial_weight > 0 then
    item_score := case b.financial_self when 1 then 40 when 2 then 70 else 100 end;
    weighted_total := weighted_total + a.financial_weight * item_score;
    total_weight := total_weight + a.financial_weight;
  end if;
  if a.personality_weight > 0 then
    select 100.0 * count(*) / cardinality(a.preferred_personality)
      into item_score
      from unnest(a.preferred_personality) as preferences(tag)
      where preferences.tag = any(b.personality);
    weighted_total := weighted_total + a.personality_weight * coalesce(item_score, 0);
    total_weight := total_weight + a.personality_weight;
  end if;
  if a.hobby_weight > 0 then
    select 100.0 * count(*) / cardinality(a.hobbies)
      into item_score
      from unnest(a.hobbies) as preferences(tag)
      where preferences.tag = any(b.hobbies);
    weighted_total := weighted_total + a.hobby_weight * coalesce(item_score, 0);
    total_weight := total_weight + a.hobby_weight;
  end if;

  if total_weight = 0 then return 100; end if;
  return weighted_total / total_weight;
end;
$$;

create or replace function public.save_response(
  p_owner_token_hash text,
  p_response jsonb,
  p_expected_revision integer,
  p_submission_id uuid,
  p_submission_hash text,
  p_consent_version text
)
returns public.responses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_row public.responses;
  saved_row public.responses;
  current_time timestamptz := now();
  next_window timestamptz;
  next_count smallint;
begin
  if p_owner_token_hash !~ '^[0-9a-f]{64}$' or p_submission_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_OWNER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_token_hash, 0));
  select * into current_row from public.responses where owner_token_hash = p_owner_token_hash for update;

  if found and current_row.last_submission_id = p_submission_id then
    if current_row.last_submission_hash <> p_submission_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return current_row;
  end if;

  if found then
    if p_expected_revision is null or p_expected_revision <> current_row.revision then
      raise exception using errcode = 'P0001', message = 'REVISION_CONFLICT';
    end if;
    if current_row.expires_at <= current_time then
      raise exception using errcode = 'P0001', message = 'RESPONSE_EXPIRED';
    end if;
    if current_time - current_row.submission_window_started_at >= interval '24 hours' then
      next_window := current_time;
      next_count := 1;
    elsif current_row.submission_count >= 3 then
      raise exception using errcode = 'P0001', message = 'SUBMISSION_LIMIT';
    else
      next_window := current_row.submission_window_started_at;
      next_count := current_row.submission_count + 1;
    end if;

    update public.responses set
      gender = p_response->>'gender',
      age = (p_response->>'age')::smallint,
      appearance_self = (p_response->>'appearance_self')::smallint,
      body_self = (p_response->>'body_self')::smallint,
      financial_self = (p_response->>'financial_self')::smallint,
      personality = array(select jsonb_array_elements_text(p_response->'personality')),
      hobbies = array(select jsonb_array_elements_text(p_response->'hobbies')),
      appearance_weight = (p_response->>'appearance_weight')::smallint,
      body_weight = (p_response->>'body_weight')::smallint,
      financial_weight = (p_response->>'financial_weight')::smallint,
      personality_weight = (p_response->>'personality_weight')::smallint,
      hobby_weight = (p_response->>'hobby_weight')::smallint,
      preferred_personality = array(select jsonb_array_elements_text(p_response->'preferred_personality')),
      preferred_age_min = nullif(p_response->>'preferred_age_min', '')::smallint,
      preferred_age_max = nullif(p_response->>'preferred_age_max', '')::smallint,
      revision = current_row.revision + 1,
      consent_version = p_consent_version,
      consented_at = case when current_row.consent_version <> p_consent_version then current_time else current_row.consented_at end,
      last_submission_id = p_submission_id,
      last_submission_hash = p_submission_hash,
      submission_window_started_at = next_window,
      submission_count = next_count,
      last_compute_attempt_at = null,
      updated_at = current_time
    where id = current_row.id returning * into saved_row;
  else
    if p_expected_revision is not null then
      raise exception using errcode = 'P0001', message = 'REVISION_CONFLICT';
    end if;
    insert into public.responses (
      owner_token_hash, gender, age, appearance_self, body_self, financial_self,
      personality, hobbies, appearance_weight, body_weight, financial_weight,
      personality_weight, hobby_weight, preferred_personality, preferred_age_min,
      preferred_age_max, consent_version, consented_at, last_submission_id,
      last_submission_hash, submission_window_started_at, submission_count,
      created_at, updated_at, expires_at
    ) values (
      p_owner_token_hash, p_response->>'gender', (p_response->>'age')::smallint,
      (p_response->>'appearance_self')::smallint, (p_response->>'body_self')::smallint,
      (p_response->>'financial_self')::smallint,
      array(select jsonb_array_elements_text(p_response->'personality')),
      array(select jsonb_array_elements_text(p_response->'hobbies')),
      (p_response->>'appearance_weight')::smallint, (p_response->>'body_weight')::smallint,
      (p_response->>'financial_weight')::smallint, (p_response->>'personality_weight')::smallint,
      (p_response->>'hobby_weight')::smallint,
      array(select jsonb_array_elements_text(p_response->'preferred_personality')),
      nullif(p_response->>'preferred_age_min', '')::smallint,
      nullif(p_response->>'preferred_age_max', '')::smallint,
      p_consent_version, current_time, p_submission_id, p_submission_hash,
      current_time, 1, current_time, current_time, current_time + interval '90 days'
    ) returning * into saved_row;
  end if;

  delete from public.result_snapshots where response_id = saved_row.id;
  return saved_row;
end;
$$;

create or replace function public.calculate_user_result(p_response_id uuid, p_algorithm_version text)
returns public.result_snapshots
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subject public.responses;
  snapshot public.result_snapshots;
  counts record;
  now_at timestamptz := now();
begin
  if p_algorithm_version <> 'matching-v1' then
    raise exception using errcode = '22023', message = 'ALGORITHM_VERSION_UNSUPPORTED';
  end if;
  select * into subject from public.responses where id = p_response_id for update;
  if not found or subject.expires_at <= now_at then
    raise exception using errcode = 'P0001', message = 'RESPONSE_NOT_FOUND';
  end if;

  select * into snapshot from public.result_snapshots where response_id = subject.id;
  if found and snapshot.response_revision = subject.revision
    and snapshot.algorithm_version = p_algorithm_version and snapshot.cache_expires_at > now_at then
    return snapshot;
  end if;
  if subject.last_compute_attempt_at is not null
    and subject.last_compute_attempt_at > now_at - interval '10 seconds' then
    raise exception using errcode = 'P0001', message = 'CALCULATION_RATE_LIMIT';
  end if;
  update public.responses set last_compute_attempt_at = now_at where id = subject.id;

  with candidates as materialized (
    select
      public.score_direction_v1(subject, candidate) as forward_score,
      public.score_direction_v1(candidate, subject) as reverse_score
    from public.responses candidate
    where candidate.gender <> subject.gender
      and candidate.id <> subject.id
      and candidate.questionnaire_version = subject.questionnaire_version
      and candidate.expires_at > now_at
  )
  select count(*)::bigint as population_count,
    count(*) filter (where forward_score >= 70)::bigint as preferred_count,
    count(*) filter (where forward_score >= 70 and reverse_score >= 70)::bigint as mutual_count
  into counts from candidates;

  insert into public.result_snapshots (
    response_id, response_revision, algorithm_version, population_count,
    preferred_count, mutual_count, computed_at, cache_expires_at
  ) values (
    subject.id, subject.revision, p_algorithm_version, counts.population_count,
    counts.preferred_count, counts.mutual_count, now_at, now_at + interval '10 minutes'
  ) on conflict (response_id) do update set
    response_revision = excluded.response_revision,
    algorithm_version = excluded.algorithm_version,
    population_count = excluded.population_count,
    preferred_count = excluded.preferred_count,
    mutual_count = excluded.mutual_count,
    computed_at = excluded.computed_at,
    cache_expires_at = excluded.cache_expires_at
  returning * into snapshot;
  return snapshot;
end;
$$;

create or replace function public.cleanup_expired_data()
returns table (deleted_responses bigint, deleted_events bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.responses where expires_at <= now();
  get diagnostics deleted_responses = row_count;
  delete from public.analytics_events where occurred_at < now() - interval '30 days';
  get diagnostics deleted_events = row_count;
  return next;
end;
$$;

revoke all on function public.score_direction_v1(public.responses, public.responses) from public, anon, authenticated;
revoke all on function public.is_unique_text_array(text[]) from public, anon, authenticated;
revoke all on function public.save_response(text, jsonb, integer, uuid, text, text) from public, anon, authenticated;
revoke all on function public.calculate_user_result(uuid, text) from public, anon, authenticated;
revoke all on function public.cleanup_expired_data() from public, anon, authenticated;
grant execute on function public.save_response(text, jsonb, integer, uuid, text, text) to service_role;
grant execute on function public.calculate_user_result(uuid, text) to service_role;
grant execute on function public.cleanup_expired_data() to service_role;
grant execute on function public.score_direction_v1(public.responses, public.responses) to service_role;
grant execute on function public.is_unique_text_array(text[]) to service_role;
