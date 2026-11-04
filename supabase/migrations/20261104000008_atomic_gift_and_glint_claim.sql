-- Atomic gift for the main wish / same-theme path: lock → check → consume → update.
create or replace function public.apply_gift(p_player uuid, p_spirit text, p_type text, p_kind text, p_gain int)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare f public.friendships%rowtype; ok boolean; new_trust int; new_status text;
begin
  select * into f from public.friendships where player_id = p_player and spirit_id = p_spirit for update;
  if not found then return jsonb_build_object('result', 'no_friendship'); end if;
  if p_kind = 'wish' and f.wish_fulfilled_at is not null then return jsonb_build_object('result', 'already'); end if;
  select public.consume_keepsake(p_player, p_type) into ok;
  if not ok then return jsonb_build_object('result', 'missing'); end if;
  new_trust := least(200, f.trust + p_gain);
  new_status := case when p_kind = 'wish' then 'rare'
                     when f.status = 'met' and new_trust >= 100 then 'befriended'
                     else f.status end;
  update public.friendships set
    trust = new_trust,
    status = new_status,
    befriended_at = coalesce(f.befriended_at, case when new_status <> 'met' then now() end),
    lore_unlocked = case when new_status <> 'met' then greatest(1, f.lore_unlocked) else f.lore_unlocked end,
    wish_fulfilled_at = case when p_kind = 'wish' then now() else f.wish_fulfilled_at end,
    last_visit_at = now()
  where player_id = p_player and spirit_id = p_spirit;
  return jsonb_build_object('result', 'ok', 'trust', new_trust, 'status', new_status);
end;
$$;

-- Atomic glint claim: a full stack is refused WITHOUT using up the glint;
-- otherwise the claim row and the grant succeed or fail together.
create or replace function public.claim_glint(p_player uuid, p_glint text, p_window timestamptz, p_type text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare have int; q int;
begin
  if exists (select 1 from public.pickups_claimed where player_id = p_player and glint_id = p_glint) then
    return jsonb_build_object('result', 'claimed');
  end if;
  select qty into have from public.inventory where player_id = p_player and keepsake_type = p_type for update;
  if coalesce(have, 0) >= 20 then return jsonb_build_object('result', 'full', 'qty', have); end if;
  insert into public.pickups_claimed (player_id, glint_id, window_start) values (p_player, p_glint, p_window)
    on conflict do nothing;
  if not found then return jsonb_build_object('result', 'claimed'); end if;
  select public.grant_keepsake(p_player, p_type, 1) into q;
  return jsonb_build_object('result', 'ok', 'qty', q);
end;
$$;

revoke all on function public.apply_gift(uuid, text, text, text, int) from public, anon, authenticated;
revoke all on function public.claim_glint(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_gift(uuid, text, text, text, int) to service_role;
grant execute on function public.claim_glint(uuid, text, timestamptz, text) to service_role;
