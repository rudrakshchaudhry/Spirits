-- Checkpoint D: wishes can be granted once per friendship.
alter table public.friendships add column wish_fulfilled_at timestamptz;
