-- Killer: the chit game, live in a party room.
--
-- Each round the database deals secret roles: 1 killer, 1 police, the rest
-- villagers. Every phone knows only its own role.
--
--  * The killer picks victims one by one, at least 10 s apart (and not in the
--    first 10 s). Picking the police gets the killer caught: the village wins.
--    The killer wins at 2 kills (4-6 players) or 3 kills (7-8 players).
--  * The police has one accusation, any time: right, the village wins;
--    wrong, the killer wins.
--  * Living villagers can mark a secret suspect; only the police sees how many
--    villagers suspect each person.
--  * A round lasts 3 minutes. If the killer hasn't won by then, the village wins.
--
-- Points: killer win +1000 to the killer. Village win +1000 to the police
-- (+500 if the killer walked into them), +300 to each villager still alive, and
-- +200 to every villager whose suspect was the killer.
--
-- Free rooms now hold 8 players (was 5), so Killer works for a real group.

alter table public.rooms drop constraint rooms_game_check;
alter table public.rooms add constraint rooms_game_check
  check (game in ('fake_it', 'same_brain', 'killer'));
alter table public.rooms drop constraint rooms_phase_check;
alter table public.rooms add constraint rooms_phase_check
  check (phase in ('write', 'vote', 'answer', 'night', 'reveal'));

alter table public.room_rounds
  alter column prompt_id drop not null,
  add column started_at timestamptz not null default now(),
  add column kills_needed smallint,
  add column winner text check (winner in ('killer', 'village')),
  add column ended_reason text
    check (ended_reason in ('kills', 'caught_police', 'accused_right', 'accused_wrong', 'time')),
  add column accused_id uuid references auth.users (id) on delete set null;

create table public.room_roles (
  room_id uuid not null,
  game_no smallint not null,
  round_no smallint not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('killer', 'police', 'villager')),
  dead_at timestamptz,
  suspect_id uuid references auth.users (id) on delete set null,
  points integer not null default 0,
  primary key (room_id, game_no, round_no, user_id),
  foreign key (room_id, game_no, round_no)
    references public.room_rounds (room_id, game_no, round_no) on delete cascade
);
alter table public.room_roles enable row level security;
revoke all on public.room_roles from anon, authenticated;

create or replace function public.party_rule(p_key text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'max_players' then 8          -- free rooms; the Party pass will raise this
    when 'min_fake_it' then 3
    when 'min_same_brain' then 2
    when 'min_killer' then 4
    when 'rounds_fake_it' then 6
    when 'rounds_same_brain' then 10
    when 'rounds_killer' then 5
    when 'secs_write' then 60
    when 'secs_vote' then 30
    when 'secs_answer' then 25
    when 'secs_reveal' then 30
    when 'secs_night' then 180
    when 'secs_kill_gap' then 10
  end;
$$;

-- ---------------------------------------------------------------------------
-- Rounds: Killer deals roles; the word games work as before.
-- ---------------------------------------------------------------------------
alter function public.party_begin_round(uuid, smallint) rename to party_begin_round_words;

create function public.party_begin_round(p_room_id uuid, p_round smallint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_players int;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.game <> 'killer' then
    perform public.party_begin_round_words(p_room_id, p_round);
    return;
  end if;

  select count(*) into v_players from public.room_players where room_id = p_room_id;
  insert into public.room_rounds (room_id, game_no, round_no, kills_needed)
  values (p_room_id, v_room.game_no, p_round, case when v_players <= 6 then 2 else 3 end);

  insert into public.room_roles (room_id, game_no, round_no, user_id, role)
  select p_room_id, v_room.game_no, p_round, d.user_id,
         case d.n when 1 then 'killer' when 2 then 'police' else 'villager' end
  from (
    select user_id, row_number() over (order by random()) as n
    from public.room_players where room_id = p_room_id
  ) d;

  update public.rooms
  set round = p_round, phase = 'night',
      phase_ends_at = now() + make_interval(secs => public.party_rule('secs_night'))
  where id = p_room_id;
end;
$$;

-- End a Killer round: record who won and why, hand out points, show the reveal.
create function public.killer_end(p_room public.rooms, p_winner text, p_reason text,
                                  p_accused uuid default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_killer uuid;
begin
  select user_id into v_killer from public.room_roles
  where room_id = p_room.id and game_no = p_room.game_no and round_no = p_room.round
    and role = 'killer';

  update public.room_rounds
  set winner = p_winner, ended_reason = p_reason, accused_id = p_accused
  where room_id = p_room.id and game_no = p_room.game_no and round_no = p_room.round;

  update public.room_roles r
  set points = case
    when p_winner = 'killer' then case when r.role = 'killer' then 1000 else 0 end
    when r.role = 'police' then case when p_reason = 'caught_police' then 500 else 1000 end
    when r.role = 'villager' then
      (case when r.dead_at is null then 300 else 0 end)
      + (case when r.suspect_id = v_killer then 200 else 0 end)
    else 0 end
  where r.room_id = p_room.id and r.game_no = p_room.game_no and r.round_no = p_room.round;

  -- Suspects were marked to win; reward them even if their villager died.
  update public.room_players p set score = p.score + r.points
  from public.room_roles r
  where r.room_id = p_room.id and r.game_no = p_room.game_no and r.round_no = p_room.round
    and p.room_id = r.room_id and p.user_id = r.user_id;

  update public.rooms set phase = 'reveal',
    phase_ends_at = now() + make_interval(secs => public.party_rule('secs_reveal'))
  where id = p_room.id;
end;
$$;

alter function public.party_advance(uuid) rename to party_advance_words;

create function public.party_advance(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id;
  -- The 3 minutes ran out with the killer short of kills: the village survives.
  if v_room.status = 'playing' and v_room.phase = 'night' and now() >= v_room.phase_ends_at then
    perform public.killer_end(v_room, 'village', 'time');
  end if;
  perform public.party_advance_words(p_room_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Moves
-- ---------------------------------------------------------------------------

-- The caller's role this round, or raises.
create function public.killer_my_role(p_room public.rooms)
returns public.room_roles
language plpgsql
set search_path = ''
as $$
declare
  v_role public.room_roles%rowtype;
begin
  if p_room.game <> 'killer' or p_room.status <> 'playing'
     or p_room.phase is distinct from 'night' then
    raise exception 'too_late' using errcode = '22023';
  end if;
  select * into v_role from public.room_roles
  where room_id = p_room.id and game_no = p_room.game_no and round_no = p_room.round
    and user_id = auth.uid();
  if not found then
    raise exception 'not_in_room' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- A living player in the round, by their name in the room.
create function public.killer_target(p_room public.rooms, p_name text)
returns public.room_roles
language plpgsql
set search_path = ''
as $$
declare
  v_role public.room_roles%rowtype;
begin
  select r.* into v_role
  from public.room_roles r
  join public.room_players p on p.room_id = r.room_id and p.user_id = r.user_id
  where r.room_id = p_room.id and r.game_no = p_room.game_no and r.round_no = p_room.round
    and lower(p.name) = lower(btrim(p_name)) and r.dead_at is null;
  if not found or v_role.user_id = auth.uid() then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  return v_role;
end;
$$;

-- Killer: kill someone. Picking the police ends the round in the village's favour.
create function public.killer_kill(p_code text, p_target text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype := public.party_my_room(p_code);
  v_me public.room_roles%rowtype;
  v_target public.room_roles%rowtype;
  v_round public.room_rounds%rowtype;
  v_last timestamptz;
  v_kills int;
begin
  perform public.party_advance(v_room.id);
  select * into v_room from public.rooms where id = v_room.id;
  v_me := public.killer_my_role(v_room);
  if v_me.role <> 'killer' then
    raise exception 'not_your_move' using errcode = '42501';
  end if;
  v_target := public.killer_target(v_room, p_target);
  select * into v_round from public.room_rounds
  where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round;

  select greatest(v_round.started_at, max(dead_at)) into v_last from public.room_roles
  where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round;
  if now() < v_last + make_interval(secs => public.party_rule('secs_kill_gap')) then
    raise exception 'too_soon' using errcode = '22023';
  end if;

  if v_target.role = 'police' then
    perform public.killer_end(v_room, 'village', 'caught_police');
  else
    update public.room_roles set dead_at = now()
    where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
      and user_id = v_target.user_id;
    select count(*) into v_kills from public.room_roles
    where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
      and dead_at is not null;
    if v_kills >= v_round.kills_needed then
      perform public.killer_end(v_room, 'killer', 'kills');
    end if;
  end if;
  return public.party_view(v_room.id, auth.uid());
end;
$$;

-- Police: the one accusation.
create function public.killer_accuse(p_code text, p_target text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype := public.party_my_room(p_code);
  v_me public.room_roles%rowtype;
  v_target public.room_roles%rowtype;
begin
  perform public.party_advance(v_room.id);
  select * into v_room from public.rooms where id = v_room.id;
  v_me := public.killer_my_role(v_room);
  if v_me.role <> 'police' then
    raise exception 'not_your_move' using errcode = '42501';
  end if;
  v_target := public.killer_target(v_room, p_target);
  if v_target.role = 'killer' then
    perform public.killer_end(v_room, 'village', 'accused_right', v_target.user_id);
  else
    perform public.killer_end(v_room, 'killer', 'accused_wrong', v_target.user_id);
  end if;
  return public.party_view(v_room.id, auth.uid());
end;
$$;

-- A living villager marks (or clears, with null) their suspect.
create function public.killer_suspect(p_code text, p_target text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype := public.party_my_room(p_code);
  v_me public.room_roles%rowtype;
  v_target uuid;
begin
  perform public.party_advance(v_room.id);
  select * into v_room from public.rooms where id = v_room.id;
  v_me := public.killer_my_role(v_room);
  if v_me.role <> 'villager' or v_me.dead_at is not null then
    raise exception 'not_your_move' using errcode = '42501';
  end if;
  if p_target is not null then
    v_target := (public.killer_target(v_room, p_target)).user_id;
  end if;
  update public.room_roles set suspect_id = v_target
  where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
    and user_id = auth.uid();
  return public.party_view(v_room.id, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- What a Killer player sees. Roles stay secret until the reveal: the killer
-- never learns who the police is, and a victim never learns who killed them.
-- ---------------------------------------------------------------------------
alter function public.party_view(uuid, uuid) rename to party_view_words;

create function public.party_view(p_room_id uuid, p_uid uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_round public.room_rounds%rowtype;
  v_me public.room_roles%rowtype;
  v_last timestamptz;
  v_night boolean;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.game <> 'killer' then
    return public.party_view_words(p_room_id, p_uid);
  end if;

  select * into v_round from public.room_rounds
  where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round;
  select * into v_me from public.room_roles
  where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
    and user_id = p_uid;
  select greatest(v_round.started_at, max(dead_at)) into v_last from public.room_roles
  where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round;
  v_night := v_room.status = 'playing' and v_room.phase = 'night';

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
    'min_players', public.party_rule('min_killer'),
    'is_host', v_room.host_id = p_uid,
    'prompt', null, 'subject', null, 'is_subject', false, 'my_answer', null,
    'my_vote_done', false, 'wrote_truth', false, 'options', null,
    'players', (
      select jsonb_agg(jsonb_build_object(
        'name', p.name, 'score', p.score, 'is_host', p.is_host, 'is_me', p.user_id = p_uid,
        'done', false,
        'alive', r.dead_at is null
      ) order by p.score desc, p.joined_at)
      from public.room_players p
      left join public.room_roles r on r.room_id = p.room_id and r.user_id = p.user_id
        and r.game_no = v_room.game_no and r.round_no = v_room.round
      where p.room_id = v_room.id
    ),
    'killer', case when v_room.status = 'playing' then jsonb_build_object(
      'role', v_me.role,
      'alive', v_me.dead_at is null,
      'kills', (select count(*) from public.room_roles
                where room_id = v_room.id and game_no = v_room.game_no
                  and round_no = v_room.round and dead_at is not null),
      'kills_needed', v_round.kills_needed,
      -- Only the killer learns when their next kill is allowed.
      'kill_ready_in', case when v_me.role = 'killer' and v_night then greatest(0, ceil(extract(epoch from
          v_last + make_interval(secs => public.party_rule('secs_kill_gap')) - now())))::int end,
      'deaths', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', p.name,
          'after_seconds', floor(extract(epoch from r.dead_at - v_round.started_at))::int
        ) order by r.dead_at)
        from public.room_roles r join public.room_players p
          on p.room_id = r.room_id and p.user_id = r.user_id
        where r.room_id = v_room.id and r.game_no = v_room.game_no
          and r.round_no = v_room.round and r.dead_at is not null
      ), '[]'::jsonb),
      'my_suspect', (select name from public.room_players
                     where room_id = v_room.id and user_id = v_me.suspect_id),
      -- The police's tip sheet: how many living villagers suspect each player.
      'suspects', case when v_me.role = 'police' then coalesce((
        select jsonb_agg(jsonb_build_object('name', p.name, 'count', s.n) order by s.n desc, p.name)
        from (
          select suspect_id, count(*)::int as n from public.room_roles
          where room_id = v_room.id and game_no = v_room.game_no and round_no = v_room.round
            and role = 'villager' and dead_at is null and suspect_id is not null
          group by suspect_id
        ) s join public.room_players p on p.room_id = v_room.id and p.user_id = s.suspect_id
      ), '[]'::jsonb) end,
      'result', case when v_room.phase = 'reveal' then jsonb_build_object(
        'winner', v_round.winner,
        'reason', v_round.ended_reason,
        'accused', (select name from public.room_players
                    where room_id = v_room.id and user_id = v_round.accused_id),
        'roles', (
          select jsonb_agg(jsonb_build_object(
            'name', p.name, 'role', r.role, 'alive', r.dead_at is null,
            'suspect', (select name from public.room_players
                        where room_id = v_room.id and user_id = r.suspect_id),
            'points', r.points, 'is_me', r.user_id = p_uid
          ) order by case r.role when 'killer' then 0 when 'police' then 1 else 2 end, p.joined_at)
          from public.room_roles r join public.room_players p
            on p.room_id = r.room_id and p.user_id = r.user_id
          where r.room_id = v_room.id and r.game_no = v_room.game_no and r.round_no = v_room.round
        )
      ) end
    ) end,
    'reveal', null,
    'awards', case when v_room.status = 'done' then public.killer_awards(v_room) end
  );
end;
$$;

create function public.killer_awards(p_room public.rooms)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_row record;
begin
  select p.name, count(*)::int as n into v_row
  from public.room_roles r
  join public.room_rounds d on d.room_id = r.room_id and d.game_no = r.game_no
    and d.round_no = r.round_no
  join public.room_players p on p.room_id = r.room_id and p.user_id = r.user_id
  where r.room_id = p_room.id and r.game_no = p_room.game_no
    and r.role = 'killer' and d.winner = 'killer'
  group by p.name order by 2 desc, 1 limit 1;
  if found then
    v_out := v_out || jsonb_build_object('title', 'Deadliest killer', 'name', v_row.name,
      'detail', 'got away with it ' || v_row.n || case when v_row.n = 1 then ' time' else ' times' end);
  end if;

  select p.name, count(*)::int as n into v_row
  from public.room_roles r
  join public.room_rounds d on d.room_id = r.room_id and d.game_no = r.game_no
    and d.round_no = r.round_no
  join public.room_players p on p.room_id = r.room_id and p.user_id = r.user_id
  where r.room_id = p_room.id and r.game_no = p_room.game_no
    and r.role = 'police' and d.ended_reason = 'accused_right'
  group by p.name order by 2 desc, 1 limit 1;
  if found then
    v_out := v_out || jsonb_build_object('title', 'Sharpest police', 'name', v_row.name,
      'detail', 'caught the killer ' || v_row.n || case when v_row.n = 1 then ' time' else ' times' end);
  end if;

  select p.name, count(*)::int as n into v_row
  from public.room_roles r
  join public.room_roles k on k.room_id = r.room_id and k.game_no = r.game_no
    and k.round_no = r.round_no and k.role = 'killer' and k.user_id = r.suspect_id
  join public.room_players p on p.room_id = r.room_id and p.user_id = r.user_id
  where r.room_id = p_room.id and r.game_no = p_room.game_no
  group by p.name order by 2 desc, 1 limit 1;
  if found then
    v_out := v_out || jsonb_build_object('title', 'Village detective', 'name', v_row.name,
      'detail', 'suspected the killer ' || v_row.n || case when v_row.n = 1 then ' time' else ' times' end);
  end if;

  select p.name, count(*)::int as n into v_row
  from public.room_roles r
  join public.room_players p on p.room_id = r.room_id and p.user_id = r.user_id
  where r.room_id = p_room.id and r.game_no = p_room.game_no and r.dead_at is not null
    and r.dead_at = (select min(x.dead_at) from public.room_roles x
                     where x.room_id = r.room_id and x.game_no = r.game_no
                       and x.round_no = r.round_no)
  group by p.name order by 2 desc, 1 limit 1;
  if found then
    v_out := v_out || jsonb_build_object('title', 'Always first to go', 'name', v_row.name,
      'detail', 'killed first ' || v_row.n || case when v_row.n = 1 then ' time' else ' times' end);
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Opening and starting rooms now accept Killer.
-- ---------------------------------------------------------------------------
create or replace function public.create_room(p_game text, p_host_name text)
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
  if p_game is null or p_game not in ('fake_it', 'same_brain', 'killer') then
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

create or replace function public.start_room(p_code text, p_game text default null)
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
  if v_game not in ('fake_it', 'same_brain', 'killer') then
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

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.party_begin_round(uuid, smallint), public.party_begin_round_words(uuid, smallint),
  public.party_advance(uuid), public.party_advance_words(uuid),
  public.party_view(uuid, uuid), public.party_view_words(uuid, uuid),
  public.killer_end(public.rooms, text, text, uuid), public.killer_my_role(public.rooms),
  public.killer_target(public.rooms, text), public.killer_awards(public.rooms),
  public.killer_kill(text, text), public.killer_accuse(text, text),
  public.killer_suspect(text, text)
from public, anon, authenticated;

grant execute on function
  public.killer_kill(text, text), public.killer_accuse(text, text), public.killer_suspect(text, text)
to authenticated;
