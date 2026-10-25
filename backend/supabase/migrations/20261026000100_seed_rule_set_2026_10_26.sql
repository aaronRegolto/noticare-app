-- Rule set 2026.10.26 lowers the Suspicious floor to 1 and Dangerous floor to 60,
-- and adds the high-value bonus promotion indicator.
begin;

update public.rule_sets set active = false where version <> '2026.10.26';

with next_bundle as (
  select jsonb_set(
    jsonb_set(
      jsonb_set(rule_bundle, '{version}', '"2026.10.26"'::jsonb),
      '{thresholds}',
      '{"safeMax":0,"suspiciousMax":59,"dangerousMin":60,"scoreCap":100}'::jsonb
    ),
    '{allowedIndicatorCodes}',
    (rule_bundle -> 'allowedIndicatorCodes') ||
      '["high-value-bonus-offer", "bonus-offer-link-combination"]'::jsonb
  ) as bundle
  from public.rule_sets
  where version = '2026.10.25'
)
insert into public.rule_sets (version, rule_bundle, checksum, active, published_at)
select
  '2026.10.26',
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
