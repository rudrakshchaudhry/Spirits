-- Atomic guest-signup claim: per-hash advisory lock → prune → count → insert.
create or replace function public.claim_guest_slot(p_hash text, p_limit int)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('guest:' || p_hash));
  delete from public.guest_signups where ip_hash = p_hash and created_at < now() - interval '2 hours';
  select count(*) into n from public.guest_signups where ip_hash = p_hash and created_at >= now() - interval '1 hour';
  if n >= p_limit then return false; end if;
  insert into public.guest_signups (ip_hash) values (p_hash);
  return true;
end;
$$;
revoke all on function public.claim_guest_slot(text, int) from public, anon, authenticated;
grant execute on function public.claim_guest_slot(text, int) to service_role;

-- Single-use encounter tokens: remember the issue time of the last played token.
alter table public.friendships add column last_play_t0 bigint;
