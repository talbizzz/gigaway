-- Milestone 1 — atomic invite redemption.
--
-- Implemented as a database function rather than a sequence of calls from the
-- Edge Function, because it must be one transaction: two devices redeeming the
-- same single-use code simultaneously must not both succeed. `for update` on
-- the invite row serialises them.
--
-- Called by the redeem-invite Edge Function as service_role. Not granted to
-- `authenticated` — a client must never be able to invoke it directly, since it
-- is the thing that sets status = 'approved'.

create or replace function public.redeem_invite(p_code text, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite   public.invites%rowtype;
  v_profile  public.profiles%rowtype;
  v_inviter  public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_not_found');
  end if;

  if v_profile.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'already_approved');
  end if;

  if exists (select 1 from public.invite_redemptions where redeemed_by = p_user) then
    return jsonb_build_object('ok', false, 'error', 'already_redeemed');
  end if;

  -- Serialises concurrent redemptions of the same code.
  select * into v_invite
  from public.invites
  where code = upper(trim(p_code))
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invite_not_found');
  end if;

  if v_invite.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'invite_revoked');
  end if;

  if v_invite.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'invite_expired');
  end if;

  if v_invite.uses >= v_invite.max_uses then
    return jsonb_build_object('ok', false, 'error', 'invite_exhausted');
  end if;

  -- Nobody may invite themselves, which would otherwise break the traceability
  -- guarantee that every member was vouched for by someone else.
  if v_invite.created_by = p_user then
    return jsonb_build_object('ok', false, 'error', 'invite_not_found');
  end if;

  update public.invites
    set uses = uses + 1
    where id = v_invite.id;

  insert into public.invite_redemptions (invite_id, redeemed_by)
  values (v_invite.id, p_user);

  -- Quota is spent on redemption, not on creation.
  update public.profiles
    set invite_quota = greatest(0, invite_quota - 1)
    where id = v_invite.created_by;

  update public.profiles
    set status      = 'approved',
        verified_at = now(),
        invited_by  = v_invite.created_by
    where id = p_user;

  select * into v_inviter from public.profiles where id = v_invite.created_by;

  return jsonb_build_object(
    'ok', true,
    'invitedBy', jsonb_build_object(
      'id', v_inviter.id,
      'displayName', v_inviter.display_name
    )
  );
end;
$$;

revoke all on function public.redeem_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_invite(text, uuid) to service_role;
