-- Atomic mini-game result (/api/encounter/play): lock → still 'met'? → not wandered off? →
-- single-use token claim → trust += gain on the CURRENT value → befriend or wander off.
-- A gift that lands between /start and /play is kept, and a gift that already befriended
-- (or made rare) the spirit is never reverted to 'met'.
create or replace function public.record_play(p_player uuid, p_spirit text, p_t0 bigint, p_gain int, p_cooldown_ms int)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare f public.friendships%rowtype; cd timestamptz; new_trust int; until_at timestamptz;
begin
  select * into f from public.friendships where player_id = p_player and spirit_id = p_spirit for update;
  if not found then return jsonb_build_object('result', 'no_friendship'); end if;
  if f.status <> 'met' then return jsonb_build_object('result', 'already', 'trust', f.trust); end if;
  select c.until into cd from public.encounter_cooldowns c where c.player_id = p_player and c.spirit_id = p_spirit;
  if cd is not null and cd > now() then return jsonb_build_object('result', 'wandering'); end if;
  if f.last_play_t0 is not null and f.last_play_t0 >= p_t0 then return jsonb_build_object('result', 'used'); end if;
  new_trust := least(200, f.trust + greatest(0, p_gain));
  if new_trust >= 100 then
    update public.friendships set
      trust = new_trust, status = 'befriended', befriended_at = now(),
      lore_unlocked = greatest(1, f.lore_unlocked), last_visit_at = now(), last_play_t0 = p_t0
    where player_id = p_player and spirit_id = p_spirit;
    return jsonb_build_object('result', 'ok', 'trust', new_trust, 'befriended', true);
  end if;
  update public.friendships set trust = new_trust, last_visit_at = now(), last_play_t0 = p_t0
  where player_id = p_player and spirit_id = p_spirit;
  until_at := now() + make_interval(secs => p_cooldown_ms / 1000.0);
  insert into public.encounter_cooldowns (player_id, spirit_id, until) values (p_player, p_spirit, until_at)
  on conflict (player_id, spirit_id) do update set until = excluded.until;
  return jsonb_build_object('result', 'ok', 'trust', new_trust, 'befriended', false, 'until', until_at);
end;
$$;

-- Shared rate limiter (works across serverless instances). Keys are opaque
-- (e.g. 'greet:<player id>'); expired rows are pruned by the hourly cron.
create table public.rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index rate_hits_key_at on public.rate_hits (key, at);
alter table public.rate_hits enable row level security; -- no policies: service role only

create or replace function public.rate_hit(p_key text, p_window_s int, p_max int)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('rate_hit:' || p_key));
  select count(*) into n from public.rate_hits where key = p_key and at > now() - make_interval(secs => p_window_s);
  if n >= p_max then return false; end if;
  insert into public.rate_hits (key) values (p_key);
  return true;
end;
$$;
