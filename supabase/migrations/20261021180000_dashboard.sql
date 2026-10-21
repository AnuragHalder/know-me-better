-- Phase 6: the creator's dashboard.
--
--  * my_quizzes(): every quiz of the caller with plays, last play and the current
--    top scorer, in one call (instead of one leaderboard call per quiz).
--  * quiz_question_stats(quiz_id): for the owner, how many friends got each
--    question right. Totals only; which option each friend picked stays a paid
--    "reveal" unlock.

-- The caller's quizzes, newest first.
-- Returns [{id, code, owner_name, play_count, created_at, last_played_at,
--           top: {player_name, score} | null}].
create function public.my_quizzes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'code', q.code,
        'owner_name', q.owner_name,
        'play_count', q.play_count,
        'created_at', q.created_at,
        'last_played_at', (
          select max(a.finished_at) from public.attempts a
          where a.quiz_id = q.id and a.finished_at is not null
        ),
        'top', (
          select jsonb_build_object('player_name', a.player_name, 'score', a.score)
          from public.attempts a
          where a.quiz_id = q.id and a.finished_at is not null
          order by a.score desc, a.finished_at asc
          limit 1
        )
      )
      order by q.created_at desc
    ),
    '[]'::jsonb
  )
  from public.quizzes q
  where q.owner_id = auth.uid();
$$;

-- For the quiz's owner only: per question, how many finished first attempts got it
-- right. Returns [{position, right, total}] in question order.
create function public.quiz_question_stats(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.quizzes q where q.id = p_quiz_id and q.owner_id = v_uid
  ) then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('position', qq.position, 'right', s.right_count, 'total', s.total)
        order by qq.position
      )
      from public.quiz_questions qq
      cross join lateral (
        select
          count(*) filter (where a.results[qq.position + 1]) as right_count,
          count(*) as total
        from public.attempts a
        where a.quiz_id = p_quiz_id and a.attempt_no = 1 and a.finished_at is not null
      ) s
      where qq.quiz_id = p_quiz_id
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.my_quizzes(), public.quiz_question_stats(uuid)
  from public, anon, authenticated;
grant execute on function public.my_quizzes(), public.quiz_question_stats(uuid) to authenticated;
