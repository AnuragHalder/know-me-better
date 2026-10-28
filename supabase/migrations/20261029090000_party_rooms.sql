-- Party rooms: friends play live together with a 6-character code.
--
-- The host (signed in) opens a room for one game; friends join with just a name
-- (guest sessions). Two games:
--
--  * fake_it     A prompt about one player ("In school, {name}'s nickname was ___").
--                That player types the truth, everyone else a believable fake.
--                Then everyone votes for the answer they think is real.
--                +500 for finding the truth, +500 per friend your fake fools,
--                +250 to the subject per friend who found them out.
--  * same_brain  A prompt ("Something you'd find in the Mumbai rains"); everyone
--                types one or two words. Matching answers score 100 x group size.
--
-- Everything runs through functions. Clients never read the tables: answers stay
-- hidden until the reveal, and votes show only as totals per answer. Phases move
-- on when everyone is in or the timer runs out; room_state() moves them on when
-- any player polls, so no background job is needed.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.party_prompts (
  id bigint generated always as identity primary key,
  game text not null check (game in ('fake_it', 'same_brain')),
  pack text not null default 'free' check (pack ~ '^[a-z_]{2,30}$'),
  text text not null check (char_length(text) between 5 and 120),
  active boolean not null default true,
  -- Fake It prompts are about a player and must name them.
  check (game <> 'fake_it' or text like '%{name}%')
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game in ('fake_it', 'same_brain')),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'done')),
  game_no smallint not null default 1,
  round smallint not null default 0,
  total_rounds smallint not null default 0,
  phase text check (phase in ('write', 'vote', 'answer', 'reveal')),
  phase_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  is_host boolean not null default false,
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create unique index room_players_name on public.room_players (room_id, lower(name));

create table public.room_rounds (
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_no smallint not null,
  round_no smallint not null,
  prompt_id bigint not null references public.party_prompts (id),
  -- Fake It: whose question it is.
  subject_id uuid references auth.users (id) on delete set null,
  -- Fake It: the subject didn't answer, or nobody wrote a fake.
  skipped boolean not null default false,
  primary key (room_id, game_no, round_no)
);

-- One row per player per round: their answer and (Fake It) their vote.
create table public.room_answers (
  room_id uuid not null,
  game_no smallint not null,
  round_no smallint not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text check (char_length(text) between 1 and 40),
  norm text,
  vote_norm text,
  -- Fake It: a "fake" that is the truth counts as finding it.
  truth_match boolean not null default false,
  found boolean not null default false,
  fooled integer not null default 0,
  points integer not null default 0,
  primary key (room_id, game_no, round_no, user_id),
  foreign key (room_id, game_no, round_no)
    references public.room_rounds (room_id, game_no, round_no) on delete cascade
);

alter table public.party_prompts enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_rounds enable row level security;
alter table public.room_answers enable row level security;
revoke all on public.party_prompts, public.rooms, public.room_players, public.room_rounds,
  public.room_answers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rules of the games
-- ---------------------------------------------------------------------------
create function public.party_rule(p_key text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'max_players' then 5          -- free rooms; the Party pass will raise this
    when 'min_fake_it' then 3
    when 'min_same_brain' then 2
    when 'rounds_fake_it' then 6
    when 'rounds_same_brain' then 10
    when 'secs_write' then 60
    when 'secs_vote' then 30
    when 'secs_answer' then 25
    when 'secs_reveal' then 30
  end;
$$;

-- How answers are compared: case, spaces, punctuation, a/an/the and simple
-- plurals don't matter. "The Umbrellas!" and "umbrella" are the same answer.
create function public.party_norm(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := lower(coalesce(p_text, ''));
begin
  t := regexp_replace(t, '[^[:alnum:] ]+', ' ', 'g');
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  t := regexp_replace(t, '^(a|an|the) ', '');
  t := array_to_string(array(
    -- Then a final silent "e", so shoe/shoes and potato/potatoes line up.
    select case when char_length(v) > 3 and v like '%e' then left(v, -1) else v end
    from (
      select case
        when char_length(w) > 4 and w ~ '(sh|ch|x|ss|s|o)es$' then left(w, -2)
        when char_length(w) > 3 and w ~ '[^s]s$' then left(w, -1)
        else w
      end as v
      from unnest(string_to_array(t, ' ')) as w
    ) words
  ), ' ');
  return t;
end;
$$;

create function public.new_room_code()
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
    exit when not exists (select 1 from public.quizzes where code = candidate)
          and not exists (select 1 from public.rooms where code = candidate);
  end loop;
  return candidate;
end;
$$;

-- The caller's room by code, locked for changes. Raises unless they're in it.
create function public.party_my_room(p_code text)
returns public.rooms
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not exists (
    select 1 from public.room_players where room_id = v_room.id and user_id = auth.uid()
  ) then
    raise exception 'not_in_room' using errcode = '42501';
  end if;
  return v_room;
end;
$$;

-- A prompt this host hasn't played yet, if there is one.
create function public.party_pick_prompt(p_room public.rooms)
returns bigint
language sql
volatile
set search_path = ''
as $$
  select p.id
  from public.party_prompts p
  where p.game = p_room.game and p.active and p.pack = 'free'
  order by
    exists (
      select 1 from public.room_rounds rr join public.rooms r on r.id = rr.room_id
      where rr.prompt_id = p.id and r.host_id = p_room.host_id
    ),
    random()
  limit 1;
$$;

-- Start round n of the room's current game.
create function public.party_begin_round(p_room_id uuid, p_round smallint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_subject uuid;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.game = 'fake_it' then
    -- Players take turns as the subject, in the order they joined.
    select user_id into v_subject from public.room_players
    where room_id = p_room_id
    order by joined_at, user_id
    offset (p_round - 1) % (select count(*) from public.room_players where room_id = p_room_id)
    limit 1;
  end if;

  insert into public.room_rounds (room_id, game_no, round_no, prompt_id, subject_id)
  values (p_room_id, v_room.game_no, p_round, public.party_pick_prompt(v_room), v_subject);

  update public.rooms
  set round = p_round,
      phase = case when game = 'fake_it' then 'write' else 'answer' end,
      phase_ends_at = now() + make_interval(secs => public.party_rule(
        case when game = 'fake_it' then 'secs_write' else 'secs_answer' end))
  where id = p_room_id;
end;
$$;

-- After a reveal: the next round, or the end of the game.
create function public.party_next(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.round >= v_room.total_rounds then
    update public.rooms set status = 'done', phase = null, phase_ends_at = null
    where id = p_room_id;
  else
    perform public.party_begin_round(p_room_id, (v_room.round + 1)::smallint);
  end if;
end;
$$;

-- The answers friends vote between in a Fake It round: the truth plus every
-- distinct fake, in a shuffled order that's the same for everyone.
create function public.party_options(p_room_id uuid, p_game smallint, p_round smallint)
returns table (idx int, norm text, text text, authors uuid[])
language sql
stable
set search_path = ''
as $$
  select (row_number() over (order by md5(p_room_id::text || p_game || '-' || p_round || a.norm)))::int,
         a.norm, min(a.text), array_agg(a.user_id order by a.user_id)
  from public.room_answers a
  where a.room_id = p_room_id and a.game_no = p_game and a.round_no = p_round
    and a.text is not null and not a.truth_match
  group by a.norm;
$$;

create function public.party_score_fake_it(p_room public.rooms)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_round public.room_rounds%rowtype;
  v_truth text;
  v_finders int;
begin
  select * into v_round from public.room_rounds
  where room_id = p_room.id and game_no = p_room.game_no and round_no = p_room.round;
  select norm into v_truth from public.room_answers
  where room_id = p_room.id and game_no = p_room.game_no and round_no = p_room.round
    and user_id = v_round.subject_id;

  -- Finding the truth: by voting for it, or by writing it as a "fake".
  update public.room_answers
  set found = true, points = points + 500
  where room_id = p_room.id and game_no = p_room.game_no and round_no = p_room.round
    and user_id <> v_round.subject_id and (vote_norm = v_truth or truth_match);

  -- Each fake scores for every friend it fooled.
  update public.room_answers a
  set fooled = f.n, points = a.points + 500 * f.n
  from (
    select v.vote_norm, count(*)::int as n
    from public.room_answers v
    where v.room_id = p_room.id and v.game_no = p_room.game_no and v.round_no = p_room.round
      and v.vote_norm is not null and v.vote_norm <> v_truth
    group by v.vote_norm
  ) f
  where a.room_id = p_room.id and a.game_no = p_room.game_no and a.round_no = p_room.round
    and a.norm = f.vote_norm and not a.truth_match and a.user_id <> v_round.subject_id;

  -- The subject scores for every friend who knew them.
  select count(*) into v_finders from public.room_answers a
  where a.room_id = p_room.id and a.game_no = p_room.game_no and a.round_no = p_room.round
    and a.found;
  update public.room_answers set points = points + 250 * v_finders
  where room_id = p_room.id and game_no = p_room.game_no and round_no = p_room.round
    and user_id = v_round.subject_id;

  update public.room_players p set score = p.score + a.points
  from public.room_answers a
  where a.room_id = p_room.id and a.game_no = p_room.game_no and a.round_no = p_room.round
    and p.room_id = a.room_id and p.user_id = a.user_id;
end;
$$;

create function public.party_score_same_brain(p_room public.rooms)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.room_answers a
  set points = 100 * g.n
  from (
    select norm, count(*)::int as n
    from public.room_answers
    where room_id = p_room.id and game_no = p_room.game_no and round_no = p_room.round
      and text is not null and norm <> ''
    group by norm
    having count(*) >= 2
  ) g
  where a.room_id = p_room.id and a.game_no = p_room.game_no and a.round_no = p_room.round
    and a.norm = g.norm;

  update public.room_players p set score = p.score + a.points
  from public.room_answers a
  where a.room_id = p_room.id and a.game_no = p_room.game_no and a.round_no = p_room.round
    and p.room_id = a.room_id and p.user_id = a.user_id and a.points > 0;
end;
$$;

-- Move the room on as far as it can go right now: everyone is in, or time is up.
create function public.party_advance(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_round public.room_rounds%rowtype;
  v_players int;
  v_in int;
  v_truth text;
  v_steps int := 0;
begin
  loop
    v_steps := v_steps + 1;
    exit when v_steps > 50;
    select * into v_room from public.rooms where id = p_room_id;
    exit when v_room.status <> 'playing';
    select * into v_round from public.room_rounds
    where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round;
    select count(*) into v_players from public.room_players where room_id = v_room.id;

    if v_room.phase in ('write', 'answer') then
      select count(*) into v_in from public.room_answers
      where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
        and text is not null;
      exit when v_in < v_players and now() < v_room.phase_ends_at;

      if v_room.phase = 'answer' then
        perform public.party_score_same_brain(v_room);
        update public.rooms set phase = 'reveal',
          phase_ends_at = now() + make_interval(secs => public.party_rule('secs_reveal'))
        where id = v_room.id;
      else
        select norm into v_truth from public.room_answers
        where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
          and user_id = v_round.subject_id and text is not null;
        if v_truth is not null then
          update public.room_answers set truth_match = true
          where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
            and user_id <> v_round.subject_id and norm = v_truth;
        end if;
        if v_truth is null or not exists (
          select 1 from public.room_answers
          where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
            and user_id <> v_round.subject_id and text is not null and not truth_match
        ) then
          -- Nothing to vote on: the subject didn't answer, or nobody wrote a fake.
          update public.room_rounds set skipped = true
          where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round;
          if v_truth is not null then
            perform public.party_score_fake_it(v_room);
          end if;
          update public.rooms set phase = 'reveal',
            phase_ends_at = now() + make_interval(secs => public.party_rule('secs_reveal'))
          where id = v_room.id;
        else
          update public.rooms set phase = 'vote',
            phase_ends_at = now() + make_interval(secs => public.party_rule('secs_vote'))
          where id = v_room.id;
        end if;
      end if;

    elsif v_room.phase = 'vote' then
      -- Voters: everyone but the subject and anyone who already wrote the truth.
      select count(*) into v_in
      from public.room_players p
      where p.room_id = v_room.id and p.user_id <> v_round.subject_id
        and not exists (
          select 1 from public.room_answers a
          where a.room_id = v_room.id and a.game_no = v_room.game_no
            and a.round_no = v_room.round and a.user_id = p.user_id
            and (a.vote_norm is not null or a.truth_match)
        );
      exit when v_in > 0 and now() < v_room.phase_ends_at;
      perform public.party_score_fake_it(v_room);
      update public.rooms set phase = 'reveal',
        phase_ends_at = now() + make_interval(secs => public.party_rule('secs_reveal'))
      where id = v_room.id;

    elsif v_room.phase = 'reveal' then
      exit when now() < v_room.phase_ends_at;
      perform public.party_next(v_room.id);

    else
      exit;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a player sees
-- ---------------------------------------------------------------------------
create function public.party_view(p_room_id uuid, p_uid uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_round public.room_rounds%rowtype;
  v_prompt text;
  v_subject_name text;
  v_mine public.room_answers%rowtype;
  v_truth public.room_answers%rowtype;
  v_reveal jsonb;
  v_awards jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_round from public.room_rounds
  where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round;
  select name into v_subject_name from public.room_players
  where room_id = v_room.id and user_id = v_round.subject_id;
  select replace(text, '{name}', coalesce(v_subject_name, 'them')) into v_prompt
  from public.party_prompts where id = v_round.prompt_id;
  select * into v_mine from public.room_answers
  where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
    and user_id = p_uid;

  if v_room.phase = 'reveal' and v_room.game = 'fake_it' then
    select * into v_truth from public.room_answers
    where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
      and user_id = v_round.subject_id;
    v_reveal := jsonb_build_object(
      'skipped', v_round.skipped,
      'truth', v_truth.text,
      'subject_points', coalesce(v_truth.points, 0),
      'finders', coalesce((
        select jsonb_agg(p.name order by p.joined_at)
        from public.room_answers a join public.room_players p
          on p.room_id = a.room_id and p.user_id = a.user_id
        where a.room_id = v_room.id and a.game_no = v_room.game_no
          and a.round_no = v_room.round and a.found
      ), '[]'::jsonb),
      'fakes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'text', o.text,
          'authors', (select jsonb_agg(p.name order by p.joined_at) from public.room_players p
                      where p.room_id = v_room.id and p.user_id = any (o.authors)),
          'fooled', coalesce((
            select jsonb_agg(p.name order by p.joined_at)
            from public.room_answers v join public.room_players p
              on p.room_id = v.room_id and p.user_id = v.user_id
            where v.room_id = v_room.id and v.game_no = v_room.game_no
              and v.round_no = v_room.round and v.vote_norm = o.norm
          ), '[]'::jsonb),
          'points', 500 * (select count(*) from public.room_answers v
                           where v.room_id = v_room.id and v.game_no = v_room.game_no
                             and v.round_no = v_room.round and v.vote_norm = o.norm),
          'mine', p_uid = any (o.authors)
        ) order by o.idx)
        from public.party_options(v_room.id, v_room.game_no, v_room.round) o
        where o.norm is distinct from v_truth.norm
      ), '[]'::jsonb)
    );
  elsif v_room.phase = 'reveal' then
    v_reveal := jsonb_build_object(
      'groups', coalesce((
        select jsonb_agg(g order by g.n desc, g.text)
        from (
          select min(a.text) as text, count(*)::int as n, max(a.points) as points,
                 jsonb_agg(p.name order by p.joined_at) as names
          from public.room_answers a join public.room_players p
            on p.room_id = a.room_id and p.user_id = a.user_id
          where a.room_id = v_room.id and a.game_no = v_room.game_no
            and a.round_no = v_room.round and a.text is not null
          group by a.norm
        ) g
      ), '[]'::jsonb)
    );
  end if;

  if v_room.status = 'done' then
    v_awards := public.party_awards(v_room);
  end if;

  return jsonb_build_object(
    'code', v_room.code,
    'game', v_room.game,
    'status', v_room.status,
    'game_no', v_room.game_no,
    'round', v_room.round,
    'total_rounds', v_room.total_rounds,
    'phase', v_room.phase,
    'seconds_left', case when v_room.phase_ends_at is null then null
      else greatest(0, ceil(extract(epoch from v_room.phase_ends_at - now())))::int end,
    'max_players', public.party_rule('max_players'),
    'min_players', public.party_rule(case when v_room.game = 'fake_it'
      then 'min_fake_it' else 'min_same_brain' end),
    'is_host', v_room.host_id = p_uid,
    'prompt', v_prompt,
    'subject', v_subject_name,
    'is_subject', v_round.subject_id = p_uid,
    'my_answer', v_mine.text,
    'my_vote_done', v_mine.vote_norm is not null,
    'wrote_truth', coalesce(v_mine.truth_match, false),
    'players', (
      select jsonb_agg(jsonb_build_object(
        'name', p.name,
        'score', p.score,
        'is_host', p.is_host,
        'is_me', p.user_id = p_uid,
        'done', case
          when v_room.phase in ('write', 'answer') then a.text is not null
          when v_room.phase = 'vote' then
            p.user_id = v_round.subject_id or a.vote_norm is not null or coalesce(a.truth_match, false)
          else false end
      ) order by p.score desc, p.joined_at)
      from public.room_players p
      left join public.room_answers a
        on a.room_id = p.room_id and a.user_id = p.user_id
       and a.game_no = v_room.game_no and a.round_no = v_room.round
      where p.room_id = v_room.id
    ),
    'options', case when v_room.phase = 'vote' then (
      select jsonb_agg(jsonb_build_object('index', o.idx, 'text', o.text, 'mine', p_uid = any (o.authors))
                       order by o.idx)
      from public.party_options(v_room.id, v_room.game_no, v_room.round) o
    ) end,
    'reveal', v_reveal,
    'awards', v_awards
  );
end;
$$;

-- End-of-game awards: [{title, name, detail}].
create function public.party_awards(p_room public.rooms)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_row record;
begin
  if p_room.game = 'fake_it' then
    select p.name, sum(a.fooled)::int as n into v_row
    from public.room_answers a join public.room_players p
      on p.room_id = a.room_id and p.user_id = a.user_id
    where a.room_id = p_room.id and a.game_no = p_room.game_no
    group by p.name having sum(a.fooled) > 0
    order by 2 desc, 1 limit 1;
    if found then
      v_out := v_out || jsonb_build_object('title', 'Smoothest liar', 'name', v_row.name,
        'detail', 'fooled friends ' || v_row.n || case when v_row.n = 1 then ' time' else ' times' end);
    end if;

    select p.name, count(*)::int as n into v_row
    from public.room_answers a join public.room_players p
      on p.room_id = a.room_id and p.user_id = a.user_id
    where a.room_id = p_room.id and a.game_no = p_room.game_no and a.found
    group by p.name order by 2 desc, 1 limit 1;
    if found then
      v_out := v_out || jsonb_build_object('title', 'Truth detector', 'name', v_row.name,
        'detail', 'found the truth ' || v_row.n || case when v_row.n = 1 then ' time' else ' times' end);
    end if;

    select a.text, p.name, a.fooled as n into v_row
    from public.room_answers a join public.room_players p
      on p.room_id = a.room_id and p.user_id = a.user_id
    where a.room_id = p_room.id and a.game_no = p_room.game_no and a.fooled > 0
    order by a.fooled desc, a.round_no limit 1;
    if found then
      v_out := v_out || jsonb_build_object('title', 'Most believable fake',
        'name', '"' || v_row.text || '" by ' || v_row.name,
        'detail', v_row.n || case when v_row.n = 1 then ' friend' else ' friends' end || ' fell for it');
    end if;

    select p.name, count(*)::int as n into v_row
    from public.room_rounds r
    join public.room_answers a on a.room_id = r.room_id and a.game_no = r.game_no
      and a.round_no = r.round_no and a.user_id = r.subject_id
    join public.room_players p on p.room_id = r.room_id and p.user_id = r.subject_id
    where r.room_id = p_room.id and r.game_no = p_room.game_no and not r.skipped
      and not exists (
        select 1 from public.room_answers f
        where f.room_id = r.room_id and f.game_no = r.game_no and f.round_no = r.round_no and f.found
      )
    group by p.name order by 2 desc, 1 limit 1;
    if found then
      v_out := v_out || jsonb_build_object('title', 'Hardest to read', 'name', v_row.name,
        'detail', 'nobody found their truth ' || v_row.n || case when v_row.n = 1 then ' time' else ' times' end);
    end if;
  else
    select pa.name || ' + ' || pb.name as name, count(*)::int as n into v_row
    from public.room_answers a
    join public.room_answers b on b.room_id = a.room_id and b.game_no = a.game_no
      and b.round_no = a.round_no and a.user_id < b.user_id and a.norm = b.norm
    join public.room_players pa on pa.room_id = a.room_id and pa.user_id = a.user_id
    join public.room_players pb on pb.room_id = b.room_id and pb.user_id = b.user_id
    where a.room_id = p_room.id and a.game_no = p_room.game_no
      and a.text is not null and b.text is not null and a.norm <> ''
    group by 1 order by 2 desc, 1 limit 1;
    if found then
      v_out := v_out || jsonb_build_object('title', 'Same brain', 'name', v_row.name,
        'detail', 'matched ' || v_row.n || ' of ' || p_room.total_rounds);
    end if;

    select p.name, count(*)::int as n into v_row
    from public.room_answers a join public.room_players p
      on p.room_id = a.room_id and p.user_id = a.user_id
    where a.room_id = p_room.id and a.game_no = p_room.game_no and a.text is not null
      and a.points = 0
    group by p.name order by 2 desc, 1 limit 1;
    if found then
      v_out := v_out || jsonb_build_object('title', 'On another planet', 'name', v_row.name,
        'detail', 'matched nobody ' || v_row.n || case when v_row.n = 1 then ' time' else ' times' end);
    end if;
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- What players can call
-- ---------------------------------------------------------------------------

-- Host opens a room. Returns {code}.
create function public.create_room(p_game text, p_host_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_creator();
  v_name text := btrim(p_host_name);
  v_room_id uuid;
  v_code text;
begin
  if p_game is null or p_game not in ('fake_it', 'same_brain') then
    raise exception 'invalid_game' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 24 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  v_code := public.new_room_code();
  insert into public.rooms (code, host_id, game, total_rounds)
  values (v_code, v_uid, p_game, public.party_rule('rounds_' || p_game))
  returning id into v_room_id;
  insert into public.room_players (room_id, user_id, name, is_host)
  values (v_room_id, v_uid, v_name, true);
  return jsonb_build_object('code', v_code);
end;
$$;

-- Anyone with the code: what kind of room it is, before joining.
create function public.room_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', r.code,
    'game', r.game,
    'status', r.status,
    'host_name', (select name from public.room_players where room_id = r.id and is_host),
    'players', (select count(*) from public.room_players where room_id = r.id),
    'max_players', public.party_rule('max_players'),
    'joined', exists (select 1 from public.room_players
                      where room_id = r.id and user_id = auth.uid())
  )
  from public.rooms r
  where r.code = upper(btrim(p_code));
$$;

-- Join a room in its lobby with a display name (guests welcome).
create function public.join_room(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_room public.rooms%rowtype;
begin
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = v_uid) then
    return jsonb_build_object('code', v_room.code);
  end if;
  if v_name is null or char_length(v_name) not between 1 and 24 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'room_started' using errcode = '22023';
  end if;
  if exists (select 1 from public.room_players
             where room_id = v_room.id and lower(name) = lower(v_name)) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  if (select count(*) from public.room_players where room_id = v_room.id)
     >= public.party_rule('max_players') then
    raise exception 'room_full' using errcode = '22023';
  end if;
  insert into public.room_players (room_id, user_id, name) values (v_room.id, v_uid, v_name);
  return jsonb_build_object('code', v_room.code);
end;
$$;

-- The room as the caller sees it. Polled every couple of seconds; also moves the
-- game on when everyone is in or the timer has run out.
create function public.room_state(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype := public.party_my_room(p_code);
begin
  perform public.party_advance(v_room.id);
  return public.party_view(v_room.id, auth.uid());
end;
$$;

-- Host starts the game (or the next game, from the end screen).
create function public.start_room(p_code text, p_game text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype := public.party_my_room(p_code);
  v_game text := coalesce(p_game, v_room.game);
begin
  if v_room.host_id <> auth.uid() then
    raise exception 'host_only' using errcode = '42501';
  end if;
  if v_game not in ('fake_it', 'same_brain') then
    raise exception 'invalid_game' using errcode = '22023';
  end if;
  if v_room.status = 'playing' then
    raise exception 'room_started' using errcode = '22023';
  end if;
  if (select count(*) from public.room_players where room_id = v_room.id)
     < public.party_rule('min_' || v_game) then
    raise exception 'need_players' using errcode = '22023';
  end if;
  update public.room_players set score = 0 where room_id = v_room.id;
  update public.rooms
  set status = 'playing', game = v_game,
      game_no = case when v_room.status = 'done' then game_no + 1 else game_no end,
      total_rounds = public.party_rule('rounds_' || v_game)
  where id = v_room.id;
  perform public.party_begin_round(v_room.id, 1::smallint);
  return public.party_view(v_room.id, auth.uid());
end;
$$;

-- Type your answer (Fake It: the truth if it's about you, else a fake;
-- Same Brain: your word). Can be changed until the phase ends.
create function public.submit_room_answer(p_code text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype := public.party_my_room(p_code);
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
begin
  perform public.party_advance(v_room.id);
  select * into v_room from public.rooms where id = v_room.id;
  if v_room.status <> 'playing' or v_room.phase not in ('write', 'answer') then
    raise exception 'too_late' using errcode = '22023';
  end if;
  if char_length(v_text) not between 1 and 40 or public.party_norm(v_text) = '' then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;
  insert into public.room_answers (room_id, game_no, round_no, user_id, text, norm)
  values (v_room.id, v_room.game_no, v_room.round, auth.uid(), v_text, public.party_norm(v_text))
  on conflict (room_id, game_no, round_no, user_id)
  do update set text = excluded.text, norm = excluded.norm;
  perform public.party_advance(v_room.id);
  return public.party_view(v_room.id, auth.uid());
end;
$$;

-- Fake It: vote for the answer you think is real (its index in `options`).
create function public.submit_room_vote(p_code text, p_index int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype := public.party_my_room(p_code);
  v_round public.room_rounds%rowtype;
  v_option record;
begin
  perform public.party_advance(v_room.id);
  select * into v_room from public.rooms where id = v_room.id;
  if v_room.status <> 'playing' or v_room.phase is distinct from 'vote' then
    raise exception 'too_late' using errcode = '22023';
  end if;
  select * into v_round from public.room_rounds
  where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round;
  if v_round.subject_id = auth.uid() or exists (
    select 1 from public.room_answers
    where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
      and user_id = auth.uid() and (truth_match or vote_norm is not null)
  ) then
    raise exception 'cannot_vote' using errcode = '22023';
  end if;
  select * into v_option from public.party_options(v_room.id, v_room.game_no, v_room.round)
  where idx = p_index;
  if not found then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  if auth.uid() = any (v_option.authors) then
    raise exception 'own_answer' using errcode = '22023';
  end if;
  insert into public.room_answers (room_id, game_no, round_no, user_id, vote_norm)
  values (v_room.id, v_room.game_no, v_room.round, auth.uid(), v_option.norm)
  on conflict (room_id, game_no, round_no, user_id) do update set vote_norm = excluded.vote_norm;
  perform public.party_advance(v_room.id);
  return public.party_view(v_room.id, auth.uid());
end;
$$;

-- Host skips the rest of a reveal.
create function public.next_room_round(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype := public.party_my_room(p_code);
begin
  if v_room.host_id <> auth.uid() then
    raise exception 'host_only' using errcode = '42501';
  end if;
  if v_room.status = 'playing' and v_room.phase = 'reveal' then
    perform public.party_next(v_room.id);
  end if;
  return public.party_view(v_room.id, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- The free prompts
-- ---------------------------------------------------------------------------
insert into public.party_prompts (game, text) values
  ('fake_it', 'In school, {name}''s nickname was ___'),
  ('fake_it', '{name}''s phone wallpaper right now is ___'),
  ('fake_it', 'The last thing {name} ordered online was ___'),
  ('fake_it', '{name}''s most-used emoji is ___'),
  ('fake_it', 'The food {name} secretly can''t stand is ___'),
  ('fake_it', '{name}''s go-to karaoke song is ___'),
  ('fake_it', 'If {name} had a reality show, it would be called ___'),
  ('fake_it', 'The celebrity {name} was told they look like is ___'),
  ('fake_it', '{name}''s first phone was a ___'),
  ('fake_it', 'The app {name} spends the most time on is ___'),
  ('fake_it', '{name}''s comfort movie is ___'),
  ('fake_it', 'The first thing {name} does after waking up is ___'),
  ('fake_it', '{name}''s worst haircut was inspired by ___'),
  ('fake_it', 'The weirdest thing in {name}''s bag right now is ___'),
  ('fake_it', '{name}''s dream job as a kid was ___'),
  ('fake_it', 'The subject {name} was worst at in school was ___'),
  ('fake_it', '{name}''s go-to Maggi upgrade is ___'),
  ('fake_it', 'The last song stuck in {name}''s head was ___'),
  ('fake_it', '{name} once cried watching ___'),
  ('fake_it', '{name}''s most embarrassing purchase was ___'),
  ('fake_it', 'The city {name} would move to tomorrow is ___'),
  ('fake_it', '{name}''s signature dance move is called ___'),
  ('fake_it', 'The contact {name} has saved with the strangest name is ___'),
  ('fake_it', '{name}''s biggest irrational fear is ___'),
  ('fake_it', 'The snack {name} hides from everyone is ___'),
  ('fake_it', '{name}''s first email ID had the word ___ in it'),
  ('fake_it', 'The excuse {name} uses most to skip plans is ___'),
  ('fake_it', '{name}''s favourite cartoon as a kid was ___'),
  ('fake_it', 'The thing {name} always forgets when travelling is ___'),
  ('fake_it', '{name}''s unpopular food opinion is that ___ is overrated'),
  ('fake_it', 'The pet {name} would get if allowed is a ___'),
  ('fake_it', '{name}''s most-repeated outfit colour is ___'),
  ('fake_it', 'The festival {name} looks forward to most is ___'),
  ('fake_it', '{name}''s secret talent is ___'),
  ('fake_it', 'The first concert {name} went to was ___'),
  ('fake_it', '{name}''s favourite word to overuse is ___'),
  ('fake_it', 'The game {name} was obsessed with as a kid was ___'),
  ('fake_it', '{name}''s chai order is ___'),
  ('fake_it', 'The last thing {name} googled was ___'),
  ('fake_it', '{name}''s most visited place in the city is ___'),
  ('fake_it', 'The relative {name} avoids at weddings is their ___'),
  ('fake_it', '{name}''s wifi name at home is ___'),
  ('fake_it', 'The show {name} has rewatched the most is ___'),
  ('fake_it', '{name} would spend a free ₹10,000 on ___'),
  ('fake_it', 'The age {name} learnt to cycle is ___'),
  ('fake_it', '{name}''s go-to order at a dhaba is ___'),
  ('fake_it', 'The thing {name} collected as a kid was ___'),
  ('fake_it', '{name}''s worst travel story involves a ___'),
  ('fake_it', 'The cricketer {name} had a poster of was ___'),
  ('fake_it', '{name}''s middle name is ___'),
  ('fake_it', 'The thing {name} is weirdly good at cooking is ___'),
  ('fake_it', '{name}''s ideal Sunday starts with ___'),
  ('fake_it', 'The name {name} would give a pet goat is ___'),
  ('fake_it', '{name}''s strangest habit is ___'),
  ('fake_it', 'The song {name} plays to get hyped is ___'),
  ('fake_it', '{name}''s first salary or pocket money went on ___'),
  ('fake_it', 'The brand {name} is most loyal to is ___'),
  ('fake_it', '{name}''s phone battery is usually at ___ percent'),
  ('fake_it', 'The board game {name} always wins is ___'),
  ('fake_it', 'The one word {name}''s mom uses to describe them is ___'),
  ('same_brain', 'Something you''d find in the Mumbai rains'),
  ('same_brain', 'A Shah Rukh Khan movie'),
  ('same_brain', 'The best street food'),
  ('same_brain', 'Something every Indian mom says'),
  ('same_brain', 'A reason to be late'),
  ('same_brain', 'A hill station'),
  ('same_brain', 'Something in a wedding buffet'),
  ('same_brain', 'A thing you lose all the time'),
  ('same_brain', 'A cricketer'),
  ('same_brain', 'Something yellow'),
  ('same_brain', 'A Bollywood villain'),
  ('same_brain', 'A breakfast food'),
  ('same_brain', 'Something you do on a long train journey'),
  ('same_brain', 'A festival'),
  ('same_brain', 'A word that means tired'),
  ('same_brain', 'Something in your fridge right now'),
  ('same_brain', 'A Diwali sweet'),
  ('same_brain', 'A type of chai'),
  ('same_brain', 'Something you''d take to Goa'),
  ('same_brain', 'A superhero'),
  ('same_brain', 'An app everyone has'),
  ('same_brain', 'A city that never sleeps'),
  ('same_brain', 'Something at a dhaba'),
  ('same_brain', 'A thing your dad fixes with tape'),
  ('same_brain', 'A colour of a car'),
  ('same_brain', 'A fruit'),
  ('same_brain', 'A cartoon from the 90s'),
  ('same_brain', 'Something that''s always on TV'),
  ('same_brain', 'A pizza topping'),
  ('same_brain', 'Something you shout at a cricket match'),
  ('same_brain', 'A school subject'),
  ('same_brain', 'Something in a backpack'),
  ('same_brain', 'A famous dance move'),
  ('same_brain', 'A board game'),
  ('same_brain', 'A musical instrument'),
  ('same_brain', 'Something cold'),
  ('same_brain', 'A word to describe Monday'),
  ('same_brain', 'A monsoon snack'),
  ('same_brain', 'A reason to call in sick'),
  ('same_brain', 'A thing you buy at a railway station'),
  ('same_brain', 'A Bollywood song for a sangeet'),
  ('same_brain', 'A country you want to visit'),
  ('same_brain', 'An animal at the zoo'),
  ('same_brain', 'Something you find at a beach'),
  ('same_brain', 'A drink at a party'),
  ('same_brain', 'A brand of biscuit'),
  ('same_brain', 'A famous Indian dish'),
  ('same_brain', 'A thing in a first aid kit'),
  ('same_brain', 'Something you''d find in a kitchen drawer'),
  ('same_brain', 'A sport other than cricket'),
  ('same_brain', 'A wedding outfit'),
  ('same_brain', 'A movie that makes you cry'),
  ('same_brain', 'Something sticky'),
  ('same_brain', 'A type of shoe'),
  ('same_brain', 'A thing people do at 2 am'),
  ('same_brain', 'A gift you''d give a teacher'),
  ('same_brain', 'A place to go on a first date'),
  ('same_brain', 'A word you say when you''re surprised'),
  ('same_brain', 'A smell you love'),
  ('same_brain', 'Something in a hostel room'),
  ('same_brain', 'A vegetable kids hate'),
  ('same_brain', 'A popular web series'),
  ('same_brain', 'Something that''s always broken in an office'),
  ('same_brain', 'A superstition'),
  ('same_brain', 'A kind of bread'),
  ('same_brain', 'A thing you do on a Sunday'),
  ('same_brain', 'An emoji everyone uses'),
  ('same_brain', 'A hot drink'),
  ('same_brain', 'A famous building'),
  ('same_brain', 'A nickname for a younger brother'),
  ('same_brain', 'Something in a lunch box'),
  ('same_brain', 'A month with the best weather'),
  ('same_brain', 'A Hindi word everyone knows'),
  ('same_brain', 'Something round'),
  ('same_brain', 'A thing you''d find in a temple'),
  ('same_brain', 'A job every kid wants'),
  ('same_brain', 'A thing you charge'),
  ('same_brain', 'Something that comes in a pair'),
  ('same_brain', 'A fast food chain'),
  ('same_brain', 'A planet'),
  ('same_brain', 'A rainy day movie'),
  ('same_brain', 'Something that buzzes'),
  ('same_brain', 'A thing at a mela'),
  ('same_brain', 'A pet name for a dog'),
  ('same_brain', 'A sound at night'),
  ('same_brain', 'A famous IPL team'),
  ('same_brain', 'Something in an auto rickshaw'),
  ('same_brain', 'A shape'),
  ('same_brain', 'A breakfast in South India'),
  ('same_brain', 'Something you''d hide from your parents'),
  ('same_brain', 'A season'),
  ('same_brain', 'A thing you need for a picnic'),
  ('same_brain', 'Something that''s spicy'),
  ('same_brain', 'A thing at a birthday party'),
  ('same_brain', 'A thing you do when bored'),
  ('same_brain', 'Something you''d find in a garden'),
  ('same_brain', 'A popular YouTuber topic'),
  ('same_brain', 'Something made of glass'),
  ('same_brain', 'A thing you''d pack for Manali'),
  ('same_brain', 'A word that rhymes with cat'),
  ('same_brain', 'A thing that''s always too expensive at the airport');

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.party_rule(text), public.party_norm(text), public.new_room_code(),
  public.party_my_room(text), public.party_pick_prompt(public.rooms),
  public.party_begin_round(uuid, smallint), public.party_next(uuid),
  public.party_options(uuid, smallint, smallint), public.party_score_fake_it(public.rooms),
  public.party_score_same_brain(public.rooms), public.party_advance(uuid),
  public.party_view(uuid, uuid), public.party_awards(public.rooms),
  public.create_room(text, text), public.room_preview(text), public.join_room(text, text),
  public.room_state(text), public.start_room(text, text), public.submit_room_answer(text, text),
  public.submit_room_vote(text, int), public.next_room_round(text)
from public, anon, authenticated;

grant execute on function public.room_preview(text) to anon, authenticated;
grant execute on function
  public.create_room(text, text), public.join_room(text, text), public.room_state(text),
  public.start_room(text, text), public.submit_room_answer(text, text),
  public.submit_room_vote(text, int), public.next_room_round(text)
to authenticated;
