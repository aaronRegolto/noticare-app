-- Rule set 2026.10.25 adds government-authority threats and government asset/benefit freezes.
-- Keep older rows active as accepted telemetry versions; only the newest is active.
begin;

update public.rule_sets set active = false where version <> '2026.10.25';

with next_bundle as (
  select jsonb_set(
    jsonb_set(rule_bundle, '{version}', '"2026.10.25"'::jsonb),
    '{allowedIndicatorCodes}',
    (rule_bundle -> 'allowedIndicatorCodes') ||
      '["government-authority-threat", "government-benefit-freeze", "government-coercion-combination"]'::jsonb
  ) as bundle
  from public.rule_sets
  where version = '2026.10.24'
)
insert into public.rule_sets (version, rule_bundle, checksum, active, published_at)
select
  '2026.10.25',
  bundle,
  encode(extensions.digest(bundle::text, 'sha256'), 'hex'),
  true,
  now()
from next_bundle
on conflict (version) do update
  set rule_bundle = excluded.rule_bundle,
      checksum = excluded.checksum,
      active = true;

commit;
