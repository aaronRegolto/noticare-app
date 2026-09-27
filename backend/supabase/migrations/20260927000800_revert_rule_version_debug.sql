-- Reverts the temporary diagnostic verbosity added in
-- 20260927000600_debug_rule_version_mismatch.sql now that the actual bug (the
-- ML-reinforced ruleVersion suffix in V3RiskEvaluator.kt) has been found and
-- fixed. Restores assert_indicator_codes to its original error message.

begin;

create or replace function public.assert_indicator_codes(
  p_codes text[],
  p_rule_version text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule_bundle jsonb;
begin
  if char_length(trim(coalesce(p_rule_version, ''))) not between 1 and 64 then
    raise exception 'invalid rule version' using errcode = '22023';
  end if;

  if cardinality(coalesce(p_codes, '{}'::text[])) > 32 then
    raise exception 'too many indicator codes' using errcode = '22023';
  end if;

  select r.rule_bundle
  into v_rule_bundle
  from public.rule_sets as r
  where r.version = trim(p_rule_version);

  if not found or jsonb_typeof(v_rule_bundle -> 'allowedIndicatorCodes') <> 'array' then
    raise exception 'unknown or invalid rule version' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_codes, '{}'::text[])) as code(value)
    where char_length(code.value) > 64
      or code.value !~ '^[a-z0-9][a-z0-9_.:-]{0,63}$'
      or not ((v_rule_bundle -> 'allowedIndicatorCodes') ? code.value)
  ) then
    raise exception 'indicator codes must be in the published rule-set allow-list'
      using errcode = '22023';
  end if;
end;
$$;

commit;
