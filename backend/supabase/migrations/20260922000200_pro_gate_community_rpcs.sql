-- Gates only the community "viral phishing ranking" list behind a Pro
-- subscription. "Block & Report" itself (record_phishing_report /
-- get_phishing_message_virality) stays available to every tier — it's a core
-- safety action, confirmed explicitly during planning, not a Pro perk. This is
-- defense-in-depth for the ranking list: the client already hides it behind a
-- tier check, but a patched/rooted client must not bypass that by calling the
-- RPC directly.

begin;

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

  if not exists (select 1 from public.profiles where user_id = auth.uid() and plan = 'pro') then
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
