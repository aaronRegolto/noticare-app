begin;

create or replace function public.get_community_report_message_feed(
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
      when r.indicator_codes && array[
        'credential-request',
        'account-warning',
        'access-loss-threat',
        'money-transfer-request',
        'advance-fee-request',
        'credential-link-combination',
        'account-link-combination',
        'bait-link-combination',
        'link-pressure-combination',
        'credential-urgency-combination',
        'account-urgency-combination',
        'brand-with-unrelated-url',
        'url-with-sensitive-request',
        'url-ip-address',
        'url-shortener',
        'url-punycode',
        'url-unicode-confusable',
        'url-at-sign',
        'url-excessive-subdomains',
        'url-nonstandard-port',
        'url-misleading-path',
        'url-redirect-parameter',
        'url-obfuscated'
      ]::text[] then 'phishing'
      when r.indicator_codes && array['direct-threat', 'cyber-threat']::text[] then 'threat'
      when r.indicator_codes && array[
        'v3-model-risk',
        'repeat-sender-escalation',
        'prize-or-reward-bait',
        'high-value-bonus-offer',
        'refund-bait',
        'parcel-delivery-bait',
        'unpaid-bill-pressure',
        'urgency-pressure',
        'link-or-reply-pressure',
        'government-aid-impersonation',
        'money-transfer-request',
        'advance-fee-request'
      ]::text[] then 'spam'
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
