-- Each quiz has a look the creator picks: the clean, modern default, or the
-- original notebook ("Slambook") page. Friends see the creator's choice when they
-- play, unless they picked their own look in the header. Existing quizzes move to
-- the clean default too.

alter table public.quizzes
  add column look text not null default 'clean' check (look in ('notebook', 'clean'));

-- The owner changes the look at any time; it never affects scores.
create function public.set_quiz_look(p_quiz_id uuid, p_look text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_look is null or p_look not in ('notebook', 'clean') then
    raise exception 'invalid_look' using errcode = '22023';
  end if;
  update public.quizzes set look = p_look where id = p_quiz_id and owner_id = auth.uid();
  if not found then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Same as before, plus the look.
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

revoke execute on function public.set_quiz_look(uuid, text) from public, anon, authenticated;
grant execute on function public.set_quiz_look(uuid, text) to authenticated;
