-- Checkpoint G: crews, trading, profiles, gatherings (spec §13–14).
-- (applied to project wyaubwtauvlvvsprkqbw via MCP; this file is the record)

alter table public.profiles
  add column crew_changed_at timestamptz,
  add column favorite_spirits text[] not null default '{}',
  add column onboarded_at timestamptz;

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  offer jsonb not null,
  request jsonb not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','countered')),
  parent_id uuid references public.trades(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_id <> to_id)
);
create index trades_to on public.trades (to_id, status);
create index trades_from on public.trades (from_id, created_at);
alter table public.trades enable row level security;
create policy "parties read trades" on public.trades for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));

create or replace function public.execute_trade(p_trade uuid, p_actor uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  t public.trades%rowtype;
  k text; n int; have int;
begin
  select * into t from public.trades where id = p_trade for update;
  if not found then return 'not_found'; end if;
  if t.status <> 'pending' then return 'not_pending'; end if;
  if t.to_id <> p_actor then return 'not_yours'; end if;
  perform 1 from public.inventory where player_id in (t.from_id, t.to_id) order by player_id, keepsake_type for update;
  for k, n in select key, value::int from jsonb_each_text(t.offer) loop
    select qty into have from public.inventory where player_id = t.from_id and keepsake_type = k;
    if coalesce(have, 0) < n then return 'offer_missing'; end if;
  end loop;
  for k, n in select key, value::int from jsonb_each_text(t.request) loop
    select qty into have from public.inventory where player_id = t.to_id and keepsake_type = k;
    if coalesce(have, 0) < n then return 'request_missing'; end if;
  end loop;
  for k, n in select key, value::int from jsonb_each_text(t.offer) loop
    update public.inventory set qty = qty - n, updated_at = now() where player_id = t.from_id and keepsake_type = k;
    insert into public.inventory (player_id, keepsake_type, qty) values (t.to_id, k, n)
      on conflict (player_id, keepsake_type) do update set qty = public.inventory.qty + n, updated_at = now();
  end loop;
  for k, n in select key, value::int from jsonb_each_text(t.request) loop
    update public.inventory set qty = qty - n, updated_at = now() where player_id = t.to_id and keepsake_type = k;
    insert into public.inventory (player_id, keepsake_type, qty) values (t.from_id, k, n)
      on conflict (player_id, keepsake_type) do update set qty = public.inventory.qty + n, updated_at = now();
  end loop;
  if exists (select 1 from public.inventory where player_id in (t.from_id, t.to_id) and qty > 20) then
    raise exception 'pocket_full' using errcode = 'P0001';
  end if;
  update public.trades set status = 'accepted', resolved_at = now() where id = t.id;
  return 'ok';
end;
$$;

create table public.gathering_checkins (
  event_id text not null,
  player_id uuid not null references auth.users(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  verified boolean not null,
  demo boolean not null default false,
  primary key (event_id, player_id)
);
create table public.gathering_scores (
  event_id text not null,
  player_id uuid not null references auth.users(id) on delete cascade,
  score real not null check (score between 0 and 1),
  played_at timestamptz not null default now(),
  primary key (event_id, player_id)
);
alter table public.gathering_checkins enable row level security;
alter table public.gathering_scores enable row level security;
create policy "read own checkins" on public.gathering_checkins for select to authenticated using ((select auth.uid()) = player_id);
create policy "read own gathering scores" on public.gathering_scores for select to authenticated using ((select auth.uid()) = player_id);

create or replace function public.crew_scores(p_since timestamptz)
returns table (hood text, members int, chunks int, friends int, wishes int, score real)
language sql stable security invoker set search_path = '' as $$
  with m as (select p.id, p.home_hood from public.profiles p where p.home_hood is not null),
  c as (select e.player_id, count(*) n from public.explored_chunks e where e.first_at >= p_since group by 1),
  f as (select fr.player_id, count(*) filter (where fr.befriended_at >= p_since) nf,
               count(*) filter (where fr.wish_fulfilled_at >= p_since) nw
          from public.friendships fr group by 1),
  per as (
    select m.home_hood, m.id,
           coalesce(c.n, 0)::int chunks, coalesce(f.nf, 0)::int friends, coalesce(f.nw, 0)::int wishes
      from m left join c on c.player_id = m.id left join f on f.player_id = m.id
  )
  select home_hood,
         count(*) filter (where chunks + friends + wishes > 0)::int,
         sum(chunks)::int, sum(friends)::int, sum(wishes)::int,
         (sum(chunks) + 5 * sum(friends) + 10 * sum(wishes))::real
           / greatest(1, count(*) filter (where chunks + friends + wishes > 0))
    from per group by home_hood
$$;

revoke all on function public.execute_trade(uuid, uuid) from public, anon, authenticated;
revoke all on function public.crew_scores(timestamptz) from public, anon, authenticated;
grant execute on function public.execute_trade(uuid, uuid) to service_role;
grant execute on function public.crew_scores(timestamptz) to service_role;
