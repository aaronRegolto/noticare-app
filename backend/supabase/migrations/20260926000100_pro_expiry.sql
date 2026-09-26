-- Switches the Pro grant model from PayMongo Subscriptions (which QRPh cannot
-- do — QRPh is one-time-payment only, confirmed against PayMongo's docs) to a
-- fixed-term grant: a successful QRPh payment sets plan='pro' and pushes
-- pro_expires_at forward by one billing period. Nothing auto-charges again;
-- the user pays again before/after expiry to renew. Every place that checks
-- for Pro must treat plan='pro' as active only while pro_expires_at is still
-- in the future (see updated get_viral_phishing_ranking below and
-- src/providers/SubscriptionProvider.tsx client-side).

begin;

alter table public.profiles
  add column pro_expires_at timestamptz;

create or replace function public.get_viral_phishing_ranking(p_limit integer default 20)
returns table (
  report_id uuid,
  message_text text,
  sample_sender text,
  viral_score smallint,
  report_count integer,
  first_reported_at timestamptz,
  last_reported_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and plan = 'pro' and (pro_expires_at is null or pro_expires_at > now())
  ) then
    raise exception 'pro_subscription_required' using errcode = '42501';
  end if;

  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'invalid ranking limit' using errcode = '22023';
  end if;

  return query
  select r.id, r.message_text, r.sample_sender, r.viral_score, r.report_count, r.first_reported_at, r.last_reported_at
  from public.viral_phishing_reports as r
  order by r.viral_score desc, r.report_count desc, r.last_reported_at desc
  limit p_limit;
end;
$$;

commit;
