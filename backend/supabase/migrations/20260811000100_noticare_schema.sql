-- NotiCare's privacy-minimized Supabase schema.
--
-- This schema deliberately contains no message body, sender number, notification
-- title, raw URL, clipboard value, OTP, hardware identifier, or encryption key.
-- All timestamps are timestamptz and are written/read as UTC.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.threat_source as enum ('realtime', 'manual');
create type public.threat_level as enum ('safe', 'suspicious', 'dangerous');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Only the last four digits of a verified phone number are retained.
  phone_last4 text check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  -- Generated once by the app; it is not an advertising, hardware, or OS ID.
  installation_id uuid not null,
  app_version text not null check (char_length(app_version) between 1 and 64),
  rule_version text not null check (char_length(rule_version) between 1 and 64),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_user_installation_key unique (user_id, installation_id)
);

create table public.threat_events (
  id uuid primary key default gen_random_uuid(),
  -- The client creates this UUID once and keeps it in the offline queue. It makes
  -- retrying an upload idempotent without storing message-derived identifiers.
  client_event_id uuid not null unique,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  source public.threat_source not null,
  threat_level public.threat_level not null,
  -- 0..10 represents a 0..100 score without transmitting the exact score.
  score_bucket smallint not null check (score_bucket between 0 and 10),
  blocked boolean not null default false,
  -- Stable rule codes only (for example "url_ip_address"), never raw text.
  indicator_codes text[] not null default '{}'::text[]
    check (cardinality(indicator_codes) <= 32),
  url_count smallint not null default 0 check (url_count between 0 and 20),
  rule_version text not null check (char_length(rule_version) between 1 and 64),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  -- Demo/test events may be retained for diagnostics, but never affect aggregates.
  is_demo boolean not null default false,
  constraint threat_events_blocking_is_realtime_dangerous check (
    not blocked
    or (source = 'realtime'::public.threat_source
        and threat_level = 'dangerous'::public.threat_level)
  )
);

create table public.community_daily_stats (
  bucket_date date primary key,
  safe_count bigint not null default 0 check (safe_count >= 0),
  suspicious_count bigint not null default 0 check (suspicious_count >= 0),
  dangerous_count bigint not null default 0 check (dangerous_count >= 0),
  successfully_blocked_count bigint not null default 0
    check (successfully_blocked_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The hourly table supports the Dashboard's "Today" chart without exposing
-- individual events. The daily table remains the canonical long-range aggregate.
create table public.community_hourly_stats (
  bucket_start timestamptz primary key,
  safe_count bigint not null default 0 check (safe_count >= 0),
  suspicious_count bigint not null default 0 check (suspicious_count >= 0),
  dangerous_count bigint not null default 0 check (dangerous_count >= 0),
  successfully_blocked_count bigint not null default 0
    check (successfully_blocked_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rule_sets (
  version text primary key check (char_length(version) between 1 and 64),
  rule_bundle jsonb not null check (jsonb_typeof(rule_bundle) = 'object'),
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  active boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Only one version is distributable at a time. A privileged release job changes
-- the active version in a transaction.
create unique index rule_sets_one_active_version
  on public.rule_sets (active)
  where active;

create table public.scan_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  -- Nullable for feedback attached to a Manual Scan that was intentionally not
  -- uploaded as a threat event.
  event_id uuid references public.threat_events(id) on delete set null,
  expected_level public.threat_level not null,
  indicator_codes text[] not null default '{}'::text[]
    check (cardinality(indicator_codes) <= 32),
  rule_version text not null check (char_length(rule_version) between 1 and 64),
  created_at timestamptz not null default now()
);

create index devices_user_last_seen_idx
  on public.devices (user_id, last_seen_at desc);
create index threat_events_user_occurred_idx
  on public.threat_events (user_id, occurred_at desc);
create index threat_events_device_occurred_idx
  on public.threat_events (device_id, occurred_at desc);
create index threat_events_aggregate_idx
  on public.threat_events (occurred_at desc)
  where not is_demo;
create index scan_feedback_user_created_idx
  on public.scan_feedback (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger devices_set_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

create trigger community_daily_stats_set_updated_at
before update on public.community_daily_stats
for each row execute function public.set_updated_at();

create trigger community_hourly_stats_set_updated_at
before update on public.community_hourly_stats
for each row execute function public.set_updated_at();

-- Provision/update only masked profile metadata when an Auth user is created or
-- changes their verified phone. The raw phone is never copied into public tables.
create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_phone text := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
begin
  insert into public.profiles (user_id, phone_last4)
  values (
    new.id,
    case
      when char_length(normalized_phone) >= 4 then right(normalized_phone, 4)
      else null
    end
  )
  on conflict (user_id) do update
    set phone_last4 = excluded.phone_last4,
        updated_at = now();

  return new;
end;
$$;

create trigger auth_user_profile_after_insert
after insert on auth.users
for each row execute function public.sync_profile_from_auth_user();

create trigger auth_user_profile_after_phone_update
after update of phone on auth.users
for each row execute function public.sync_profile_from_auth_user();

-- Backfill profiles for any Auth users created before this migration is applied.
insert into public.profiles (user_id, phone_last4)
select
  u.id,
  case
    when char_length(regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g')) >= 4
      then right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 4)
    else null
  end
from auth.users as u
on conflict (user_id) do nothing;

-- A device must belong to the same user recorded on every event. This protects
-- integrity even if privileged tooling inserts data outside the mobile RPC.
create or replace function public.assert_event_device_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.devices as d
    where d.id = new.device_id
      and d.user_id = new.user_id
  ) then
    raise exception 'device does not belong to event user'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger threat_events_assert_device_owner
before insert or update of user_id, device_id on public.threat_events
for each row execute function public.assert_event_device_owner();

-- A feedback record may point only to an event owned by that same user. The
-- trigger complements the secured feedback RPC and protects admin tooling too.
create or replace function public.assert_feedback_event_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.event_id is not null and not exists (
    select 1
    from public.threat_events as e
    where e.id = new.event_id
      and e.user_id = new.user_id
  ) then
    raise exception 'feedback event does not belong to feedback user'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger scan_feedback_assert_event_owner
before insert or update of user_id, event_id on public.scan_feedback
for each row execute function public.assert_feedback_event_owner();

-- Aggregate only non-demo metadata. No raw user/device/message data reaches
-- these tables, so the Dashboard can show community trends safely.
create or replace function public.aggregate_threat_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  daily_bucket date := (new.occurred_at at time zone 'UTC')::date;
  hourly_bucket timestamptz := date_trunc('hour', new.occurred_at at time zone 'UTC') at time zone 'UTC';
  safe_increment bigint := case when new.threat_level = 'safe'::public.threat_level then 1 else 0 end;
  suspicious_increment bigint := case when new.threat_level = 'suspicious'::public.threat_level then 1 else 0 end;
  dangerous_increment bigint := case when new.threat_level = 'dangerous'::public.threat_level then 1 else 0 end;
  blocked_increment bigint := case when new.blocked then 1 else 0 end;
begin
  if new.is_demo then
    return new;
  end if;

  insert into public.community_daily_stats (
    bucket_date,
    safe_count,
    suspicious_count,
    dangerous_count,
    successfully_blocked_count
  )
  values (
    daily_bucket,
    safe_increment,
    suspicious_increment,
    dangerous_increment,
    blocked_increment
  )
  on conflict (bucket_date) do update
    set safe_count = public.community_daily_stats.safe_count + excluded.safe_count,
        suspicious_count = public.community_daily_stats.suspicious_count + excluded.suspicious_count,
        dangerous_count = public.community_daily_stats.dangerous_count + excluded.dangerous_count,
        successfully_blocked_count = public.community_daily_stats.successfully_blocked_count + excluded.successfully_blocked_count,
        updated_at = now();

  insert into public.community_hourly_stats (
    bucket_start,
    safe_count,
    suspicious_count,
    dangerous_count,
    successfully_blocked_count
  )
  values (
    hourly_bucket,
    safe_increment,
    suspicious_increment,
    dangerous_increment,
    blocked_increment
  )
  on conflict (bucket_start) do update
    set safe_count = public.community_hourly_stats.safe_count + excluded.safe_count,
        suspicious_count = public.community_hourly_stats.suspicious_count + excluded.suspicious_count,
        dangerous_count = public.community_hourly_stats.dangerous_count + excluded.dangerous_count,
        successfully_blocked_count = public.community_hourly_stats.successfully_blocked_count + excluded.successfully_blocked_count,
        updated_at = now();

  return new;
end;
$$;

create trigger threat_events_aggregate_after_insert
after insert on public.threat_events
for each row execute function public.aggregate_threat_event();

commit;
