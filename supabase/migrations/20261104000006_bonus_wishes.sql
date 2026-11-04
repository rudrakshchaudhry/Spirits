-- Spec §8.4: revisiting a friend sometimes brings a new (per-player) wish.
alter table public.friendships
  add column bonus_wish jsonb,
  add column bonus_wishes_granted int not null default 0;
