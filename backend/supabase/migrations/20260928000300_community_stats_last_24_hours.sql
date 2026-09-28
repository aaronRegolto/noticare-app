-- Adds a rolling 'last_24_hours' range to get_community_stats.
--
-- 'today' covers the UTC calendar day, which in the Philippines (UTC+8) runs 8 AM to 8 AM the
-- next day, so a "Today" chart started mid-morning and ran into tomorrow. The app now asks for
-- the last 24 hours ending now and labels the hours in the user's own time zone. 'today' and the
-- other ranges are unchanged so older app builds keep working.

begin;

create or replace function public.get_community_stats(p_range text)
returns table (
  date timestamptz,
  safe_count bigint,
  suspicious_count bigint,
  dangerous_count bigint,
  blocked_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_start_date date;
  v_start_month date;
begin
  if p_range not in ('last_24_hours', 'today', 'last_7_days', 'last_30_days', 'last_6_months') then
    raise exception 'unsupported community range' using errcode = '22023';
  end if;

  if p_range = 'last_24_hours' then
    return query
    select
      h.bucket_start as date,
      h.safe_count,
      h.suspicious_count,
      h.dangerous_count,
      h.successfully_blocked_count as blocked_count
    from public.community_hourly_stats as h
    where h.bucket_start >= date_trunc('hour', now()) - interval '23 hours'
      and h.bucket_start <= date_trunc('hour', now())
    order by h.bucket_start;
    return;
  end if;

  if p_range = 'today' then
    return query
    select
      h.bucket_start as date,
      h.safe_count,
      h.suspicious_count,
      h.dangerous_count,
      h.successfully_blocked_count as blocked_count
    from public.community_hourly_stats as h
    where h.bucket_start >= v_day_start
      and h.bucket_start < v_day_start + interval '1 day'
    order by h.bucket_start;
    return;
  end if;

  if p_range = 'last_7_days' then
    v_start_date := (v_day_start at time zone 'UTC')::date - 6;
  elsif p_range = 'last_30_days' then
    v_start_date := (v_day_start at time zone 'UTC')::date - 29;
  else
    v_start_month := (date_trunc('month', v_day_start at time zone 'UTC') - interval '5 months')::date;
  end if;

  if p_range in ('last_7_days', 'last_30_days') then
    return query
    select
      d.bucket_date::timestamp at time zone 'UTC' as date,
      d.safe_count,
      d.suspicious_count,
      d.dangerous_count,
      d.successfully_blocked_count as blocked_count
    from public.community_daily_stats as d
    where d.bucket_date >= v_start_date
      and d.bucket_date <= (v_day_start at time zone 'UTC')::date
    order by d.bucket_date;
    return;
  end if;

  return query
  select
    date_trunc('month', d.bucket_date::timestamp) at time zone 'UTC' as date,
    coalesce(sum(d.safe_count), 0)::bigint as safe_count,
    coalesce(sum(d.suspicious_count), 0)::bigint as suspicious_count,
    coalesce(sum(d.dangerous_count), 0)::bigint as dangerous_count,
    coalesce(sum(d.successfully_blocked_count), 0)::bigint as blocked_count
  from public.community_daily_stats as d
  where d.bucket_date >= v_start_month
    and d.bucket_date <= (v_day_start at time zone 'UTC')::date
  group by date_trunc('month', d.bucket_date::timestamp)
  order by date_trunc('month', d.bucket_date::timestamp);
end;
$$;

commit;
