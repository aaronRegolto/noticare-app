-- Separates "Most reported phishing messages" by where the report came from:
--   manual   - Report & Block on a Manual Scan result
--   realtime - Block & Report on a real-time (notification listener) warning
--
-- The source is recorded per reporter event. One person may now hold one event per source for
-- the same message, so a text reported both ways appears in both rankings. The message-level
-- report_count/viral_score still count each person once, whichever way they reported it.
--
-- Events recorded before this migration have no known source and default to 'manual'.
-- Clients that don't send p_source (older app builds) keep working: their reports are recorded
-- as 'manual', and get_viral_phishing_ranking without p_source returns the combined ranking.

begin;

alter table public.viral_phishing_report_events
  add column source text not null default 'manual' check (source in ('manual', 'realtime'));

alter table public.viral_phishing_report_events
  drop constraint viral_phishing_report_events_one_per_user;
alter table public.viral_phishing_report_events
  add constraint viral_phishing_report_events_one_per_user_source unique (report_id, user_id, source);

create index viral_phishing_report_events_source_idx
  on public.viral_phishing_report_events (source, report_id);

drop function public.record_phishing_report(uuid, text, text, text[], text);

create function public.record_phishing_report(
  p_device_id uuid,
  p_message_text text,
  p_sample_sender text,
  p_indicator_codes text[],
  p_rule_version text,
  p_source text default 'manual'
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
    message_hash, message_text, sample_sender, indicator_codes, rule_version, viral_score
  )
  values (
    v_hash, left(trim(p_message_text), 4000), nullif(trim(coalesce(p_sample_sender, '')), ''),
    coalesce(p_indicator_codes, '{}'::text[]), trim(p_rule_version), v_initial_score
  )
  on conflict (message_hash) do nothing
  returning id into v_report_id;

  if v_report_id is null then
    select r.id into v_report_id from public.viral_phishing_reports as r where r.message_hash = v_hash;
  end if;

  -- Decided before inserting: is this person's first report of this message, from any source?
  v_new_reporter := not exists (
    select 1 from public.viral_phishing_report_events as e
    where e.report_id = v_report_id and e.user_id = v_user_id
  );

  insert into public.viral_phishing_report_events (report_id, user_id, device_id, source)
  values (v_report_id, v_user_id, p_device_id, v_source)
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

  return query
  select r.id, r.viral_score, r.report_count, (v_event_id is not null and v_new_reporter and v_report_count = 1)
  from public.viral_phishing_reports as r
  where r.id = v_report_id;
end;
$$;

revoke all on function public.record_phishing_report(uuid, text, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.record_phishing_report(uuid, text, text, text[], text, text) to authenticated;

drop function public.get_viral_phishing_ranking(integer);

-- With p_source, the ranking only includes messages reported from that source, and its
-- report_count / viral_score / dates describe that source's reporters alone (same scoring rule
-- as record_phishing_report). Without p_source it is the combined ranking, as before.
create function public.get_viral_phishing_ranking(p_limit integer default 20, p_source text default null)
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
    select r.id, r.message_text, r.sample_sender, r.viral_score, r.report_count, r.first_reported_at, r.last_reported_at
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
    s.last_at
  from public.viral_phishing_reports as r
  join (
    select e.report_id as rid, count(*) as reporters, min(e.created_at) as first_at, max(e.created_at) as last_at
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
