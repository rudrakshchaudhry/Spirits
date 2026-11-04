-- Presence for glint pickups: per-player lock → recent visit? → budget → touch.
create or replace function public.touch_chunk(p_player uuid, p_key text, p_hood text, p_cap int, p_window_s int, p_presence_s int)
returns text language plpgsql security invoker set search_path = '' as $$
declare lt timestamptz; n int;
begin
  perform pg_advisory_xact_lock(hashtext('touch:' || p_player::text));
  select last_at into lt from public.explored_chunks where player_id = p_player and chunk_key = p_key;
  if lt is not null and lt >= now() - make_interval(secs => p_presence_s) then return 'present'; end if;
  select count(*) into n from public.explored_chunks where player_id = p_player and last_at >= now() - make_interval(secs => p_window_s);
  if n >= p_cap then return 'limit'; end if;
  insert into public.explored_chunks (player_id, chunk_key, neighborhood, last_at) values (p_player, p_key, p_hood, now())
    on conflict (player_id, chunk_key) do update set last_at = now();
  return 'ok';
end;
$$;

-- Exploration reports: per-player lock; revisits always accepted, new chunks within the budget.
create or replace function public.admit_chunks(p_player uuid, p_keys text[], p_hoods text[], p_cap int, p_window_s int)
returns text[] language plpgsql security invoker set search_path = '' as $$
declare n int; i int; accepted text[] := '{}'; known boolean;
begin
  perform pg_advisory_xact_lock(hashtext('touch:' || p_player::text));
  select count(*) into n from public.explored_chunks where player_id = p_player and first_at >= now() - make_interval(secs => p_window_s);
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    select exists (select 1 from public.explored_chunks where player_id = p_player and chunk_key = p_keys[i]) into known;
    if known then
      update public.explored_chunks set last_at = now() where player_id = p_player and chunk_key = p_keys[i];
      accepted := accepted || p_keys[i];
    elsif n < p_cap then
      insert into public.explored_chunks (player_id, chunk_key, neighborhood, last_at) values (p_player, p_keys[i], p_hoods[i], now());
      n := n + 1;
      accepted := accepted || p_keys[i];
    end if;
  end loop;
  return accepted;
end;
$$;

-- Crew board: only chunks inside a neighbourhood count.
create or replace function public.crew_scores(p_since timestamptz)
returns table (hood text, members int, chunks int, friends int, wishes int, score real)
language sql stable security invoker set search_path = '' as $$
  with m as (select p.id, p.home_hood from public.profiles p where p.home_hood is not null),
  c as (select e.player_id, count(*) n from public.explored_chunks e
         where e.first_at >= p_since and e.neighborhood is not null group by 1),
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

revoke all on function public.touch_chunk(uuid, text, text, int, int, int) from public, anon, authenticated;
revoke all on function public.admit_chunks(uuid, text[], text[], int, int) from public, anon, authenticated;
grant execute on function public.touch_chunk(uuid, text, text, int, int, int) to service_role;
grant execute on function public.admit_chunks(uuid, text[], text[], int, int) to service_role;
