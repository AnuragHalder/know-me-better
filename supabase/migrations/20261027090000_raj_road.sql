-- Raj's Road: a story game. The creator walks a short story, making one choice at
-- each turn. Friends walk the same story guessing the creator's choice at every turn.
--
-- A road is a quiz with kind = 'road': each turn is a quiz question whose
-- correct_option is the creator's choice, so start_attempt, answer_question (which
-- never sends the creator's choice), the leaderboard and the dashboard all work as
-- they do for quizzes. What's new:
--
--  * stories: the story templates (public, read-only).
--  * create_road(story, name, choices): saves the creator's walk.
--  * road_ending(turns, picks): every option votes for an ending; the most votes
--    wins, ties go to the most recent vote.
--  * get_road_reveal(quiz): once a friend has finished (or for the owner), the
--    creator's path, everyone's endings and how many friends ended where the
--    creator did. The owner also sees each friend's path: 10 free, all with Full board.
--  * Roads have no second round: the reveal shows the creator's path, so a retry
--    would be a formality. Roads can't be edited with update_quiz either.

-- ---------------------------------------------------------------------------
-- Stories
-- ---------------------------------------------------------------------------
create table public.stories (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  title text not null check (char_length(title) between 3 and 60),
  blurb text not null check (char_length(blurb) between 3 and 140),
  -- [{place, scene_self, scene_other, ask_self, ask_other, options: [{text, short, ending}]}]
  turns jsonb not null check (
    jsonb_typeof(turns) = 'array' and jsonb_array_length(turns) between 3 and 8
  ),
  -- [{key, title, line}]
  endings jsonb not null check (
    jsonb_typeof(endings) = 'array' and jsonb_array_length(endings) between 2 and 6
  ),
  active boolean not null default true,
  sort smallint not null default 0
);

alter table public.stories enable row level security;
create policy "Anyone can read active stories" on public.stories
  for select to anon, authenticated using (active);
revoke insert, update, delete, truncate on public.stories from anon, authenticated;

insert into public.stories (id, title, blurb, sort, endings, turns) values
(
  'goa_trip',
  'The Goa trip that went wrong',
  'Train cancelled, hotel gone, phone in the sea. Do you make it to the beach?',
  10,
  $json$[
    {"key": "palolem", "title": "Sunrise at Palolem", "line": "No phone, no plan, one perfect swim."},
    {"key": "mom_upi", "title": "Rescued by Mom's UPI", "line": "Home called. Home paid. Home will bring it up at every family dinner."},
    {"key": "margao", "title": "Stranded at Margao station", "line": "Wrong train, dead phone, one samosa left."},
    {"key": "shack_family", "title": "Adopted by the shack family", "line": "Came for three days. Now helps run the kitchen."}
  ]$json$,
  $json$[
    {
      "place": "Pune station, 6 am",
      "scene_self": "Your train to Goa is cancelled. The group chat is on fire and everyone is waiting for you to sort it out.",
      "scene_other": "{name}'s train to Goa is cancelled. The group chat is on fire and everyone is waiting for {name} to sort it out.",
      "ask_self": "What do you do?",
      "ask_other": "What did {name} do?",
      "options": [
        {"text": "Grab the overnight sleeper bus", "short": "Sleeper bus", "ending": "margao"},
        {"text": "Split a cab with strangers from the station", "short": "Shared cab", "ending": "shack_family"},
        {"text": "Book a last-minute flight, whatever it costs", "short": "Flew in", "ending": "mom_upi"}
      ]
    },
    {
      "place": "Anjuna, 4 pm",
      "scene_self": "The hotel has never heard of your booking. Your bag is heavy and the sun is not being kind.",
      "scene_other": "The hotel has never heard of {name}'s booking. The bag is heavy and the sun is not being kind.",
      "ask_self": "Where do you sleep tonight?",
      "ask_other": "Where did {name} sleep that night?",
      "options": [
        {"text": "A bunk at the beach hostel", "short": "Beach hostel", "ending": "palolem"},
        {"text": "Haggle at the fancy resort next door", "short": "Fancy resort", "ending": "mom_upi"},
        {"text": "Call the college friend who 'lives near Goa'", "short": "College friend", "ending": "margao"}
      ]
    },
    {
      "place": "First night",
      "scene_self": "You finally have a bed. It's 9 pm, the sea is loud, and someone at the shack says there's a party down the lane.",
      "scene_other": "{name} finally has a bed. It's 9 pm, the sea is loud, and someone at the shack says there's a party down the lane.",
      "ask_self": "What do you do with your first night?",
      "ask_other": "What did {name} do with the first night?",
      "options": [
        {"text": "Follow the music to the party", "short": "Party", "ending": "margao"},
        {"text": "Fish curry and a long dinner at the shack", "short": "Shack dinner", "ending": "shack_family"},
        {"text": "Sleep at 10, alarm set for a sunrise swim", "short": "Slept early", "ending": "palolem"}
      ]
    },
    {
      "place": "Baga beach, noon",
      "scene_self": "Your phone slips out of your pocket and straight into the sea. It's gone.",
      "scene_other": "{name}'s phone slips out of a pocket and straight into the sea. It's gone.",
      "ask_self": "What now?",
      "ask_other": "What did {name} do next?",
      "options": [
        {"text": "Spend the day hunting for a repair shop", "short": "Repair shop", "ending": "margao"},
        {"text": "Go offline and enjoy it", "short": "Went offline", "ending": "palolem"},
        {"text": "Borrow a stranger's phone and call Mom", "short": "Called Mom", "ending": "mom_upi"}
      ]
    },
    {
      "place": "Last day",
      "scene_self": "Checkout is at 11. Your wallet has ₹640 and a bus ticket you're not sure about.",
      "scene_other": "Checkout is at 11. {name}'s wallet has ₹640 and a bus ticket nobody is sure about.",
      "ask_self": "How does the trip end?",
      "ask_other": "How did {name} end the trip?",
      "options": [
        {"text": "Sell the sunglasses to the shack owner", "short": "Sold sunglasses", "ending": "shack_family"},
        {"text": "Stay two more days and figure it out", "short": "Stayed on", "ending": "palolem"},
        {"text": "Take the first bus home", "short": "Bus home", "ending": "margao"}
      ]
    }
  ]$json$
),
(
  'lottery',
  'You just won ₹10 lakh',
  'Tell the family? Quit the job? Buy the bike? Friends guess what you do with it.',
  20,
  $json$[
    {"key": "sensible", "title": "The sensible one", "line": "FD, SIP, and a spreadsheet that brings real joy."},
    {"key": "legend", "title": "Legend of the group chat", "line": "Goa for everyone. Nobody will forget it, least of all the bank."},
    {"key": "family_hero", "title": "Family hero", "line": "Loan cleared, roof fixed, Dadi's blessings in full."},
    {"key": "broke", "title": "Broke by Diwali", "line": "The bike was worth it. Probably."}
  ]$json$,
  $json$[
    {
      "place": "The phone call",
      "scene_self": "A lottery agent calls. Your ticket just won ₹10 lakh, after tax. Your hands are shaking.",
      "scene_other": "A lottery agent calls. {name}'s ticket just won ₹10 lakh, after tax. {name}'s hands are shaking.",
      "ask_self": "Who do you tell first?",
      "ask_other": "Who did {name} tell first?",
      "options": [
        {"text": "Mom and Dad, right now", "short": "Parents", "ending": "family_hero"},
        {"text": "The group chat, in all caps", "short": "Group chat", "ending": "legend"},
        {"text": "No one. Not yet.", "short": "No one", "ending": "sensible"}
      ]
    },
    {
      "place": "The next morning",
      "scene_self": "You wake up and it's real. You also still have a job you don't love and a boss who calls at 10 pm.",
      "scene_other": "{name} wakes up and it's real. There's also still a job {name} doesn't love and a boss who calls at 10 pm.",
      "ask_self": "What about the job?",
      "ask_other": "What did {name} do about the job?",
      "options": [
        {"text": "Quit today, dramatically", "short": "Quit", "ending": "broke"},
        {"text": "Keep the job and tell no one", "short": "Kept the job", "ending": "sensible"},
        {"text": "Ask for a sabbatical to 'travel'", "short": "Sabbatical", "ending": "legend"}
      ]
    },
    {
      "place": "The first spend",
      "scene_self": "A first treat feels earned. The showroom, the travel app and the jeweller are all open.",
      "scene_other": "A first treat feels earned. The showroom, the travel app and the jeweller are all open.",
      "ask_self": "What's the first big buy?",
      "ask_other": "What was {name}'s first big buy?",
      "options": [
        {"text": "The bike you've wanted since college", "short": "The bike", "ending": "broke"},
        {"text": "Flights for the whole gang", "short": "Gang trip", "ending": "legend"},
        {"text": "Gold for Mom", "short": "Gold for Mom", "ending": "family_hero"}
      ]
    },
    {
      "place": "The cousin",
      "scene_self": "A cousin you last saw at a wedding in 2019 needs ₹2 lakh for 'a sure-shot business'.",
      "scene_other": "A cousin {name} last saw at a wedding in 2019 needs ₹2 lakh for 'a sure-shot business'.",
      "ask_self": "What do you say?",
      "ask_other": "What did {name} say?",
      "options": [
        {"text": "Yes. Family is family.", "short": "Said yes", "ending": "family_hero"},
        {"text": "A polite no, in a long voice note", "short": "Polite no", "ending": "sensible"},
        {"text": "Yes, for 20% of the business", "short": "Took 20%", "ending": "broke"}
      ]
    },
    {
      "place": "Six months later",
      "scene_self": "Some money is left. Everyone you know has an opinion about it.",
      "scene_other": "Some money is left. Everyone {name} knows has an opinion about it.",
      "ask_self": "Where does the rest go?",
      "ask_other": "Where did the rest go?",
      "options": [
        {"text": "Index funds and an FD", "short": "Index funds", "ending": "sensible"},
        {"text": "Clear the home loan", "short": "Home loan", "ending": "family_hero"},
        {"text": "One more trip. Life is short.", "short": "One more trip", "ending": "legend"}
      ]
    }
  ]$json$
);

-- ---------------------------------------------------------------------------
-- A road is a quiz of kind 'road' on a story.
-- ---------------------------------------------------------------------------
alter table public.quizzes
  add column kind text not null default 'quiz' check (kind in ('quiz', 'road')),
  add column story_id text references public.stories (id),
  add constraint quizzes_road_story check ((kind = 'road') = (story_id is not null));

-- The ending a path leads to. Each picked option votes for an ending; most votes
-- wins and a tie goes to the ending voted for most recently.
create function public.road_ending(p_turns jsonb, p_picks smallint[])
returns text
language sql
immutable
set search_path = ''
as $$
  select v.ending
  from (
    select p_turns -> (i - 1) -> 'options' -> p_picks[i]::int ->> 'ending' as ending, i
    from generate_subscripts(p_picks, 1) as i
  ) v
  where v.ending is not null
  group by v.ending
  order by count(*) desc, max(v.i) desc
  limit 1;
$$;

-- Save the creator's walk as a road. p_choices has one option index per turn.
-- Returns {id, code}.
create function public.create_road(p_story_id text, p_owner_name text, p_choices int[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_owner_name);
  v_story public.stories%rowtype;
  v_turns int;
  v_quiz_id uuid;
  v_code text;
  i int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 24 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  select * into v_story from public.stories where id = p_story_id and active;
  if not found then
    raise exception 'story_not_found' using errcode = 'P0002';
  end if;

  v_turns := jsonb_array_length(v_story.turns);
  if p_choices is null or coalesce(array_length(p_choices, 1), 0) <> v_turns
     or array_ndims(p_choices) <> 1 then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  for i in 1..v_turns loop
    if p_choices[i] is null or p_choices[i] < 0
       or p_choices[i] >= jsonb_array_length(v_story.turns -> (i - 1) -> 'options') then
      raise exception 'invalid_choice' using errcode = '22023';
    end if;
  end loop;

  v_code := public.new_quiz_code();

  insert into public.quizzes (owner_id, code, owner_name, kind, story_id)
  values (v_uid, v_code, v_name, 'road', v_story.id)
  returning id into v_quiz_id;

  insert into public.quiz_questions
    (quiz_id, position, question_id, prompt, prompt_self, options, correct_option, source, kind)
  select v_quiz_id, (t.n - 1)::smallint, null, t.turn ->> 'ask_other', t.turn ->> 'ask_self',
         array(select o ->> 'text' from jsonb_array_elements(t.turn -> 'options') o),
         p_choices[t.n]::smallint, 'bank', 'choice'
  from jsonb_array_elements(v_story.turns) with ordinality as t(turn, n);

  return jsonb_build_object('id', v_quiz_id, 'code', v_code);
end;
$$;

-- Friends' play page: also the kind of page and its story.
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
    'kind', q.kind,
    'story_id', q.story_id,
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

-- Roads keep the story's turns: they can't be rewritten as a quiz.
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
  if v_quiz.kind = 'road' then
    raise exception 'road_not_editable' using errcode = '22023';
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

-- No second round on a road: the reveal has already shown the creator's path.
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
  )
  and not exists (
    select 1 from public.quizzes q where q.id = p_quiz and q.kind = 'road'
  );
$$;

-- The dashboard also needs to tell quizzes and roads apart, and each one's length.
create or replace function public.my_quizzes()
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
        'kind', q.kind,
        'story_title', s.title,
        'total', (select count(*) from public.quiz_questions qq where qq.quiz_id = q.id),
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
  left join public.stories s on s.id = q.story_id
  where q.owner_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- The reveal
-- ---------------------------------------------------------------------------
-- For the road's owner, or a friend who has finished their walk:
-- {story_id, owner_name, owner_picks, owner_ending,
--  me: {picks, score, ending} | null           (null for the owner)
--  total: friends who finished,
--  followed: friends whose ending is the owner's,
--  tally: [{ending, count, names}]             (names: up to 3, the caller first)
--  friends: [{player_name, picks, score, ending}] | null   (owner only; 10 free)
--  hidden: friends left out of `friends`}
create function public.get_road_reveal(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_quiz public.quizzes%rowtype;
  v_turns jsonb;
  v_is_owner boolean;
  v_me public.attempts%rowtype;
  v_owner_picks smallint[];
  v_owner_ending text;
  v_limit int;
  v_result jsonb;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id and kind = 'road';
  if v_uid is null or not found then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;
  v_is_owner := v_quiz.owner_id = v_uid;

  if not v_is_owner then
    select * into v_me from public.attempts
    where quiz_id = v_quiz.id and player_id = v_uid and attempt_no = 1
      and finished_at is not null;
    if not found then
      raise exception 'not_finished' using errcode = '42501';
    end if;
  end if;

  select turns into v_turns from public.stories where id = v_quiz.story_id;
  select array_agg(correct_option order by position) into v_owner_picks
  from public.quiz_questions where quiz_id = v_quiz.id;
  v_owner_ending := public.road_ending(v_turns, v_owner_picks);
  v_limit := case
    when v_is_owner and public.has_unlock(v_uid, 'full_board', v_quiz.id) then 100000
    else 10
  end;

  with walks as (
    select a.player_id, a.player_name, a.picks, a.score, a.finished_at,
           public.road_ending(v_turns, a.picks) as ending
    from public.attempts a
    where a.quiz_id = v_quiz.id and a.attempt_no = 1 and a.finished_at is not null
  ),
  tally as (
    select w.ending, count(*) as n,
           (array_agg(w.player_name order by w.player_id = v_uid desc, w.finished_at))[1:3]
             as names
    from walks w
    group by w.ending
  )
  select jsonb_build_object(
    'story_id', v_quiz.story_id,
    'owner_name', v_quiz.owner_name,
    'owner_picks', to_jsonb(v_owner_picks),
    'owner_ending', v_owner_ending,
    'me', case when v_is_owner then null else jsonb_build_object(
      'picks', to_jsonb(v_me.picks),
      'score', v_me.score,
      'ending', public.road_ending(v_turns, v_me.picks)
    ) end,
    'total', (select count(*) from walks),
    'followed', (select count(*) from walks w where w.ending = v_owner_ending),
    'tally', coalesce((
      select jsonb_agg(jsonb_build_object('ending', t.ending, 'count', t.n, 'names', to_jsonb(t.names))
                       order by t.n desc, t.ending = v_owner_ending desc, t.ending)
      from tally t
    ), '[]'::jsonb),
    'friends', case when v_is_owner then coalesce((
      select jsonb_agg(jsonb_build_object(
               'player_name', f.player_name, 'picks', to_jsonb(f.picks),
               'score', f.score, 'ending', f.ending)
             order by f.score desc, f.finished_at)
      from (select * from walks order by score desc, finished_at limit v_limit) f
    ), '[]'::jsonb) end,
    'hidden', case when v_is_owner
      then greatest((select count(*) from walks) - v_limit, 0) else 0 end
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.road_ending(jsonb, smallint[]),
  public.create_road(text, text, int[]),
  public.get_road_reveal(uuid)
from public, anon, authenticated;

grant execute on function
  public.create_road(text, text, int[]),
  public.get_road_reveal(uuid)
to authenticated;
