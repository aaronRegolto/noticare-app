-- Makes granting Pro for a PayMongo payment idempotent and additive. Until now
-- paymongo-webhook and paymongo-check-payment each set
-- pro_expires_at = now() + term on every call, so re-checking an old,
-- already-paid Payment Intent handed out a fresh term every time, and paying
-- again while still Pro threw away the time that was left.
--
-- Both functions now call grant_pro_for_payment, which records each Payment
-- Intent once in pro_payment_grants (so the webhook, its retries and the
-- in-app "I've already paid" check together grant exactly one term per
-- payment) and extends from the current expiry while Pro is still active.
-- Pro with no expiry stays that way (see 20260926000100_pro_expiry.sql).

begin;

create table public.pro_payment_grants (
  payment_intent_id text primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  term_days integer not null check (term_days > 0),
  granted_at timestamptz not null default now()
);

alter table public.pro_payment_grants enable row level security;
revoke all on public.pro_payment_grants from public, anon, authenticated;
grant select, insert on public.pro_payment_grants to service_role;

create or replace function public.grant_pro_for_payment(
  p_payment_intent_id text,
  p_user_id uuid,
  p_term_days integer
)
returns timestamptz
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_expires_at timestamptz;
begin
  insert into public.pro_payment_grants (payment_intent_id, user_id, term_days)
  values (p_payment_intent_id, p_user_id, p_term_days)
  on conflict (payment_intent_id) do nothing;

  if not found then
    -- This payment already granted its term; report the current expiry.
    select pro_expires_at into v_expires_at
    from public.profiles
    where user_id = p_user_id;
    return v_expires_at;
  end if;

  update public.profiles
  set plan = 'pro',
      pro_expires_at = case
        when plan = 'pro' and pro_expires_at is null then null
        when plan = 'pro' and pro_expires_at > now() then pro_expires_at + make_interval(days => p_term_days)
        else now() + make_interval(days => p_term_days)
      end
  where user_id = p_user_id
  returning pro_expires_at into v_expires_at;

  return v_expires_at;
end;
$$;

revoke all on function public.grant_pro_for_payment(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.grant_pro_for_payment(text, uuid, integer) to service_role;

commit;
