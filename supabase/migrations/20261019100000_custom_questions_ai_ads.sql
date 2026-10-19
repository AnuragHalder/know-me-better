-- Phase 5b: questions in the creator's own words, AI-written questions, and the
-- "watch an ad to unlock" credit used for AI generation.
--
--  * A quiz item can be a bank question (optionally with edited wording/options),
--    or a fully custom / AI-written question. Every item has exactly 4 options.
--  * AI generation is Pro, or unlocked one at a time by a completed ad.
--    The server (with the user's own session) claims a credit before calling the
--    AI provider and marks it finished afterwards; a failed generation returns
--    the credit.

-- ---------------------------------------------------------------------------
-- Quiz items keep their own wording and where they came from.
-- ---------------------------------------------------------------------------
alter table public.quiz_questions
  add column prompt_self text check (prompt_self is null or char_length(prompt_self) <= 140),
  add column source text not null default 'bank'
    check (source in ('bank', 'edited', 'custom', 'ai'));

-- Validate and normalise the 10 items sent by create_quiz / update_quiz.
-- Each item is one of:
--   {"question_id": "chai", "correct_option": 1}                       bank question
--   {"question_id": "chai", "correct_option": 1,
--    "prompt_other": "...{name}...", "options": ["a","b","c","d"]}    bank question, edited
--   {"source": "ai" | "custom", "correct_option": 2,
--    "prompt_self": "My ...?", "prompt_other": "{name}'s ...?",
--    "options": ["a","b","c","d"]}                                    own question
create function public.quiz_items_checked(p_items jsonb)
returns table (
  item_pos smallint,
  question_id text,
  prompt_self text,
  prompt_other text,
  options text[],
  correct_option smallint,
  source text
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  e jsonb;
  i int := 0;
  q public.questions%rowtype;
  v_seen text[] := '{}';
  v_opts text[];
  v_other text;
  v_self text;
  v_src text;
  v_correct smallint;
  v_qid text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) <> 10 then
    raise exception 'need_10_questions' using errcode = '22023';
  end if;

  for e in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e) is distinct from 'object' then
      raise exception 'invalid_questions' using errcode = '22023';
    end if;

    v_correct := case
      when jsonb_typeof(e -> 'correct_option') = 'number' then (e ->> 'correct_option')::smallint
    end;
    v_qid := nullif(btrim(e ->> 'question_id'), '');

    if jsonb_typeof(e -> 'options') = 'array' then
      v_opts := array(select btrim(x) from jsonb_array_elements_text(e -> 'options') as x);
    else
      v_opts := null;
    end if;

    if v_qid is not null then
      select * into q from public.questions qs where qs.id = v_qid and qs.active;
      if not found or v_qid = any (v_seen) then
        raise exception 'invalid_questions' using errcode = '22023';
      end if;
      v_seen := v_seen || v_qid;
      v_other := coalesce(nullif(btrim(e ->> 'prompt_other'), ''), q.prompt_other);
      v_opts := coalesce(v_opts, q.options);
      v_self := case
        when v_other = q.prompt_other then q.prompt_self
        else nullif(btrim(e ->> 'prompt_self'), '')
      end;
      v_src := case when v_other = q.prompt_other and v_opts = q.options then 'bank' else 'edited' end;
    else
      v_other := nullif(btrim(e ->> 'prompt_other'), '');
      v_self := nullif(btrim(e ->> 'prompt_self'), '');
      v_src := case when e ->> 'source' = 'ai' then 'ai' else 'custom' end;
      if v_other is null or v_opts is null then
        raise exception 'invalid_questions' using errcode = '22023';
      end if;
    end if;

    if char_length(v_other) not between 3 and 140
       or (v_self is not null and char_length(v_self) > 140) then
      raise exception 'invalid_text' using errcode = '22023';
    end if;

    if coalesce(array_length(v_opts, 1), 0) <> 4
       or exists (select 1 from unnest(v_opts) as o where char_length(o) not between 1 and 60)
       or (select count(distinct lower(o)) from unnest(v_opts) as o) <> 4 then
      raise exception 'invalid_options' using errcode = '22023';
    end if;

    if v_correct is null or v_correct not between 0 and 3 then
      raise exception 'invalid_questions' using errcode = '22023';
    end if;

    item_pos := i::smallint;
    question_id := v_qid;
    prompt_self := v_self;
    prompt_other := v_other;
    options := v_opts;
    correct_option := v_correct;
    source := v_src;
    return next;
    i := i + 1;
  end loop;
end;
$$;

-- create_quiz and update_quiz now accept edited and own questions.
create or replace function public.create_quiz(p_owner_name text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_owner_name);
  v_quiz_id uuid;
  v_code text;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 24 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  -- Validate first (raises on any bad item; the whole call is then undone).
  perform count(*) from public.quiz_items_checked(p_items);

  v_code := public.new_quiz_code();

  insert into public.quizzes (owner_id, code, owner_name)
  values (v_uid, v_code, v_name)
  returning id into v_quiz_id;

  insert into public.quiz_questions
    (quiz_id, position, question_id, prompt, prompt_self, options, correct_option, source)
  select v_quiz_id, c.item_pos, c.question_id, c.prompt_other, c.prompt_self, c.options,
         c.correct_option, c.source
  from public.quiz_items_checked(p_items) c;

  return jsonb_build_object('id', v_quiz_id, 'code', v_code);
end;
$$;

create or replace function public.update_quiz(p_quiz_id uuid, p_owner_name text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_owner_name);
  v_quiz public.quizzes%rowtype;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz_id and owner_id = v_uid for update;
  if not found then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.attempts where quiz_id = p_quiz_id) then
    raise exception 'quiz_has_plays' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 24 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  perform count(*) from public.quiz_items_checked(p_items);

  update public.quizzes set owner_name = v_name where id = v_quiz.id;
  delete from public.quiz_questions where quiz_id = v_quiz.id;

  insert into public.quiz_questions
    (quiz_id, position, question_id, prompt, prompt_self, options, correct_option, source)
  select v_quiz.id, c.item_pos, c.question_id, c.prompt_other, c.prompt_self, c.options,
         c.correct_option, c.source
  from public.quiz_items_checked(p_items) c;

  return jsonb_build_object('id', v_quiz.id, 'code', v_quiz.code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ads that unlock one AI generation each, and the AI usage log.
-- Limits: 3 ad unlocks per person per day; Pro capped at 20 generations a day
-- (abuse guard). Days run on Indian time.
-- ---------------------------------------------------------------------------
create table public.ad_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  consumed_at timestamptz
);

create index ad_sessions_user_idx on public.ad_sessions (user_id, started_at);

alter table public.ad_sessions enable row level security;
create policy "Read own ad sessions" on public.ad_sessions
  for select to authenticated using (user_id = auth.uid());

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topics text not null check (char_length(topics) between 1 and 200),
  via text not null check (via in ('pro', 'ad')),
  ad_session_id uuid references public.ad_sessions (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'ok', 'failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index ai_generations_user_idx on public.ai_generations (user_id, created_at);

alter table public.ai_generations enable row level security;
create policy "Read own AI generations" on public.ai_generations
  for select to authenticated using (user_id = auth.uid());

revoke all on public.ad_sessions, public.ai_generations from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.ad_sessions, public.ai_generations from authenticated;

create function public.is_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.purchases p
    where p.user_id = p_user
      and p.status = 'paid'
      and p.product in ('pro_monthly', 'pro_yearly')
      and coalesce(p.expires_at, 'infinity') > now()
  );
$$;

create function public.ist_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create function public.require_creator()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

-- Where the caller stands today: Pro?, unused ad credits, ads left.
create function public.ai_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_creator();
  v_today date := public.ist_today();
  v_ads_done int;
  v_credits int;
begin
  select count(*) filter (where completed_at is not null),
         count(*) filter (where completed_at is not null and consumed_at is null)
  into v_ads_done, v_credits
  from public.ad_sessions
  where user_id = v_uid and (started_at at time zone 'Asia/Kolkata')::date = v_today;

  return jsonb_build_object(
    'pro', public.is_pro(v_uid),
    'credits', v_credits,
    'ads_left', greatest(0, 3 - v_ads_done)
  );
end;
$$;

-- Start watching an ad. Returns {id, seconds}.
create function public.start_ad_session()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_creator();
  v_today date := public.ist_today();
  v_id uuid;
begin
  if (select count(*) from public.ad_sessions
      where user_id = v_uid and completed_at is not null
        and (started_at at time zone 'Asia/Kolkata')::date = v_today) >= 3 then
    raise exception 'ad_limit' using errcode = '22023';
  end if;

  -- Reuse an unfinished ad from the last two minutes instead of piling them up.
  select id into v_id from public.ad_sessions
  where user_id = v_uid and completed_at is null and started_at > now() - interval '2 minutes'
  order by started_at desc limit 1;

  if v_id is null then
    insert into public.ad_sessions (user_id) values (v_uid) returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id, 'seconds', 15);
end;
$$;

-- Finish an ad. Only counts if at least 15 seconds passed since it started.
create function public.complete_ad_session(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_creator();
  v_row public.ad_sessions%rowtype;
begin
  select * into v_row from public.ad_sessions where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception 'ad_not_found' using errcode = 'P0002';
  end if;
  if v_row.completed_at is null then
    if now() - v_row.started_at < interval '14 seconds' then
      raise exception 'ad_too_short' using errcode = '22023';
    end if;
    update public.ad_sessions set completed_at = now() where id = p_id;
  end if;
  return public.ai_status();
end;
$$;

-- Use one AI generation: Pro, or one completed unused ad. Returns
-- {allowed: true, id, via} or {allowed: false, reason: 'needs_unlock' | 'daily_limit', ...}.
create function public.claim_ai_generation(p_topics text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_creator();
  v_today date := public.ist_today();
  v_topics text := btrim(p_topics);
  v_ad uuid;
  v_id uuid;
begin
  if v_topics is null or char_length(v_topics) not between 1 and 200 then
    raise exception 'invalid_topics' using errcode = '22023';
  end if;

  if public.is_pro(v_uid) then
    if (select count(*) from public.ai_generations
        where user_id = v_uid and status <> 'failed'
          and (created_at at time zone 'Asia/Kolkata')::date = v_today) >= 20 then
      return jsonb_build_object('allowed', false, 'reason', 'daily_limit');
    end if;
    insert into public.ai_generations (user_id, topics, via)
    values (v_uid, v_topics, 'pro') returning id into v_id;
    return jsonb_build_object('allowed', true, 'id', v_id, 'via', 'pro');
  end if;

  select id into v_ad from public.ad_sessions
  where user_id = v_uid and completed_at is not null and consumed_at is null
    and (started_at at time zone 'Asia/Kolkata')::date = v_today
  order by completed_at
  limit 1
  for update skip locked;

  if v_ad is null then
    return public.ai_status() || jsonb_build_object('allowed', false, 'reason', 'needs_unlock');
  end if;

  update public.ad_sessions set consumed_at = now() where id = v_ad;
  insert into public.ai_generations (user_id, topics, via, ad_session_id)
  values (v_uid, v_topics, 'ad', v_ad) returning id into v_id;
  return jsonb_build_object('allowed', true, 'id', v_id, 'via', 'ad');
end;
$$;

-- Record how a generation ended. A failure gives the ad credit back.
create function public.finish_ai_generation(p_id uuid, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_creator();
  v_row public.ai_generations%rowtype;
begin
  select * into v_row from public.ai_generations
  where id = p_id and user_id = v_uid and status = 'pending'
  for update;
  if not found then
    return;
  end if;
  update public.ai_generations
  set status = case when p_ok then 'ok' else 'failed' end, finished_at = now()
  where id = p_id;
  if not p_ok and v_row.ad_session_id is not null then
    update public.ad_sessions set consumed_at = null where id = v_row.ad_session_id;
  end if;
end;
$$;

revoke execute on function
  public.quiz_items_checked(jsonb),
  public.is_pro(uuid),
  public.ist_today(),
  public.require_creator(),
  public.ai_status(),
  public.start_ad_session(),
  public.complete_ad_session(uuid),
  public.claim_ai_generation(text),
  public.finish_ai_generation(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.ai_status(),
  public.start_ad_session(),
  public.complete_ad_session(uuid),
  public.claim_ai_generation(text),
  public.finish_ai_generation(uuid, boolean)
to authenticated;
