-- Map questions ("Pin it"): the creator answers with a place, friends drop a pin
-- and are scored by distance. The place stays on the server; friends see only how
-- far off they were until they have no retries left (or choose to give their retry
-- up to see it). The creator sees a map of friends' guesses.
--
-- Right = within 100 km (India map) or 500 km (world map). Must match RIGHT_KM in
-- src/lib/map/geo.ts.

-- ---------------------------------------------------------------------------
-- Bank and quiz questions carry a kind; map questions keep their answer here.
-- ---------------------------------------------------------------------------
alter table public.questions
  add column kind text not null default 'choice' check (kind in ('choice', 'pin')),
  add column map_scope text check (map_scope in ('india', 'world')),
  add constraint questions_pin_scope check (kind = 'choice' or map_scope is not null);

alter table public.quiz_questions
  add column kind text not null default 'choice' check (kind in ('choice', 'pin')),
  add column map_scope text check (map_scope in ('india', 'world')),
  add column answer_lat double precision check (answer_lat between -90 and 90),
  add column answer_lng double precision check (answer_lng between -180 and 180),
  add column answer_label text check (char_length(answer_label) between 1 and 60),
  add constraint quiz_questions_pin_answer check (
    kind = 'choice'
    or (map_scope is not null and answer_lat is not null and answer_lng is not null
        and answer_label is not null)
  );

-- Map questions in the bank. Options are empty: the answer is a place.
insert into public.questions (id, prompt_self, prompt_other, options, topic, kind, map_scope, sort) values
  ('map_born', 'Where was I born?', 'Where was {name} born?', '{}', 'life', 'pin', 'india', 300),
  ('map_grew_up', 'Where did I grow up?', 'Where did {name} grow up?', '{}', 'life', 'pin', 'india', 301),
  ('map_college', 'Where did I go to college?', 'Where did {name} go to college?', '{}', 'nostalgia', 'pin', 'india', 302),
  ('map_weekend', 'My go-to weekend getaway', '{name}''s go-to weekend getaway', '{}', 'travel', 'pin', 'india', 303),
  ('map_move', 'If I could move anywhere in India…', 'If {name} could move anywhere in India…', '{}', 'travel', 'pin', 'india', 304),
  ('map_best_trip', 'The best trip I''ve ever taken', 'The best trip {name} has ever taken', '{}', 'travel', 'pin', 'world', 305),
  ('map_dream', 'My dream destination', '{name}''s dream destination', '{}', 'travel', 'pin', 'world', 306),
  ('map_honeymoon', 'My dream honeymoon spot', '{name}''s dream honeymoon spot', '{}', 'love', 'pin', 'world', 307)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Friends' pins, and a friend's choice to see the answers (which ends retries).
-- ---------------------------------------------------------------------------
create table public.attempt_pins (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  position smallint not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  distance_km real not null check (distance_km >= 0),
  primary key (attempt_id, position)
);
alter table public.attempt_pins enable row level security;
revoke all on public.attempt_pins from anon, authenticated;

alter table public.attempts add column revealed_at timestamptz;

-- Great-circle distance in km.
create function public.distance_km(lat1 double precision, lng1 double precision,
                                   lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371 * asin(least(1, sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  )));
$$;

create function public.pin_right_km(p_scope text)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case when p_scope = 'world' then 500 else 100 end::double precision;
$$;

-- ---------------------------------------------------------------------------
-- Item validation, now with map questions. Changing the returned columns needs a
-- drop; create_quiz and update_quiz are recreated below to insert them.
-- Map item: {"question_id": "map_born", "lat": 22.57, "lng": 88.36, "label": "Kolkata"}
-- At most 2 map questions per quiz. Coordinates are rounded to 0.01° (~1 km).
-- ---------------------------------------------------------------------------
drop function public.quiz_items_checked(jsonb);

create function public.quiz_items_checked(p_items jsonb)
returns table (
  item_pos smallint,
  question_id text,
  prompt_self text,
  prompt_other text,
  options text[],
  correct_option smallint,
  source text,
  kind text,
  map_scope text,
  answer_lat double precision,
  answer_lng double precision,
  answer_label text
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  e jsonb;
  i int := 0;
  pins int := 0;
  q public.questions%rowtype;
  v_seen text[] := '{}';
  v_opts text[];
  v_other text;
  v_self text;
  v_src text;
  v_correct smallint;
  v_qid text;
  v_lat double precision;
  v_lng double precision;
  v_label text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) <> 10 then
    raise exception 'need_10_questions' using errcode = '22023';
  end if;

  for e in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e) is distinct from 'object' then
      raise exception 'invalid_questions' using errcode = '22023';
    end if;

    v_qid := nullif(btrim(e ->> 'question_id'), '');
    q := null;
    if v_qid is not null then
      select * into q from public.questions qs where qs.id = v_qid and qs.active;
      if not found or v_qid = any (v_seen) then
        raise exception 'invalid_questions' using errcode = '22023';
      end if;
      v_seen := v_seen || v_qid;
    end if;

    if q.kind = 'pin' then
      -- A map question from the bank: its wording is fixed; the answer is a place.
      pins := pins + 1;
      if pins > 2 then
        raise exception 'too_many_maps' using errcode = '22023';
      end if;
      if jsonb_typeof(e -> 'lat') is distinct from 'number'
         or jsonb_typeof(e -> 'lng') is distinct from 'number' then
        raise exception 'invalid_place' using errcode = '22023';
      end if;
      v_lat := round(((e ->> 'lat')::numeric), 2)::double precision;
      v_lng := round(((e ->> 'lng')::numeric), 2)::double precision;
      v_label := btrim(e ->> 'label');
      if v_lat not between -90 and 90 or v_lng not between -180 and 180
         or v_label is null or char_length(v_label) not between 1 and 60
         or (q.map_scope = 'india' and (v_lat not between 2 and 40 or v_lng not between 60 and 104)) then
        raise exception 'invalid_place' using errcode = '22023';
      end if;

      item_pos := i::smallint;
      question_id := v_qid;
      prompt_self := q.prompt_self;
      prompt_other := q.prompt_other;
      options := '{}';
      correct_option := 0;
      source := 'bank';
      kind := 'pin';
      map_scope := q.map_scope;
      answer_lat := v_lat;
      answer_lng := v_lng;
      answer_label := v_label;
      return next;
      i := i + 1;
      continue;
    end if;

    v_correct := case
      when jsonb_typeof(e -> 'correct_option') = 'number' then (e ->> 'correct_option')::smallint
    end;

    if jsonb_typeof(e -> 'options') = 'array' then
      v_opts := array(select btrim(x) from jsonb_array_elements_text(e -> 'options') as x);
    else
      v_opts := null;
    end if;

    if v_qid is not null then
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
    kind := 'choice';
    map_scope := null;
    answer_lat := null;
    answer_lng := null;
    answer_label := null;
    return next;
    i := i + 1;
  end loop;
end;
$$;

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

  perform count(*) from public.quiz_items_checked(p_items);

  v_code := public.new_quiz_code();

  insert into public.quizzes (owner_id, code, owner_name)
  values (v_uid, v_code, v_name)
  returning id into v_quiz_id;

  insert into public.quiz_questions
    (quiz_id, position, question_id, prompt, prompt_self, options, correct_option, source,
     kind, map_scope, answer_lat, answer_lng, answer_label)
  select v_quiz_id, c.item_pos, c.question_id, c.prompt_other, c.prompt_self, c.options,
         c.correct_option, c.source, c.kind, c.map_scope, c.answer_lat, c.answer_lng,
         c.answer_label
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
    (quiz_id, position, question_id, prompt, prompt_self, options, correct_option, source,
     kind, map_scope, answer_lat, answer_lng, answer_label)
  select v_quiz.id, c.item_pos, c.question_id, c.prompt_other, c.prompt_self, c.options,
         c.correct_option, c.source, c.kind, c.map_scope, c.answer_lat, c.answer_lng,
         c.answer_label
  from public.quiz_items_checked(p_items) c;

  return jsonb_build_object('id', v_quiz.id, 'code', v_quiz.code);
end;
$$;

-- Friends get each question's kind and map, never the place.
create or replace function public.get_quiz_for_play(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'code', q.code,
    'owner_name', q.owner_name,
    'edition', q.edition,
    'look', q.look,
    'retries_locked', public.retries_locked_at(q.id) is not null,
    'questions', (
      select jsonb_agg(
        jsonb_build_object(
          'position', qq.position,
          'prompt', qq.prompt,
          'options', to_jsonb(qq.options),
          'kind', qq.kind,
          'scope', qq.map_scope
        )
        order by qq.position
      )
      from public.quiz_questions qq
      where qq.quiz_id = q.id
    )
  )
  from public.quizzes q
  where q.code = upper(btrim(p_code));
$$;

-- ---------------------------------------------------------------------------
-- Answering. A choice question can't be answered with a pin and vice versa.
-- ---------------------------------------------------------------------------
create or replace function public.answer_question(p_attempt_id uuid, p_choice smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts%rowtype;
  v_question public.quiz_questions%rowtype;
  v_position smallint;
  v_total int;
  v_correct boolean;
begin
  select * into v_attempt
  from public.attempts
  where id = p_attempt_id and player_id = auth.uid()
  for update;

  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if v_attempt.finished_at is not null then
    raise exception 'attempt_finished' using errcode = '22023';
  end if;

  v_position := coalesce(array_length(v_attempt.picks, 1), 0);

  select * into v_question
  from public.quiz_questions
  where quiz_id = v_attempt.quiz_id and position = v_position;

  if v_question.kind = 'pin' then
    raise exception 'needs_pin' using errcode = '22023';
  end if;
  if p_choice is null or p_choice < 0 or p_choice >= array_length(v_question.options, 1) then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;

  v_correct := p_choice = v_question.correct_option;
  select count(*) into v_total from public.quiz_questions where quiz_id = v_attempt.quiz_id;

  update public.attempts
  set picks = picks || p_choice,
      results = results || v_correct,
      score = score + v_correct::int,
      finished_at = case when v_position + 1 >= v_total then now() end
  where id = v_attempt.id
  returning * into v_attempt;

  if v_attempt.finished_at is not null and v_attempt.attempt_no = 1 then
    update public.quizzes set play_count = play_count + 1 where id = v_attempt.quiz_id;
  end if;

  return jsonb_build_object(
    'position', v_position,
    'is_correct', v_correct,
    'finished', v_attempt.finished_at is not null,
    'score', v_attempt.score
  );
end;
$$;

-- Drop a pin on the current (map) question. Returns how far off, never the place.
create function public.answer_pin(p_attempt_id uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts%rowtype;
  v_question public.quiz_questions%rowtype;
  v_position smallint;
  v_total int;
  v_km double precision;
  v_correct boolean;
begin
  select * into v_attempt
  from public.attempts
  where id = p_attempt_id and player_id = auth.uid()
  for update;

  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if v_attempt.finished_at is not null then
    raise exception 'attempt_finished' using errcode = '22023';
  end if;

  v_position := coalesce(array_length(v_attempt.picks, 1), 0);

  select * into v_question
  from public.quiz_questions
  where quiz_id = v_attempt.quiz_id and position = v_position;

  if v_question.kind is distinct from 'pin' then
    raise exception 'needs_choice' using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_place' using errcode = '22023';
  end if;

  v_km := public.distance_km(p_lat, p_lng, v_question.answer_lat, v_question.answer_lng);
  v_correct := v_km <= public.pin_right_km(v_question.map_scope);
  select count(*) into v_total from public.quiz_questions where quiz_id = v_attempt.quiz_id;

  insert into public.attempt_pins (attempt_id, position, lat, lng, distance_km)
  values (v_attempt.id, v_position, round(p_lat::numeric, 3), round(p_lng::numeric, 3), v_km);

  update public.attempts
  set picks = picks || (-1)::smallint,
      results = results || v_correct,
      score = score + v_correct::int,
      finished_at = case when v_position + 1 >= v_total then now() end
  where id = v_attempt.id
  returning * into v_attempt;

  if v_attempt.finished_at is not null and v_attempt.attempt_no = 1 then
    update public.quizzes set play_count = play_count + 1 where id = v_attempt.quiz_id;
  end if;

  return jsonb_build_object(
    'position', v_position,
    'distance_km', round(v_km::numeric, 1),
    'is_correct', v_correct,
    'bullseye', v_km <= 25,
    'finished', v_attempt.finished_at is not null,
    'score', v_attempt.score
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Seeing the real places. A friend sees them once they can't play again: after
-- round 2, when the creator locked retries, or when they choose to (which ends
-- their chance of a second round).
-- ---------------------------------------------------------------------------
create or replace function public.has_second_chance(p_user uuid, p_quiz uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.purchases p
    where p.user_id = p_user and p.product = 'second_chance'
      and p.status = 'paid' and p.quiz_id = p_quiz
      and coalesce(p.paid_at, p.created_at)
          < coalesce(public.retries_locked_at(p_quiz), 'infinity')
  )
  and not exists (
    select 1 from public.attempts a
    where a.player_id = p_user and a.quiz_id = p_quiz
      and (a.attempt_no = 2 or a.revealed_at is not null)
  );
$$;

-- The caller's map answers for a quiz they finished.
-- {allowed: false, maps: n} while a retry is still possible, else
-- {allowed: true, items: [{position, prompt, scope, label, lat, lng, guess_lat, guess_lng, distance_km}]}
create function public.get_my_map_reveal(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_allowed boolean;
begin
  select * into v_attempt from public.attempts
  where quiz_id = p_quiz_id and player_id = v_uid
  order by attempt_no desc limit 1;
  if not found or v_attempt.finished_at is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_allowed := v_attempt.attempt_no >= 2
    or public.retries_locked_at(p_quiz_id) is not null
    or exists (select 1 from public.attempts a
               where a.quiz_id = p_quiz_id and a.player_id = v_uid and a.revealed_at is not null);

  if not v_allowed then
    return jsonb_build_object(
      'allowed', false,
      'maps', (select count(*) from public.quiz_questions
               where quiz_id = p_quiz_id and kind = 'pin')
    );
  end if;

  return jsonb_build_object('allowed', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'position', qq.position,
      'prompt', qq.prompt,
      'scope', qq.map_scope,
      'label', qq.answer_label,
      'lat', qq.answer_lat,
      'lng', qq.answer_lng,
      'guess_lat', ap.lat,
      'guess_lng', ap.lng,
      'distance_km', round(ap.distance_km::numeric, 1)
    ) order by qq.position)
    from public.quiz_questions qq
    left join public.attempt_pins ap on ap.attempt_id = v_attempt.id and ap.position = qq.position
    where qq.quiz_id = p_quiz_id and qq.kind = 'pin'
  ), '[]'::jsonb));
end;
$$;

-- "Show me the spot": gives up the second round, then reveals.
create function public.reveal_my_map(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.attempts
  where quiz_id = p_quiz_id and player_id = auth.uid() and finished_at is not null
  order by attempt_no desc limit 1;
  if v_id is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.attempts set revealed_at = coalesce(revealed_at, now()) where id = v_id;
  return public.get_my_map_reveal(p_quiz_id);
end;
$$;

-- For the quiz's owner: each map question with friends' first-round pins, closest
-- first. Top 10 per question unless the owner has the full leaderboard.
create function public.get_guess_map(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int;
begin
  if v_uid is null or not exists (
    select 1 from public.quizzes q where q.id = p_quiz_id and q.owner_id = v_uid
  ) then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;

  v_limit := case when public.has_unlock(v_uid, 'full_board', p_quiz_id) then 100000 else 10 end;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'position', qq.position,
      'prompt', qq.prompt,
      'scope', qq.map_scope,
      'label', qq.answer_label,
      'lat', qq.answer_lat,
      'lng', qq.answer_lng,
      'total', (select count(*) from public.attempt_pins ap
                join public.attempts a on a.id = ap.attempt_id
                where a.quiz_id = p_quiz_id and a.attempt_no = 1 and ap.position = qq.position),
      'guesses', coalesce((
        select jsonb_agg(g order by g.distance_km)
        from (
          select a.player_name, ap.lat, ap.lng, round(ap.distance_km::numeric, 1) as distance_km
          from public.attempt_pins ap
          join public.attempts a on a.id = ap.attempt_id
          where a.quiz_id = p_quiz_id and a.attempt_no = 1 and ap.position = qq.position
          order by ap.distance_km
          limit v_limit
        ) g
      ), '[]'::jsonb)
    ) order by qq.position)
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id and qq.kind = 'pin'
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.distance_km(double precision, double precision, double precision, double precision),
  public.pin_right_km(text),
  public.quiz_items_checked(jsonb),
  public.answer_pin(uuid, double precision, double precision),
  public.get_my_map_reveal(uuid),
  public.reveal_my_map(uuid),
  public.get_guess_map(uuid)
from public, anon, authenticated;

grant execute on function
  public.answer_pin(uuid, double precision, double precision),
  public.get_my_map_reveal(uuid),
  public.reveal_my_map(uuid),
  public.get_guess_map(uuid)
to authenticated;
