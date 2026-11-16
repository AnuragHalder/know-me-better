-- Basic usage numbers for the team: who's using the app and which games get played.
--
-- Only people listed in app_admins can read them. Nobody is listed by default;
-- add yourself once in the Supabase SQL editor (see docs/ANALYTICS.md):
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'you@example.com';
--
-- Numbers are counts only: no names, emails or answers leave the database.

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- {generated_at, people, quiz, road, party, payments, daily[14 days]}
-- Each block has an all-time total and the last 7 days (`week`).
create function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week timestamptz := now() - interval '7 days';
begin
  if not public.is_app_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),

    'people', (
      select jsonb_build_object(
        'accounts', count(*) filter (where not u.is_anonymous),
        'accounts_week', count(*) filter (where not u.is_anonymous and u.created_at >= v_week),
        'guests', count(*) filter (where u.is_anonymous),
        'guests_week', count(*) filter (where u.is_anonymous and u.created_at >= v_week)
      )
      from auth.users u
    ),

    'quiz', public.admin_kind_stats('quiz', v_week),
    'road', public.admin_kind_stats('road', v_week),

    'party', (
      with games as (
        -- One row per game started in a room (round 1 of each game_no).
        select r.room_id, r.game_no, r.started_at,
               coalesce(p.game, case when exists (
                 select 1 from public.room_roles x
                 where x.room_id = r.room_id and x.game_no = r.game_no and x.round_no = 1
               ) then 'killer' end) as game,
               (select count(*) from public.room_players rp where rp.room_id = r.room_id) as players
        from public.room_rounds r
        left join public.party_prompts p on p.id = r.prompt_id
        where r.round_no = 1
      )
      select jsonb_build_object(
        'rooms', (select count(*) from public.rooms),
        'rooms_week', (select count(*) from public.rooms where created_at >= v_week),
        'games', coalesce((
          select jsonb_object_agg(g.game, jsonb_build_object(
            'games', g.n, 'games_week', g.n_week, 'avg_players', g.avg_players))
          from (
            select game, count(*) as n,
                   count(*) filter (where started_at >= v_week) as n_week,
                   round(avg(players), 1) as avg_players
            from games where game is not null group by game
          ) g
        ), '{}'::jsonb)
      )
    ),

    'payments', (
      select jsonb_build_object(
        'paid', count(*) filter (where status = 'paid'),
        'paid_paise', coalesce(sum(amount_paise) filter (where status = 'paid'), 0),
        'failed', count(*) filter (where status = 'failed'),
        'abandoned', count(*) filter (where status = 'created'),
        'refunded', count(*) filter (where status = 'refunded'),
        'by_product', coalesce((
          select jsonb_object_agg(product, n) from (
            select product, count(*) as n from public.purchases
            where status = 'paid' group by product
          ) x
        ), '{}'::jsonb)
      )
      from public.purchases
    ),

    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'quizzes', (select count(*) from public.quizzes q
                    where q.kind = 'quiz' and q.created_at::date = d::date),
        'quiz_plays', (select count(*) from public.attempts a join public.quizzes q on q.id = a.quiz_id
                       where q.kind = 'quiz' and a.finished_at::date = d::date),
        'roads', (select count(*) from public.quizzes q
                  where q.kind = 'road' and q.created_at::date = d::date),
        'road_plays', (select count(*) from public.attempts a join public.quizzes q on q.id = a.quiz_id
                       where q.kind = 'road' and a.finished_at::date = d::date),
        'party_games', (select count(*) from public.room_rounds r
                        where r.round_no = 1 and r.started_at::date = d::date)
      ) order by d)
      from generate_series(current_date - 13, current_date, interval '1 day') d
    )
  );
end;
$$;

-- Creation and play numbers for quizzes ('quiz') or story roads ('road').
create function public.admin_kind_stats(p_kind text, p_week timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'created', (select count(*) from public.quizzes where kind = p_kind),
    'created_week', (select count(*) from public.quizzes where kind = p_kind and created_at >= p_week),
    'creators', (select count(distinct owner_id) from public.quizzes where kind = p_kind),
    'plays', count(a.*) filter (where a.finished_at is not null),
    'plays_week', count(a.*) filter (where a.finished_at >= p_week),
    'started', count(a.*),
    'players', count(distinct a.player_id) filter (where a.finished_at is not null),
    -- Pages with at least one finished play: did the share link work?
    'played_at_least_once', count(distinct a.quiz_id) filter (where a.finished_at is not null)
  )
  from public.attempts a
  join public.quizzes q on q.id = a.quiz_id and q.kind = p_kind;
$$;

revoke execute on function public.is_app_admin(), public.admin_stats(),
  public.admin_kind_stats(text, timestamptz)
from public, anon, authenticated;
grant execute on function public.is_app_admin(), public.admin_stats() to authenticated;
