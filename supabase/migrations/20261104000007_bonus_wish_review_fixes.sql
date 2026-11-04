alter table public.friendships
  add column bonus_wish_rolled_on date,
  add column last_chapter_at timestamptz;

-- Atomic bonus-wish grant: lock the friendship row, check the wished keepsake,
-- consume it, clear the wish and count the star — all or nothing.
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
  return 'ok';
end;
$$;
revoke all on function public.grant_bonus_wish(uuid, text, text) from public, anon, authenticated;
grant execute on function public.grant_bonus_wish(uuid, text, text) to service_role;
