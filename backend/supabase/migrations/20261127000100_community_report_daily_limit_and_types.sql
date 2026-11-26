begin;

create index if not exists viral_phishing_report_events_user_created_report_idx
  on public.viral_phishing_report_events (user_id, created_at, report_id);

create function public.enforce_community_report_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recent_report_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  if exists (
    select 1
    from public.viral_phishing_report_events as e
    where e.report_id = new.report_id and e.user_id = new.user_id
  ) then
    return new;
  end if;

  select count(distinct e.report_id)::integer into v_recent_report_count
  from public.viral_phishing_report_events as e
  where e.user_id = new.user_id
    and e.created_at >= now() - interval '24 hours';

  if v_recent_report_count >= 10 then
    raise exception 'community_report_daily_limit_reached'
      using errcode = 'P0001',
            detail = 'You can submit up to 10 distinct community reports in any rolling 24-hour period.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_community_report_daily_limit() from public, anon, authenticated;

create trigger viral_phishing_report_events_daily_limit
before insert on public.viral_phishing_report_events
for each row execute function public.enforce_community_report_daily_limit();

drop function public.get_community_report_message_feed(integer, integer);

create function public.get_community_report_message_feed(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  report_event_id uuid,
  message_preview text,
  detected_in text,
  report_type text
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
  select e.id,
    public.redact_community_message_content(r.message_text),
    case
      when e.detected_in = 'unknown' and e.source = 'manual' then 'manual'
      else e.detected_in
    end,
    case
      when coalesce(e.risk_score, r.risk_score) >= 60 then 'phishing'
      when coalesce(e.risk_score, r.risk_score) between 1 and 59 then 'threat'
      else 'unknown'
    end
  from public.viral_phishing_report_events as e
  join public.viral_phishing_reports as r on r.id = e.report_id
  order by e.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.get_community_report_message_feed(integer, integer) from public, anon, authenticated;
grant execute on function public.get_community_report_message_feed(integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
