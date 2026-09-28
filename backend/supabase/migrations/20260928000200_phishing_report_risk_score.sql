-- Stores the on-device detector's risk score (0-100) with each phishing report, so the
-- "Most reported phishing messages" list can show how dangerous a message was judged to be.
--
-- viral_score is unrelated: it measures how widely a message has been reported (5 for the first
-- reporter, +19 per additional reporter), not how risky it is. Showing it as "x/100" beside a
-- detection read as a wrong risk score, so the ranking now also returns risk_score.
--
-- Reports filed before this migration have no stored risk score (NULL).

begin;

alter table public.viral_phishing_report_events
  add column risk_score smallint check (risk_score is null or risk_score between 0 and 100);

-- The highest risk score any reporter's device assigned this message.
alter table public.viral_phishing_reports
  add column risk_score smallint check (risk_score is null or risk_score between 0 and 100);

drop function public.record_phishing_report(uuid, text, text, text[], text, text);

create function public.record_phishing_report(
  p_device_id uuid,
  p_message_text text,
  p_sample_sender text,
  p_indicator_codes text[],
  p_rule_version text,
  p_source text default 'manual',
  p_risk_score smallint default null
)
returns table (
  report_id uuid,
  viral_score smallint,
  report_count integer,
  is_first_reporter boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_initial_score constant smallint := 5;
  v_increment constant smallint := 19;
  v_user_id uuid := auth.uid();
  v_source text := coalesce(p_source, 'manual');
  v_normalized text;
  v_hash text;
  v_report_id uuid;
  v_report_count integer;
  v_event_id uuid;
  v_new_reporter boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_device_id is null
    or v_source not in ('manual', 'realtime')
    or (p_risk_score is not null and p_risk_score not between 0 and 100)
    or char_length(trim(coalesce(p_rule_version, ''))) not between 1 and 64
    or char_length(trim(coalesce(p_message_text, ''))) not between 1 and 4000
    or (p_sample_sender is not null and char_length(p_sample_sender) > 120) then
    raise exception 'invalid phishing report metadata' using errcode = '22023';
  end if;

  perform public.assert_indicator_codes(p_indicator_codes, trim(p_rule_version));

  if not exists (
    select 1 from public.devices as d where d.id = p_device_id and d.user_id = v_user_id
  ) then
    raise exception 'device is not registered to the current user' using errcode = '42501';
  end if;

  v_normalized := public.normalize_phishing_message_text(p_message_text);
  v_hash := encode(extensions.digest(v_normalized, 'sha256'), 'hex');

  insert into public.viral_phishing_reports (
    message_hash, message_text, sample_sender, indicator_codes, rule_version, viral_score, risk_score
  )
  values (
    v_hash, left(trim(p_message_text), 4000), nullif(trim(coalesce(p_sample_sender, '')), ''),
    coalesce(p_indicator_codes, '{}'::text[]), trim(p_rule_version), v_initial_score, p_risk_score
  )
  on conflict (message_hash) do nothing
  returning id into v_report_id;

  if v_report_id is null then
    select r.id into v_report_id from public.viral_phishing_reports as r where r.message_hash = v_hash;
  end if;

  v_new_reporter := not exists (
    select 1 from public.viral_phishing_report_events as e
    where e.report_id = v_report_id and e.user_id = v_user_id
  );

  insert into public.viral_phishing_report_events (report_id, user_id, device_id, source, risk_score)
  values (v_report_id, v_user_id, p_device_id, v_source, p_risk_score)
  on conflict (report_id, user_id, source) do nothing
  returning id into v_event_id;

  if v_event_id is not null and v_new_reporter then
    update public.viral_phishing_reports as r
    set report_count = r.report_count + 1,
        last_reported_at = now(),
        viral_score = least(100, v_initial_score + (r.report_count) * v_increment)
    where r.id = v_report_id
    returning r.report_count into v_report_count;
  else
    if v_event_id is not null then
      update public.viral_phishing_reports as r set last_reported_at = now() where r.id = v_report_id;
    end if;
    select r.report_count into v_report_count from public.viral_phishing_reports as r where r.id = v_report_id;
  end if;

  if p_risk_score is not null then
    update public.viral_phishing_reports as r
    set risk_score = greatest(coalesce(r.risk_score, 0), p_risk_score)
    where r.id = v_report_id and (r.risk_score is null or r.risk_score < p_risk_score);
  end if;

  return query
  select r.id, r.viral_score, r.report_count, (v_event_id is not null and v_new_reporter and v_report_count = 1)
  from public.viral_phishing_reports as r
  where r.id = v_report_id;
end;
$$;

revoke all on function public.record_phishing_report(uuid, text, text, text[], text, text, smallint) from public, anon, authenticated;
grant execute on function public.record_phishing_report(uuid, text, text, text[], text, text, smallint) to authenticated;

drop function public.get_viral_phishing_ranking(integer, text);

create function public.get_viral_phishing_ranking(p_limit integer default 20, p_source text default null)
returns table (
  report_id uuid,
  message_text text,
  sample_sender text,
  viral_score smallint,
  report_count integer,
  first_reported_at timestamptz,
  last_reported_at timestamptz,
  risk_score smallint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
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

  if p_source is not null and p_source not in ('manual', 'realtime') then
    raise exception 'invalid report source' using errcode = '22023';
  end if;

  if p_source is null then
    return query
    select r.id, r.message_text, r.sample_sender, r.viral_score, r.report_count, r.first_reported_at,
      r.last_reported_at, r.risk_score
    from public.viral_phishing_reports as r
    order by r.viral_score desc, r.report_count desc, r.last_reported_at desc
    limit p_limit;
    return;
  end if;

  return query
  select
    r.id,
    r.message_text,
    r.sample_sender,
    least(100, 5 + (s.reporters - 1) * 19)::smallint,
    s.reporters::integer,
    s.first_at,
    s.last_at,
    coalesce(s.max_risk, r.risk_score)
  from public.viral_phishing_reports as r
  join (
    select e.report_id as rid, count(*) as reporters, min(e.created_at) as first_at,
      max(e.created_at) as last_at, max(e.risk_score) as max_risk
    from public.viral_phishing_report_events as e
    where e.source = p_source
    group by e.report_id
  ) as s on s.rid = r.id
  order by s.reporters desc, s.last_at desc
  limit p_limit;
end;
$$;

revoke all on function public.get_viral_phishing_ranking(integer, text) from public, anon, authenticated;
grant execute on function public.get_viral_phishing_ranking(integer, text) to authenticated;

commit;
