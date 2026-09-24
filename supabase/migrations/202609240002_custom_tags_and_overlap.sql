-- Apply after 202609240001_initial_schema.sql. Cached result rows contain no user answers.

create or replace function public.is_valid_tag_array(
  input_values text[], preset_values text[], minimum_count integer, maximum_count integer
)
returns boolean language sql immutable set search_path = ''
as $$
  select input_values is not null
    and cardinality(input_values) between minimum_count and maximum_count
    and public.is_unique_text_array(input_values)
    and not exists (
      select 1 from unnest(input_values) as item(tag)
      where item.tag is null or not (
        item.tag = any(preset_values)
        or (
          item.tag ~ '^custom:[가-힣ㄱ-ㅎㅏ-ㅣa-z0-9][가-힣ㄱ-ㅎㅏ-ㅣa-z0-9 .·&+_-]{0,19}$'
          and item.tag = btrim(item.tag)
          and item.tag !~ '  '
        )
      )
    )
$$;

-- The first migration used unnamed preset-only CHECK constraints. Their generated
-- names vary with existing schema state, so locate only those containing <@.
do $$
declare old_constraint record;
begin
  for old_constraint in
    select conname from pg_constraint
    where conrelid = 'public.responses'::regclass
      and contype = 'c'
      and position('<@' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.responses drop constraint %I', old_constraint.conname);
  end loop;
end;
$$;

alter table public.responses
  add constraint responses_personality_tags_check check (
    public.is_valid_tag_array(personality,
      array['warm','calm','outgoing','humorous','honest','organized','spontaneous','independent']::text[], 1, 3)
  ),
  add constraint responses_hobby_tags_check check (
    public.is_valid_tag_array(hobbies,
      array['screen','music','exercise','gaming','reading','travel','food_cafe','arts','making','outdoors']::text[], 0, 3)
  ),
  add constraint responses_preferred_personality_tags_check check (
    public.is_valid_tag_array(preferred_personality,
      array['warm','calm','outgoing','humorous','honest','organized','spontaneous','independent']::text[], 0, 3)
  );

alter table public.result_snapshots
  add column same_gender_population_count bigint not null default 0,
  add column same_gender_personality_count bigint not null default 0,
  add column same_gender_hobby_count bigint not null default 0,
  add column opposite_gender_personality_count bigint not null default 0,
  add column opposite_gender_hobby_count bigint not null default 0,
  add constraint result_snapshots_overlap_counts_check check (
    same_gender_population_count >= 0
    and same_gender_personality_count between 0 and same_gender_population_count
    and same_gender_hobby_count between 0 and same_gender_population_count
    and opposite_gender_personality_count between 0 and population_count
    and opposite_gender_hobby_count between 0 and population_count
  );

-- Force all existing snapshots to be recomputed with the new overlap fields.
delete from public.result_snapshots;

drop function public.calculate_user_result(uuid, text);

create function public.calculate_user_result(p_response_id uuid, p_algorithm_version text, p_force boolean)
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
  if not p_force and found and snapshot.response_revision = subject.revision
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
      candidate.gender = subject.gender as same_gender,
      subject.personality && candidate.personality as personality_overlap,
      cardinality(subject.hobbies) > 0 and subject.hobbies && candidate.hobbies as hobby_overlap,
      case when candidate.gender <> subject.gender then public.score_direction_v1(subject, candidate) end as forward_score,
      case when candidate.gender <> subject.gender then public.score_direction_v1(candidate, subject) end as reverse_score
    from public.responses candidate
    where candidate.id <> subject.id
      and candidate.questionnaire_version = subject.questionnaire_version
      and candidate.expires_at > now_at
  )
  select
    count(*) filter (where not same_gender)::bigint as population_count,
    count(*) filter (where not same_gender and forward_score >= 70)::bigint as preferred_count,
    count(*) filter (where not same_gender and forward_score >= 70 and reverse_score >= 70)::bigint as mutual_count,
    count(*) filter (where same_gender)::bigint as same_gender_population_count,
    count(*) filter (where same_gender and personality_overlap)::bigint as same_gender_personality_count,
    count(*) filter (where same_gender and hobby_overlap)::bigint as same_gender_hobby_count,
    count(*) filter (where not same_gender and personality_overlap)::bigint as opposite_gender_personality_count,
    count(*) filter (where not same_gender and hobby_overlap)::bigint as opposite_gender_hobby_count
  into counts from candidates;

  insert into public.result_snapshots (
    response_id, response_revision, algorithm_version, population_count,
    preferred_count, mutual_count, same_gender_population_count,
    same_gender_personality_count, same_gender_hobby_count,
    opposite_gender_personality_count, opposite_gender_hobby_count,
    computed_at, cache_expires_at
  ) values (
    subject.id, subject.revision, p_algorithm_version, counts.population_count,
    counts.preferred_count, counts.mutual_count, counts.same_gender_population_count,
    counts.same_gender_personality_count, counts.same_gender_hobby_count,
    counts.opposite_gender_personality_count, counts.opposite_gender_hobby_count,
    now_at, now_at + interval '10 minutes'
  ) on conflict (response_id) do update set
    response_revision = excluded.response_revision,
    algorithm_version = excluded.algorithm_version,
    population_count = excluded.population_count,
    preferred_count = excluded.preferred_count,
    mutual_count = excluded.mutual_count,
    same_gender_population_count = excluded.same_gender_population_count,
    same_gender_personality_count = excluded.same_gender_personality_count,
    same_gender_hobby_count = excluded.same_gender_hobby_count,
    opposite_gender_personality_count = excluded.opposite_gender_personality_count,
    opposite_gender_hobby_count = excluded.opposite_gender_hobby_count,
    computed_at = excluded.computed_at,
    cache_expires_at = excluded.cache_expires_at
  returning * into snapshot;
  return snapshot;
end;
$$;

revoke all on function public.is_valid_tag_array(text[], text[], integer, integer) from public, anon, authenticated;
grant execute on function public.is_valid_tag_array(text[], text[], integer, integer) to service_role;
revoke all on function public.calculate_user_result(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.calculate_user_result(uuid, text, boolean) to service_role;
