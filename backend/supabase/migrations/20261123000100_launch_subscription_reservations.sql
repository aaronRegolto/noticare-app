begin;

create table if not exists public.launch_subscription_reservations (
  reservation_id text primary key,
  payment_intent_id text,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  interval text not null check (interval in ('monthly', 'annual')),
  amount_centavos integer not null check (amount_centavos > 0),
  reserved_at timestamptz not null default now(),
  purchased_at timestamptz
);

alter table public.launch_subscription_reservations enable row level security;
revoke all on public.launch_subscription_reservations from public, anon, authenticated;
grant select, insert, update on public.launch_subscription_reservations to service_role;

create or replace function public.reserve_launch_subscription(
  p_reservation_id text,
  p_user_id uuid,
  p_interval text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_launch integer;
  v_regular integer;
  v_count integer;
  v_existing integer;
begin
  perform pg_advisory_xact_lock(hashtext('noticare-launch-' || p_interval));
  v_launch := case p_interval when 'monthly' then 4900 when 'annual' then 24975 else 0 end;
  v_regular := case p_interval when 'monthly' then 14900 when 'annual' then 99900 else 0 end;
  if v_regular = 0 then raise exception 'unsupported interval'; end if;

  select amount_centavos into v_existing
  from public.launch_subscription_reservations
  where reservation_id = p_reservation_id and user_id = p_user_id;
  if v_existing is not null then return v_existing; end if;

  select count(*) into v_count
  from public.launch_subscription_reservations
  where interval = p_interval and purchased_at is not null;

  insert into public.launch_subscription_reservations
    (reservation_id, user_id, interval, amount_centavos)
  values (p_reservation_id, p_user_id, p_interval, case when v_count < 20 then v_launch else v_regular end);

  return case when v_count < 20 then v_launch else v_regular end;
end;
$$;

revoke all on function public.reserve_launch_subscription(text, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_launch_subscription(text, uuid, text) to service_role;

commit;
