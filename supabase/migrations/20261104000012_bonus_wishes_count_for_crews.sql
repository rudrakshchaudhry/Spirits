-- Product decision (2026-11-04): granted revisit ("bonus") wishes count toward the weekly
-- crew score, the same as first wishes (10 points each). The old counter has no timestamps,
-- so each grant is now logged with its time. Grants made before this migration aren't
-- backfilled (their week is unknown); they still count as Atlas stars via bonus_wishes_granted.
create table public.bonus_wish_grants (
  id bigint generated always as identity primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  spirit_id text not null,
  keepsake_type text not null,
  granted_at timestamptz not null default now()
);
create index bonus_wish_grants_player_time on public.bonus_wish_grants (player_id, granted_at);
create index bonus_wish_grants_time on public.bonus_wish_grants (granted_at);
alter table public.bonus_wish_grants enable row level security;
create policy "read own bonus wish grants" on public.bonus_wish_grants
  for select to authenticated using ((select auth.uid()) = player_id);

create or replace function public.grant_bonus_wish(p_player uuid, p_spirit text, p_type text)
returns text language plpgsql security invoker set search_path = '' as $$
declare w jsonb; ok boolean;
begin
  select bonus_wish into w from public.friendships
   where player_id = p_player and spirit_id = p_spirit for update;
  if w is null then return 'no_wish'; end if;
  if w->>'keepsake_type' <> p_type then return 'not_wished'; end if;
  select public.consume_keepsake(p_player, p_type) into ok;
  if not ok then return 'missing'; end if;
  update public.friendships
     set bonus_wish = null, bonus_wishes_granted = bonus_wishes_granted + 1
   where player_id = p_player and spirit_id = p_spirit;
  insert into public.bonus_wish_grants (player_id, spirit_id, keepsake_type) values (p_player, p_spirit, p_type);
  return 'ok';
end;
$$;
revoke all on function public.grant_bonus_wish(uuid, text, text) from public, anon, authenticated;
grant execute on function public.grant_bonus_wish(uuid, text, text) to service_role;

-- Crew board: wishes = first wishes + bonus wishes granted since p_since.
create or replace function public.crew_scores(p_since timestamptz)
returns table (hood text, members int, chunks int, friends int, wishes int, score real)
language sql stable security invoker set search_path = '' as $$
  with m as (select p.id, p.home_hood from public.profiles p where p.home_hood is not null),
  c as (select e.player_id, count(*) n from public.explored_chunks e
         where e.first_at >= p_since and e.neighborhood is not null group by 1),
  f as (select fr.player_id, count(*) filter (where fr.befriended_at >= p_since) nf,
               count(*) filter (where fr.wish_fulfilled_at >= p_since) nw
          from public.friendships fr group by 1),
  b as (select g.player_id, count(*) nb from public.bonus_wish_grants g
         where g.granted_at >= p_since group by 1),
  per as (
    select m.home_hood, m.id,
           coalesce(c.n, 0)::int chunks, coalesce(f.nf, 0)::int friends,
           (coalesce(f.nw, 0) + coalesce(b.nb, 0))::int wishes
      from m left join c on c.player_id = m.id left join f on f.player_id = m.id
             left join b on b.player_id = m.id
  )
  select home_hood,
         count(*) filter (where chunks + friends + wishes > 0)::int,
         sum(chunks)::int, sum(friends)::int, sum(wishes)::int,
         (sum(chunks) + 5 * sum(friends) + 10 * sum(wishes))::real
           / greatest(1, count(*) filter (where chunks + friends + wishes > 0))
    from per group by home_hood
$$;
