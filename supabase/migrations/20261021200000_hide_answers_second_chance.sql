-- Keep the owner's answers secret, and let a friend buy one more round.
--
--  * answer_question no longer returns the correct option. A friend learns only
--    whether their guess was right, so a second round can't be aced by memory.
--  * start_attempt starts round 2 for a friend who finished round 1 and has a
--    paid "second_chance" purchase for this quiz. The leaderboard already counts
--    each friend's best round.
--  * New product "lock_retries": the quiz's creator pays once so friends can't
--    buy a second round. A friend who paid before the lock keeps their round.

alter table public.purchases drop constraint purchases_product_check;
alter table public.purchases add constraint purchases_product_check check (
  product in (
    'reveal', 'full_board', 'second_chance', 'lock_retries',
    'pro_monthly', 'pro_yearly',
    'edition_couples', 'edition_birthday'
  )
);

-- When the quiz's owner locked retries, or null if they haven't.
create function public.retries_locked_at(p_quiz uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select min(coalesce(b.paid_at, b.created_at))
  from public.purchases b
  join public.quizzes q on q.id = b.quiz_id and q.owner_id = b.user_id
  where b.quiz_id = p_quiz and b.product = 'lock_retries' and b.status = 'paid';
$$;

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

-- True if the user has a paid second chance for this quiz that round 2 hasn't used.
create function public.has_second_chance(p_user uuid, p_quiz uuid)
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
      -- Bought before the owner locked retries (or retries aren't locked).
      and coalesce(p.paid_at, p.created_at)
          < coalesce(public.retries_locked_at(p_quiz), 'infinity')
  )
  and not exists (
    select 1 from public.attempts a
    where a.player_id = p_user and a.quiz_id = p_quiz and a.attempt_no = 2
  );
$$;

create or replace function public.start_attempt(p_code text, p_player_name text)
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
        'answered', coalesce(array_length(v_attempt.picks, 1), 0),
        'attempt_no', v_attempt.attempt_no
      );
    end if;
    if v_attempt.attempt_no = 1 and public.has_second_chance(v_uid, v_quiz.id) then
      insert into public.attempts (quiz_id, player_id, player_name, attempt_no)
      values (v_quiz.id, v_uid, v_attempt.player_name, 2)
      returning * into v_attempt;
      return jsonb_build_object('attempt_id', v_attempt.id, 'answered', 0, 'attempt_no', 2);
    end if;
    raise exception 'already_played' using errcode = '23505';
  end if;

  insert into public.attempts (quiz_id, player_id, player_name)
  values (v_quiz.id, v_uid, v_name)
  returning * into v_attempt;

  return jsonb_build_object('attempt_id', v_attempt.id, 'answered', 0, 'attempt_no', 1);
end;
$$;

-- Friends' play page needs to know whether a second round can be offered.
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
    'retries_locked', public.retries_locked_at(q.id) is not null,
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

revoke execute on function
  public.has_second_chance(uuid, uuid),
  public.retries_locked_at(uuid)
from public, anon, authenticated;
