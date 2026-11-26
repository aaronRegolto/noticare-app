begin;

create function public.redact_community_message_content(p_message_text text)
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
    else trim(message)
  end
  from redacted_numbers;
$$;

revoke all on function public.redact_community_message_content(text) from public, anon, authenticated;

create or replace function public.get_community_report_message_feed(
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
  select e.id, public.redact_community_message_content(r.message_text), e.detected_in
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
