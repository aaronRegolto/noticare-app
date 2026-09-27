-- V3RiskEvaluator.kt's combine() adds a "v3-model-risk" reason whenever the
-- on-device ML model reinforces a weak Suspicious result (see
-- plugins/android/V3RiskEvaluator.kt). Its ruleVersion suffix bug (fixed
-- separately) masked this: that code was never added to rule_sets'
-- allowedIndicatorCodes allow-list, so once the version bug is fixed,
-- assert_indicator_codes would immediately reject it with "indicator codes
-- must be in the published rule-set allow-list" instead.

begin;

update public.rule_sets
set rule_bundle = jsonb_set(
  rule_bundle,
  '{allowedIndicatorCodes}',
  (rule_bundle -> 'allowedIndicatorCodes') || '["v3-model-risk"]'::jsonb
),
checksum = encode(
  extensions.digest(
    (jsonb_set(
      rule_bundle,
      '{allowedIndicatorCodes}',
      (rule_bundle -> 'allowedIndicatorCodes') || '["v3-model-risk"]'::jsonb
    ))::text,
    'sha256'
  ),
  'hex'
)
where version = '2026.09.10'
  and not ((rule_bundle -> 'allowedIndicatorCodes') ? 'v3-model-risk');

commit;
