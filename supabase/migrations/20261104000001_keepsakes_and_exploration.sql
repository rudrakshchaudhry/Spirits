-- Checkpoint D: keepsakes, pickups, exploration (spec §10, §4.3, §15).
-- (applied to project wyaubwtauvlvvsprkqbw via MCP; kept here as the record)
create table public.inventory (
  player_id uuid not null references auth.users(id) on delete cascade,
  keepsake_type text not null,
  qty int not null default 0 check (qty between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (player_id, keepsake_type)
);
create table public.pickups_claimed (
  player_id uuid not null references auth.users(id) on delete cascade,
  glint_id text not null,
  window_start timestamptz not null,
  claimed_at timestamptz not null default now(),
  primary key (player_id, glint_id)
);
create index pickups_claimed_window on public.pickups_claimed (player_id, window_start);
create table public.explored_chunks (
  player_id uuid not null references auth.users(id) on delete cascade,
  chunk_key text not null,
  neighborhood text,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (player_id, chunk_key)
);
create index explored_chunks_hood on public.explored_chunks (player_id, neighborhood);
alter table public.inventory enable row level security;
alter table public.pickups_claimed enable row level security;
alter table public.explored_chunks enable row level security;
create policy "read own inventory" on public.inventory for select to authenticated using ((select auth.uid()) = player_id);
create policy "read own pickups" on public.pickups_claimed for select to authenticated using ((select auth.uid()) = player_id);
create policy "read own exploration" on public.explored_chunks for select to authenticated using ((select auth.uid()) = player_id);

create or replace function public.grant_keepsake(p_player uuid, p_type text, p_n int default 1)
returns int language sql security invoker set search_path = '' as $$
  insert into public.inventory (player_id, keepsake_type, qty)
  values (p_player, p_type, least(20, greatest(0, p_n)))
  on conflict (player_id, keepsake_type)
  do update set qty = least(20, public.inventory.qty + p_n), updated_at = now()
  returning qty;
$$;
create or replace function public.consume_keepsake(p_player uuid, p_type text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  update public.inventory set qty = qty - 1, updated_at = now()
   where player_id = p_player and keepsake_type = p_type and qty > 0
  returning qty into n;
  return n is not null;
end;
$$;
revoke all on function public.grant_keepsake(uuid, text, int) from public, anon, authenticated;
revoke all on function public.consume_keepsake(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_keepsake(uuid, text, int) to service_role;
grant execute on function public.consume_keepsake(uuid, text) to service_role;
