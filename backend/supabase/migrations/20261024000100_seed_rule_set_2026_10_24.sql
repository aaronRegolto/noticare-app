-- Rule set 2026.10.24 adds English/Filipino abuse and threat indicators and repeat-sender
-- escalation. Keep older rows active as accepted telemetry versions; only the newest is active.
begin;

update public.rule_sets set active = false where version <> '2026.10.24';

with next_bundle as (
  select jsonb_set(
    jsonb_set(rule_bundle, '{version}', '"2026.10.24"'::jsonb),
    '{allowedIndicatorCodes}',
    (rule_bundle -> 'allowedIndicatorCodes') ||
      '["abusive-language", "direct-threat", "cyber-threat", "repeat-sender-escalation"]'::jsonb
  ) as bundle
  from public.rule_sets
  where version = '2026.09.29'
)
insert into public.rule_sets (version, rule_bundle, checksum, active, published_at)
select
  '2026.10.24',
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
