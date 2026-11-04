alter table public.friendships
  add column look text,
  add column sprite_seed bigint not null default 0;
