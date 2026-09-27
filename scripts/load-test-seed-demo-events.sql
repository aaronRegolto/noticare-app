-- Load-testing helper: seeds a large volume of synthetic threat_events rows,
-- all tagged is_demo=true, so you can see whether the admin dashboard stays
-- responsive once the table has real-world data volume. is_demo rows are
-- excluded from every aggregate/community-stats trigger and from the admin
-- Overview counts, so this cannot corrupt your real numbers.
--
-- Uses your own existing profile/device (the first one found) as the owner --
-- for a pure data-volume test, the rows do not need to belong to distinct
-- users; Postgres's query performance for pagination/counting is identical
-- either way.
--
-- Adjust ROW_COUNT below. 50,000 is a reasonable first test; Postgres can
-- insert that in a few seconds. Try 200,000+ afterward if the dashboard is
-- still fast and you want to push further.

begin;

do $$
declare
  v_row_count constant integer := 300000;
  v_user_id uuid;
  v_device_id uuid;
  v_codes constant text[] := array[
    'credential-request', 'account-warning', 'urgency-pressure', 'link-or-reply-pressure',
    'prize-or-reward-bait', 'refund-bait', 'parcel-delivery-bait', 'unpaid-bill-pressure',
    'url-ip-address', 'url-shortener', 'url-punycode', 'brand-with-unrelated-url',
    'gcash', 'maya', 'bdo', 'bpi', 'landbank'
  ];
  v_levels constant public.threat_level[] := array['safe', 'suspicious', 'dangerous']::public.threat_level[];
begin
  select d.user_id, d.id into v_user_id, v_device_id
  from public.devices as d
  order by d.created_at
  limit 1;

  if v_user_id is null then
    raise exception 'No device found. Register at least one device from the app first (open the app once while signed in), then re-run this script.';
  end if;

  insert into public.threat_events (
    client_event_id, user_id, device_id, source, threat_level, score_bucket,
    blocked, indicator_codes, url_count, rule_version, occurred_at, received_at, is_demo
  )
  select
    gen_random_uuid(),
    v_user_id,
    v_device_id,
    'manual'::public.threat_source,
    level,
    case level
      when 'safe' then (random() * 2)::smallint
      when 'suspicious' then 3 + (random() * 3)::smallint
      else 7 + (random() * 3)::smallint
    end,
    false,
    (select array_agg(code) from (
      select v_codes[1 + (random() * (array_length(v_codes, 1) - 1))::int] as code
      from generate_series(1, 1 + (random() * 2)::int)
    ) as picked),
    (random() * 3)::smallint,
    '2026.09.10',
    now() - (random() * interval '90 days'),
    now() - (random() * interval '90 days'),
    true
  from (
    select v_levels[1 + (random() * 2)::int] as level
    from generate_series(1, v_row_count)
  ) as gen;

  raise notice 'Inserted % demo threat_events rows for user %', v_row_count, v_user_id;
end;
$$;

commit;

-- After testing, remove all synthetic load with:
--   delete from public.threat_events where is_demo = true;
