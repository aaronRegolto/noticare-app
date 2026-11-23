begin;

alter table public.viral_phishing_report_events
  add column detected_in text not null default 'unknown'
    check (detected_in in ('manual', 'messages', 'messenger', 'unknown'));

create or replace function public.redact_community_message_preview(p_message_text text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  with redacted_email as (
    select regexp_replace(coalesce(p_message_text, ''), '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[email]', 'gi') as message
  ),
  redacted_links as (
    select regexp_replace(message, '(https?://|www\.)[^[:space:]<>]+|[[:alnum:].-]+\.[[:alpha:]]{2,}[^[:space:]<>]*', '[link]', 'gi') as message
    from redacted_email
  ),
  redacted_numbers as (
    select regexp_replace(message, '[+]?[[:digit:]][[:digit:] ().-]{4,}[[:digit:]]', '[number]', 'g') as message
    from redacted_links
  )
  select case
    when char_length(trim(message)) = 0 then '[message unavailable]'
    when char_length(message) > 320 then left(trim(message), 317) || '...'
    else trim(message)
  end
  from redacted_numbers;
$$;

revoke all on function public.redact_community_message_preview(text) from public, anon, authenticated;

drop function if exists public.record_phishing_report(uuid, text, text, text[], text, text, smallint, timestamptz);

create function public.record_phishing_report(
  p_device_id uuid,
  p_message_text text,
  p_sample_sender text,
  p_indicator_codes text[],
  p_rule_version text,
  p_source text default 'manual',
  p_risk_score smallint default null,
  p_message_received_at timestamptz default null,
  p_detected_in text default 'unknown'
)
returns table (
  report_id uuid,
  viral_score smallint,
  report_count integer,
  is_first_reporter boolean,
  notification_event_id uuid
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
  v_detected_in text := coalesce(p_detected_in, 'unknown');
  v_normalized text;
  v_hash text;
  v_report_id uuid;
  v_report_count integer;
  v_event_id uuid;
  v_notification_event_id uuid;
  v_new_reporter boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_device_id is null
    or v_source not in ('manual', 'realtime')
    or (v_source = 'manual' and v_detected_in not in ('manual', 'unknown'))
    or (v_source = 'realtime' and v_detected_in not in ('messages', 'messenger', 'unknown'))
    or (p_risk_score is not null and p_risk_score not between 0 and 100)
    or p_risk_score = 0
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

  insert into public.viral_phishing_report_events (
    report_id, user_id, device_id, source, risk_score, sample_sender, message_received_at, detected_in
  )
  values (
    v_report_id, v_user_id, p_device_id, v_source, p_risk_score,
    nullif(trim(coalesce(p_sample_sender, '')), ''), p_message_received_at, v_detected_in
  )
  on conflict (report_id, user_id, source) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    v_notification_event_id := v_event_id;
    insert into public.community_notification_outbox (event_id, report_id, reporter_id, source)
    values (v_event_id, v_report_id, v_user_id, v_source)
    on conflict (event_id) do nothing;
  else
    update public.viral_phishing_report_events as e
    set sample_sender = coalesce(e.sample_sender, nullif(trim(coalesce(p_sample_sender, '')), '')),
        message_received_at = coalesce(e.message_received_at, p_message_received_at),
        detected_in = case when e.detected_in = 'unknown' then v_detected_in else e.detected_in end
    where e.report_id = v_report_id and e.user_id = v_user_id and e.source = v_source
    returning e.id into v_notification_event_id;
  end if;

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
  select r.id, r.viral_score, r.report_count,
    (v_event_id is not null and v_new_reporter and v_report_count = 1),
    v_notification_event_id
  from public.viral_phishing_reports as r
  where r.id = v_report_id;
end;
$$;

revoke all on function public.record_phishing_report(uuid, text, text, text[], text, text, smallint, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_phishing_report(uuid, text, text, text[], text, text, smallint, timestamptz, text)
  to authenticated;

drop function if exists public.get_community_report_feed(integer, integer);
drop function if exists public.get_viral_phishing_metadata_ranking(integer, text);

create function public.get_community_report_message_feed(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  report_event_id uuid,
  message_preview text,
  detected_in text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_limit is null or p_limit not between 1 and 200
    or p_offset is null or p_offset not between 0 and 1000000 then
    raise exception 'invalid community report limit' using errcode = '22023';
  end if;

  return query
  select e.id, public.redact_community_message_preview(r.message_text), e.detected_in
  from public.viral_phishing_report_events as e
  join public.viral_phishing_reports as r on r.id = e.report_id
  order by e.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.get_community_report_message_feed(integer, integer) from public, anon, authenticated;
grant execute on function public.get_community_report_message_feed(integer, integer) to authenticated;

create function public.get_viral_phishing_message_ranking(p_limit integer default 20, p_source text default null)
returns table (
  report_id uuid,
  message_preview text,
  detected_in text[],
  report_count integer
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

  if p_limit is null or p_limit not between 1 and 50
    or (p_source is not null and p_source not in ('manual', 'realtime')) then
    raise exception 'invalid ranking parameters' using errcode = '22023';
  end if;

  return query
  with report_totals as (
    select
      e.report_id,
      count(distinct e.user_id)::integer as report_count,
      max(e.created_at) as last_reported_at,
      array_agg(distinct e.detected_in order by e.detected_in) as detected_in
    from public.viral_phishing_report_events as e
    where p_source is null or e.source = p_source
    group by e.report_id
  )
  select
    r.id,
    public.redact_community_message_preview(r.message_text),
    totals.detected_in,
    totals.report_count
  from report_totals as totals
  join public.viral_phishing_reports as r on r.id = totals.report_id
  where coalesce(r.risk_score, 1) > 0
  order by r.viral_score desc, totals.report_count desc, totals.last_reported_at desc
  limit p_limit;
end;
$$;

revoke all on function public.get_viral_phishing_message_ranking(integer, text) from public, anon, authenticated;
grant execute on function public.get_viral_phishing_message_ranking(integer, text) to authenticated;

notify pgrst, 'reload schema';

commit;
