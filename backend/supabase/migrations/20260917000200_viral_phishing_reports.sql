-- Community "viral phishing message" tracking.
--
-- Unlike threat_events/scan_feedback (which never carry a message body), this
-- feature is an explicit, user-facing exception: tapping "Report & Block" on a
-- Dangerous result uploads that message's text so other installs can recognize
-- the exact same scam text circulating and see its score climb as more people
-- report it. Every screen that can reach this table's data discloses that the
-- reported text is shared. Nothing here is written from a Suspicious or Safe
-- result — only an explicit Dangerous-result report opts a message in.

begin;

create table public.viral_phishing_reports (
  id uuid primary key default gen_random_uuid(),
  -- sha256 of the normalized (trimmed/lowercased/whitespace-collapsed) message
  -- text. Lets repeat reports of the same wording collide without a full-text
  -- index or storing the raw text twice.
  message_hash text not null unique check (message_hash ~ '^[a-f0-9]{64}$'),
  message_text text not null check (char_length(message_text) between 1 and 4000),
  -- Best-effort, unverified label from whoever reported it first (for example a
  -- shortcode or masked number). Never a full contact name or a raw phone number.
  sample_sender text check (sample_sender is null or char_length(sample_sender) <= 120),
  indicator_codes text[] not null default '{}'::text[]
    check (cardinality(indicator_codes) <= 32),
  rule_version text not null check (char_length(rule_version) between 1 and 64),
  -- Distinct reporters only (see viral_phishing_report_events); tapping Report
  -- twice on one device never inflates this.
  report_count integer not null default 0 check (report_count >= 0),
  -- 0-100. Starts low for a brand-new message and rises toward 100 as more
  -- distinct people report the same text — see record_phishing_report().
  viral_score smallint not null default 0 check (viral_score between 0 and 100),
  first_reported_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per distinct (message, reporting user). Reporting the same message
-- again from the same or another device on the same account does not count as
-- a second confirmation.
create table public.viral_phishing_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.viral_phishing_reports(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint viral_phishing_report_events_one_per_user unique (report_id, user_id)
);

create index viral_phishing_reports_ranking_idx
  on public.viral_phishing_reports (viral_score desc, report_count desc, last_reported_at desc);
create index viral_phishing_report_events_report_idx
  on public.viral_phishing_report_events (report_id);

create trigger viral_phishing_reports_set_updated_at
before update on public.viral_phishing_reports
for each row execute function public.set_updated_at();

-- No client policy is defined for either table: all access goes through the
-- SECURITY DEFINER RPCs below, matching the aggregate-table pattern already
-- used for community_daily_stats/community_hourly_stats.
alter table public.viral_phishing_reports enable row level security;
alter table public.viral_phishing_report_events enable row level security;
revoke all on table public.viral_phishing_reports from public, anon, authenticated;
revoke all on table public.viral_phishing_report_events from public, anon, authenticated;

-- A brand-new message starts at this floor rather than at 0, so the client can
-- show a "New" badge with a small non-zero score the first time it's reported.
-- Each additional distinct reporter adds this many points, saturating at 100 -
-- five total reporters (1 + 4 more) is already enough to reach 100.
create or replace function public.normalize_phishing_message_text(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select lower(regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

revoke all on function public.normalize_phishing_message_text(text) from public, anon, authenticated;

-- Records (or reconfirms) a report of a Dangerous message's exact text. Returns
-- the message's current community standing so the client can update its score
-- display immediately, without a second round trip.
create or replace function public.record_phishing_report(
  p_device_id uuid,
  p_message_text text,
  p_sample_sender text,
  p_indicator_codes text[],
  p_rule_version text
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
declare
  v_initial_score constant smallint := 5;
  v_increment constant smallint := 19;
  v_user_id uuid := auth.uid();
  v_normalized text;
  v_hash text;
  v_report_id uuid;
  v_report_count integer;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_device_id is null
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
  v_hash := encode(digest(v_normalized, 'sha256'), 'hex');

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

  insert into public.viral_phishing_report_events (report_id, user_id, device_id)
  values (v_report_id, v_user_id, p_device_id)
  on conflict (report_id, user_id) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    update public.viral_phishing_reports as r
    set report_count = r.report_count + 1,
        last_reported_at = now(),
        viral_score = least(100, v_initial_score + (r.report_count) * v_increment)
    where r.id = v_report_id
    returning r.report_count into v_report_count;
  else
    select r.report_count into v_report_count from public.viral_phishing_reports as r where r.id = v_report_id;
  end if;

  return query
  select r.id, r.viral_score, r.report_count, (v_event_id is not null and v_report_count = 1)
  from public.viral_phishing_reports as r
  where r.id = v_report_id;
end;
$$;

revoke all on function public.record_phishing_report(uuid, text, text, text[], text) from public, anon, authenticated;
grant execute on function public.record_phishing_report(uuid, text, text, text[], text) to authenticated;

-- Read-only lookup so a device can show a message's current community score
-- (for example right after a fresh Manual Scan) without filing a new report.
create or replace function public.get_phishing_message_virality(p_message_text text)
returns table (
  report_id uuid,
  viral_score smallint,
  report_count integer,
  first_reported_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if char_length(trim(coalesce(p_message_text, ''))) not between 1 and 4000 then
    raise exception 'invalid message text' using errcode = '22023';
  end if;

  v_hash := encode(digest(public.normalize_phishing_message_text(p_message_text), 'sha256'), 'hex');

  return query
  select r.id, r.viral_score, r.report_count, r.first_reported_at
  from public.viral_phishing_reports as r
  where r.message_hash = v_hash;
end;
$$;

revoke all on function public.get_phishing_message_virality(text) from public, anon, authenticated;
grant execute on function public.get_phishing_message_virality(text) to authenticated;

-- Powers the Dashboard's "Most reported phishing messages" ranking. The
-- message text is returned as-is: reporting is an explicit opt-in action, and
-- this list is the whole point of reporting (warning other users about the
-- exact same scam text).
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

revoke all on function public.get_viral_phishing_ranking(integer) from public, anon, authenticated;
grant execute on function public.get_viral_phishing_ranking(integer) to authenticated;

commit;
