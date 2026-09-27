-- record_phishing_report and get_phishing_message_virality both call digest(...) to hash message
-- text, but pgcrypto's digest() lives in the `extensions` schema on Supabase projects, not
-- `public`. Both functions set search_path = pg_catalog, public (deliberately excluding
-- `extensions` for security), so the bare, unqualified call fails at runtime with
-- "function digest(text, unknown) does not exist" (42883) every single time — meaning no
-- Report & Block tap has ever actually saved a row to viral_phishing_reports. The seed rule-set
-- migration already got this right by calling extensions.digest(...); these two did not.

begin;

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

  v_hash := encode(extensions.digest(public.normalize_phishing_message_text(p_message_text), 'sha256'), 'hex');

  return query
  select r.id, r.viral_score, r.report_count, r.first_reported_at
  from public.viral_phishing_reports as r
  where r.message_hash = v_hash;
end;
$$;

commit;
