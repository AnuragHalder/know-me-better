-- Let a creator change their name or answers, but only before any friend has
-- started playing (changing answers afterwards would make existing scores wrong).

create function public.update_quiz(p_quiz_id uuid, p_owner_name text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_owner_name);
  v_quiz public.quizzes%rowtype;
  v_valid int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;

  select * into v_quiz
  from public.quizzes
  where id = p_quiz_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.attempts where quiz_id = p_quiz_id) then
    raise exception 'quiz_has_plays' using errcode = '22023';
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

  update public.quizzes set owner_name = v_name where id = v_quiz.id;

  delete from public.quiz_questions where quiz_id = v_quiz.id;

  insert into public.quiz_questions (quiz_id, position, question_id, prompt, options, correct_option)
  select v_quiz.id, i.item_pos, q.id, q.prompt_other, q.options, i.correct_option
  from public.quiz_items_from_json(p_items) i
  join public.questions q on q.id = i.question_id;

  return jsonb_build_object('id', v_quiz.id, 'code', v_quiz.code);
end;
$$;

revoke execute on function public.update_quiz(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_quiz(uuid, text, jsonb) to authenticated;
