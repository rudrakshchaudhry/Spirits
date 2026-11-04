-- SF Spirits player state (spec §15). Server (service role) is the only writer;
-- players can read their own rows through RLS.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  home_hood text,
  companion_species text,
  demo_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.friendships (
  player_id uuid not null references auth.users(id) on delete cascade,
  spirit_id text not null,
  place_id text not null,
  family text not null,
  rarity text not null,
  spirit_name text not null,
  place_name text not null,
  neighborhood text,
  trust int not null default 0 check (trust between 0 and 200),
  status text not null default 'met' check (status in ('met', 'befriended', 'rare')),
  riddles_heard int not null default 0,
  lore_unlocked int not null default 0,
  met_at timestamptz not null default now(),
  befriended_at timestamptz,
  last_visit_at timestamptz not null default now(),
  primary key (player_id, spirit_id)
);
create index friendships_player_status on public.friendships (player_id, status);

create table public.encounter_cooldowns (
  player_id uuid not null references auth.users(id) on delete cascade,
  spirit_id text not null,
  until timestamptz not null,
  primary key (player_id, spirit_id)
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.encounter_cooldowns enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "read own friendships" on public.friendships
  for select to authenticated using ((select auth.uid()) = player_id);
create policy "read own cooldowns" on public.encounter_cooldowns
  for select to authenticated using ((select auth.uid()) = player_id);
