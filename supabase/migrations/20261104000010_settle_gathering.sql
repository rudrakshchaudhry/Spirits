-- Co-op settlement under a per-event lock. Only the first p_min scores count, so the
-- result is final the moment it settles; later plays are refused.
create or replace function public.settle_gathering(p_event text, p_player uuid, p_score real, p_min int, p_pass real)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare n int; avg_score real;
begin
  perform pg_advisory_xact_lock(hashtext('gathering:' || p_event));
  select count(*) into n from public.gathering_scores where event_id = p_event;
  if n >= p_min then
    select avg(score) into avg_score from (select score from public.gathering_scores where event_id = p_event order by played_at, player_id limit p_min) s;
    return jsonb_build_object('result', case when avg_score >= p_pass then 'success' else 'failed' end, 'settled_before', true, 'played', n, 'avg', avg_score);
  end if;
  if exists (select 1 from public.gathering_scores where event_id = p_event and player_id = p_player) then
    return jsonb_build_object('result', 'already');
  end if;
  insert into public.gathering_scores (event_id, player_id, score) values (p_event, p_player, p_score);
  n := n + 1;
  select avg(score) into avg_score from (select score from public.gathering_scores where event_id = p_event order by played_at, player_id limit p_min) s;
  return jsonb_build_object(
    'result', case when n < p_min then 'pending' when avg_score >= p_pass then 'success' else 'failed' end,
    'settled_before', false, 'played', n, 'avg', avg_score);
end;
$$;
revoke all on function public.settle_gathering(text, uuid, real, int, real) from public, anon, authenticated;
grant execute on function public.settle_gathering(text, uuid, real, int, real) to service_role;
