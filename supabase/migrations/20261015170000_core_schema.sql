-- Know Me Better: core schema.
--
-- Security model (see docs/DATABASE.md):
--   * Every table has row-level security on.
--   * Clients never write to tables directly. All writes go through the
--     security-definer functions at the bottom of this file, which validate input
--     and do the scoring on the server.
--   * The correct answers (quiz_questions.correct_option) are readable only by the
--     quiz owner. Players receive each answer only after they have answered.
--   * Purchases are written only by the server (service role) after Razorpay
--     confirms payment.

-- ---------------------------------------------------------------------------
-- profiles: one row per signed-in account (creators and guest players)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "Update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- questions: the shared bank creators pick from
-- ---------------------------------------------------------------------------
create table public.questions (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  edition text not null default 'friends',
  -- Shown to the creator: "My usual chai order?"
  prompt_self text not null check (char_length(prompt_self) between 3 and 120),
  -- Shown to players. {name} is replaced with the creator's name: "{name}'s usual chai order?"
  prompt_other text not null check (prompt_other like '%{name}%'),
  options text[] not null check (array_length(options, 1) between 2 and 6),
  active boolean not null default true,
  sort smallint not null default 0
);

alter table public.questions enable row level security;

create policy "Anyone reads active questions" on public.questions
  for select to anon, authenticated using (active);

-- ---------------------------------------------------------------------------
-- quizzes and their questions
-- ---------------------------------------------------------------------------
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- 6 characters, no I, O, 0 or 1 so codes are easy to read aloud.
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  owner_name text not null check (char_length(owner_name) between 1 and 24),
  edition text not null default 'friends',
  -- Number of distinct friends who finished their first attempt.
  play_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index quizzes_owner_idx on public.quizzes (owner_id);

alter table public.quizzes enable row level security;

create policy "Owner reads own quizzes" on public.quizzes
  for select to authenticated using (owner_id = auth.uid());

create policy "Owner deletes own quizzes" on public.quizzes
  for delete to authenticated using (owner_id = auth.uid());

-- Prompt and options are copied from the bank when the quiz is created, so later
-- edits to the bank never change a quiz someone has already answered.
create table public.quiz_questions (
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  position smallint not null check (position between 0 and 19),
  question_id text references public.questions (id) on delete set null,
  prompt text not null,
  options text[] not null,
  correct_option smallint not null,
  primary key (quiz_id, position),
  check (correct_option >= 0 and correct_option < array_length(options, 1))
);

alter table public.quiz_questions enable row level security;

create policy "Owner reads own quiz answers" on public.quiz_questions
  for select to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- attempts: one row per friend per play (attempt 2 is the paid second chance)
-- ---------------------------------------------------------------------------
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 24),
  attempt_no smallint not null default 1 check (attempt_no between 1 and 2),
  picks smallint[] not null default '{}',
  results boolean[] not null default '{}',
  score smallint not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (quiz_id, player_id, attempt_no)
);

create index attempts_board_idx on public.attempts (quiz_id, finished_at);

alter table public.attempts enable row level security;

create policy "Player reads own attempts" on public.attempts
  for select to authenticated using (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- purchases: written only by the server after Razorpay confirms payment
-- ---------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  product text not null check (
    product in (
      'reveal', 'full_board', 'second_chance',
      'pro_monthly', 'pro_yearly',
      'edition_couples', 'edition_birthday'
    )
  ),
  quiz_id uuid references public.quizzes (id) on delete set null,
  amount_paise integer not null check (amount_paise >= 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  -- Set for subscriptions (Pro): access lasts until this time.
  expires_at timestamptz
);

create index purchases_user_idx on public.purchases (user_id, status);

alter table public.purchases enable row level security;

create policy "Buyer reads own purchases" on public.purchases
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Table privileges. Supabase grants everything to anon and authenticated by
-- default; take back what clients must never do, so a missing policy can't
-- become a hole.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.quizzes, public.quiz_questions, public.attempts, public.purchases
  from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.quiz_questions, public.attempts, public.purchases
  from authenticated;
revoke insert, update, truncate, references, trigger on public.quizzes from authenticated;
revoke insert, delete, truncate, references, trigger on public.profiles from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.questions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (not callable by clients)
-- ---------------------------------------------------------------------------
create function public.new_quiz_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.quizzes where code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Parse create_quiz input into rows. A non-numeric correct_option fails the cast.
create function public.quiz_items_from_json(p_items jsonb)
returns table (item_pos smallint, question_id text, correct_option smallint)
language sql
immutable
set search_path = ''
as $$
  select (t.ord - 1)::smallint,
         t.e ->> 'question_id',
         (t.e ->> 'correct_option')::smallint
  from jsonb_array_elements(p_items) with ordinality as t (e, ord);
$$;

-- Does this user hold a paid unlock? Pro covers the per-quiz unlocks while active.
create function public.has_unlock(p_user uuid, p_product text, p_quiz uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.purchases p
    where p.user_id = p_user
      and p.status = 'paid'
      and (
        (p.product = p_product and (p.quiz_id is null or p.quiz_id = p_quiz))
        or (
          p.product in ('pro_monthly', 'pro_yearly')
          and p_product in ('reveal', 'full_board')
          and coalesce(p.expires_at, 'infinity') > now()
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Client-callable functions
-- ---------------------------------------------------------------------------

-- Create a quiz from bank questions. p_items is an ordered array of
-- {"question_id": "...", "correct_option": 0-3}, exactly 10 entries.
create function public.create_quiz(p_owner_name text, p_items jsonb)
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
  v_valid int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 24 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) <> 10 then
    raise exception 'need_10_questions' using errcode = '22023';
  end if;

  select count(distinct i.question_id) into v_valid
  from public.quiz_items_from_json(p_items) i
  join public.questions q on q.id = i.question_id and q.active
  where i.correct_option between 0 and array_length(q.options, 1) - 1;

  if v_valid <> 10 then
    raise exception 'invalid_questions' using errcode = '22023';
  end if;

  v_code := public.new_quiz_code();

  insert into public.quizzes (owner_id, code, owner_name)
  values (v_uid, v_code, v_name)
  returning id into v_quiz_id;

  insert into public.quiz_questions (quiz_id, position, question_id, prompt, options, correct_option)
  select v_quiz_id, i.item_pos, q.id, q.prompt_other, q.options, i.correct_option
  from public.quiz_items_from_json(p_items) i
  join public.questions q on q.id = i.question_id;

  return jsonb_build_object('id', v_quiz_id, 'code', v_code);
end;
$$;

-- What a player needs to play: questions and options, never the answers.
-- Returns null when no quiz has this code.
create function public.get_quiz_for_play(p_code text)
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
    'questions', (
      select jsonb_agg(
        jsonb_build_object('position', qq.position, 'prompt', qq.prompt, 'options', to_jsonb(qq.options))
        order by qq.position
      )
      from public.quiz_questions qq
      where qq.quiz_id = q.id
    )
  )
  from public.quizzes q
  where q.code = upper(btrim(p_code));
$$;

-- Start (or resume) the caller's attempt. Returns {attempt_id, answered}.
create function public.start_attempt(p_code text, p_player_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_player_name);
  v_quiz public.quizzes%rowtype;
  v_attempt public.attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 24 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  select * into v_quiz from public.quizzes where code = upper(btrim(p_code));
  if not found then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;
  if v_quiz.owner_id = v_uid then
    raise exception 'own_quiz' using errcode = '22023';
  end if;

  select * into v_attempt
  from public.attempts
  where quiz_id = v_quiz.id and player_id = v_uid
  order by attempt_no desc
  limit 1;

  if found then
    if v_attempt.finished_at is null then
      return jsonb_build_object(
        'attempt_id', v_attempt.id,
        'answered', coalesce(array_length(v_attempt.picks, 1), 0)
      );
    end if;
    raise exception 'already_played' using errcode = '23505';
  end if;

  insert into public.attempts (quiz_id, player_id, player_name)
  values (v_quiz.id, v_uid, v_name)
  returning * into v_attempt;

  return jsonb_build_object('attempt_id', v_attempt.id, 'answered', 0);
end;
$$;

-- Answer the next question of the caller's attempt. Scoring happens here.
-- Returns {position, correct_option, is_correct, finished, score}.
create function public.answer_question(p_attempt_id uuid, p_choice smallint)
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
    'correct_option', v_question.correct_option,
    'is_correct', v_correct,
    'finished', v_attempt.finished_at is not null,
    'score', v_attempt.score
  );
end;
$$;

-- Leaderboard for a quiz: each friend's best finished attempt.
-- Visible to the owner and to friends who have finished. Shows the top 10, plus
-- the caller's own row, unless the owner has unlocked the full board.
create function public.get_leaderboard(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_is_owner boolean;
  v_limit int;
  v_result jsonb;
begin
  select owner_id into v_owner from public.quizzes where id = p_quiz_id;
  if v_owner is null then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;

  v_is_owner := v_uid is not null and v_uid = v_owner;

  if not v_is_owner and not exists (
    select 1 from public.attempts a
    where a.quiz_id = p_quiz_id and a.player_id = v_uid and a.finished_at is not null
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_limit := case
    when v_is_owner and public.has_unlock(v_uid, 'full_board', p_quiz_id) then null
    else 10
  end;

  with best as (
    select distinct on (a.player_id)
      a.player_id, a.player_name, a.score, a.results, a.finished_at
    from public.attempts a
    where a.quiz_id = p_quiz_id and a.finished_at is not null
    order by a.player_id, a.score desc, a.finished_at asc
  ),
  ranked as (
    select b.*, row_number() over (order by b.score desc, b.finished_at asc) as rank
    from best b
  )
  select jsonb_build_object(
    'total', (select count(*) from ranked),
    'limit', v_limit,
    'my_rank', (select r.rank from ranked r where r.player_id = v_uid),
    'rows', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rank', r.rank,
            'player_name', r.player_name,
            'score', r.score,
            'results', to_jsonb(r.results),
            'is_me', r.player_id is not distinct from v_uid
          )
          order by r.rank
        )
        from ranked r
        where v_limit is null or r.rank <= v_limit or r.player_id = v_uid
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing is callable unless granted here.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.handle_new_user(),
  public.new_quiz_code(),
  public.quiz_items_from_json(jsonb),
  public.has_unlock(uuid, text, uuid),
  public.create_quiz(text, jsonb),
  public.get_quiz_for_play(text),
  public.start_attempt(text, text),
  public.answer_question(uuid, smallint),
  public.get_leaderboard(uuid)
from public, anon, authenticated;

grant execute on function public.get_quiz_for_play(text) to anon, authenticated;
grant execute on function
  public.create_quiz(text, jsonb),
  public.start_attempt(text, text),
  public.answer_question(uuid, smallint),
  public.get_leaderboard(uuid)
to authenticated;
