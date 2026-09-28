-- Rule set 2026.09.29 (src/features/detection/rules.ts and plugins/android/SmishingEvaluator.kt)
-- adds two indicator codes for common Philippine scams that 2026.09.10 scored Safe:
--   money-transfer-request  money asked for by a "new number", fake boss, or to a personal account
--   advance-fee-request     a fee demanded before a prize, loan, refund, job, or parcel is released
-- Every other code, weight, and threshold is unchanged, so this copies the 2026.09.10 bundle
-- (including the v3-model-risk code) under the new version and appends the two codes.
--
-- The 2026.09.10 row is kept: assert_indicator_codes() accepts any recorded version, so phones
-- still running an older build keep uploading successfully.

begin;

-- rule_sets_one_active_version allows only one active row, so deactivate first.
update public.rule_sets set active = false where version <> '2026.09.29';

with next_bundle as (
  select jsonb_set(
    jsonb_set(rule_bundle, '{version}', '"2026.09.29"'::jsonb),
    '{allowedIndicatorCodes}',
    (rule_bundle -> 'allowedIndicatorCodes') || '["money-transfer-request", "advance-fee-request"]'::jsonb
  ) as bundle
  from public.rule_sets
  where version = '2026.09.10'
)
insert into public.rule_sets (version, rule_bundle, checksum, active, published_at)
select
  '2026.09.29',
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

-- Check afterwards:
--   select version, active, rule_bundle -> 'allowedIndicatorCodes' from public.rule_sets order by version;
