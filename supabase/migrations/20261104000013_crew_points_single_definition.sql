-- One definition of a player's weekly crew points, used by both the board (crew_scores)
-- and the player's own contribution, so the two can't drift. Each source is filtered to
-- the week (and to one player when p_player is given), instead of scanning every friendship.
create or replace function public.crew_member_points(p_since timestamptz, p_player uuid default null)
returns table (player_id uuid, home_hood text, chunks int, friends int, wishes int, points int)
language sql stable security invoker set search_path = '' as $$
  with m as (select p.id, p.home_hood from public.profiles p
              where p.home_hood is not null and (p_player is null or p.id = p_player)),
  c as (select e.player_id, count(*) n from public.explored_chunks e
         where e.first_at >= p_since and e.neighborhood is not null
           and (p_player is null or e.player_id = p_player) group by 1),
  f as (select fr.player_id, count(*) filter (where fr.befriended_at >= p_since) nf,
               count(*) filter (where fr.wish_fulfilled_at >= p_since) nw
          from public.friendships fr
         where (fr.befriended_at >= p_since or fr.wish_fulfilled_at >= p_since)
           and (p_player is null or fr.player_id = p_player) group by 1),
  b as (select g.player_id, count(*) nb from public.bonus_wish_grants g
         where g.granted_at >= p_since and (p_player is null or g.player_id = p_player) group by 1)
  select m.id, m.home_hood,
         coalesce(c.n, 0)::int, coalesce(f.nf, 0)::int,
         (coalesce(f.nw, 0) + coalesce(b.nb, 0))::int,
         (coalesce(c.n, 0) + 5 * coalesce(f.nf, 0) + 10 * (coalesce(f.nw, 0) + coalesce(b.nb, 0)))::int
    from m left join c on c.player_id = m.id left join f on f.player_id = m.id
           left join b on b.player_id = m.id
$$;
revoke all on function public.crew_member_points(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.crew_member_points(timestamptz, uuid) to service_role;

create or replace function public.crew_scores(p_since timestamptz)
returns table (hood text, members int, chunks int, friends int, wishes int, score real)
language sql stable security invoker set search_path = '' as $$
  select home_hood,
         count(*) filter (where points > 0)::int,
         sum(chunks)::int, sum(friends)::int, sum(wishes)::int,
         sum(points)::real / greatest(1, count(*) filter (where points > 0))
    from public.crew_member_points(p_since) group by home_hood
$$;

-- Backfill grants made before the log existed. Revisit wishes shipped on 2026-11-04, so
-- every earlier grant is from this week; the friendship's last visit is the best available
-- time. From here on the log is the single record of granted bonus wishes (Atlas stars,
-- companion XP and crew points all read it), so it is kept as history, not pruned.
insert into public.bonus_wish_grants (player_id, spirit_id, keepsake_type, granted_at)
select fr.player_id, fr.spirit_id, 'unknown', fr.last_visit_at
  from public.friendships fr, generate_series(1, fr.bonus_wishes_granted)
 where fr.bonus_wishes_granted > 0
   and not exists (select 1 from public.bonus_wish_grants g where g.player_id = fr.player_id and g.spirit_id = fr.spirit_id);
