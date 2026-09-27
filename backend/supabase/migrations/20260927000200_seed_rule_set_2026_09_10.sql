-- The app's on-device rule engines (src/features/detection/rules.ts and
-- plugins/android/SmishingEvaluator.kt) were updated to RULE_VERSION '2026.09.10' without a
-- matching row ever being added to public.rule_sets. assert_indicator_codes() looks up the
-- exact version string the client sends and rejects anything it can't find (error 22023,
-- "unknown or invalid rule version") — so every submit_scan_feedback and record_threat_event
-- call from an app build newer than the 2026.08.1 seed has been failing outright.
--
-- The indicator codes and thresholds themselves have not changed since that seed — verified
-- against both engines' current code lists — so this reuses the same rule_bundle content under
-- the new version string rather than guessing at what changed.

begin;

-- Must run before the insert below: rule_sets_one_active_version only allows one
-- active=true row at a time, so the old row has to be deactivated first, not after.
update public.rule_sets set active = false where version = '2026.08.1';

with seed as (
  select jsonb_build_object(
    -- Keep this in lockstep with src/features/detection/rules.ts and
    -- plugins/android/SmishingEvaluator.kt's RULE_VERSION.
    'version', '2026.09.10',
    'thresholds', jsonb_build_object(
      'safeMax', 29,
      'suspiciousMax', 69,
      'dangerousMin', 70,
      'scoreCap', 100
    ),
    'allowedIndicatorCodes', jsonb_build_array(
      'credential-request',
      'account-warning',
      'urgency-pressure',
      'link-or-reply-pressure',
      'prize-or-reward-bait',
      'refund-bait',
      'parcel-delivery-bait',
      'unpaid-bill-pressure',
      'government-aid-impersonation',
      'access-loss-threat',
      'obfuscated-text',
      'url-ip-address',
      'url-shortener',
      'url-punycode',
      'url-unicode-confusable',
      'url-at-sign',
      'url-excessive-subdomains',
      'url-nonstandard-port',
      'url-misleading-path',
      'url-redirect-parameter',
      'url-obfuscated',
      'url-with-sensitive-request',
      'brand-with-unrelated-url',
      'credential-link-combination',
      'account-link-combination',
      'link-pressure-combination',
      'bait-link-combination',
      'credential-urgency-combination',
      'account-urgency-combination',
      'gcash',
      'maya',
      'bdo',
      'bpi',
      'landbank',
      'metrobank',
      'unionbank',
      'pagibig',
      'dswd'
    ),
    'combinationBonuses', jsonb_build_array(
      jsonb_build_object(
        'requires', jsonb_build_array('credential-request', 'url'),
        'weight', 22,
        'code', 'credential-link-combination'
      ),
      jsonb_build_object(
        'requires', jsonb_build_array('account-warning', 'url'),
        'weight', 15,
        'code', 'account-link-combination'
      ),
      jsonb_build_object(
        'requires', jsonb_build_array('link-or-reply-pressure', 'url'),
        'weight', 15,
        'code', 'link-pressure-combination'
      )
    ),
    'urlIndicators', jsonb_build_object(
      'url-ip-address', 35,
      'url-shortener', 30,
      'url-punycode', 32,
      'url-unicode-confusable', 32,
      'url-at-sign', 32,
      'url-excessive-subdomains', 13,
      'url-nonstandard-port', 16,
      'url-misleading-path', 10,
      'url-redirect-parameter', 14,
      'url-obfuscated', 32
    ),
    'languageRules', jsonb_build_array(
      jsonb_build_object(
        'code', 'credential-request',
        'weight', 30,
        'patterns', jsonb_build_array(
          'share your otp', 'send your otp', 'password', 'pin',
          'ibigay ang otp', 'i-send ang otp', 'ibigay ang pin'
        )
      ),
      jsonb_build_object(
        'code', 'urgency-pressure',
        'weight', 12,
        'patterns', jsonb_build_array(
          'verify now', 'limited time', 'act now', 'urgent',
          'i-verify agad', 'huling pagkakataon', 'mawawala ang access'
        )
      ),
      jsonb_build_object(
        'code', 'account-warning',
        'weight', 23,
        'patterns', jsonb_build_array(
          'account suspended', 'account locked', 'unusual activity',
          'suspend ang account', 'mawawala ang access', 'i-verify ang account'
        )
      ),
      jsonb_build_object(
        'code', 'prize-or-reward-bait',
        'weight', 18,
        'patterns', jsonb_build_array(
          'claim your reward', 'you won', 'refund available', 'cash prize',
          'nanalo ka', 'i-claim ang premyo', 'may refund ka'
        )
      ),
      jsonb_build_object(
        'code', 'parcel-delivery-bait',
        'weight', 17,
        'patterns', jsonb_build_array(
          'parcel delivery failed', 'delivery failed', 'redelivery fee',
          'hindi ma-deliver ang parcel', 'bayaran ang delivery fee'
        )
      ),
      jsonb_build_object(
        'code', 'brand-with-unrelated-url',
        'weight', 18,
        'patterns', jsonb_build_array('gcash', 'maya', 'bdo', 'bpi')
      )
    )
  ) as rule_bundle
)
insert into public.rule_sets (version, rule_bundle, checksum, active, published_at)
select
  '2026.09.10',
  rule_bundle,
  encode(extensions.digest(rule_bundle::text, 'sha256'), 'hex'),
  true,
  now()
from seed
on conflict (version) do nothing;

commit;
