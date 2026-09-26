-- Subscription plan tracking, mirrored from RevenueCat by the
-- revenuecat-webhook Edge Function (service role only — see its README entry).
-- The client never writes this column; only "authenticated: select" is granted
-- on public.profiles (see 20260811000200_noticare_rls_and_rpc.sql:59), so no
-- RLS tightening is needed here.

begin;

alter table public.profiles
  add column plan text not null default 'free' check (plan in ('free', 'pro')),
  add column plan_updated_at timestamptz not null default now();

create or replace function public.set_plan_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.plan is distinct from old.plan then
    new.plan_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_set_plan_updated_at
before update on public.profiles
for each row execute function public.set_plan_updated_at();

commit;
