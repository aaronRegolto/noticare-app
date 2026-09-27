                -- The 2026.09.10 rule set was confirmed active and working in an earlier manual
-- test, but Postgres logs now show "unknown or invalid rule version" (22023)
-- again for both record_threat_event and submit_scan_feedback. Since
-- rule_sets_one_active_version only allows one active=true row at a time,
-- something must have re-activated an older row afterward, silently flipping
-- 2026.09.10 back to inactive. This migration is idempotent: it forces
-- 2026.09.10 to be the sole active row regardless of the table's current
-- state, so it's safe to run even if the table already looks correct.

begin;

-- Must run before the update below, for the same reason as the original seed:
-- the partial unique index forbids two active=true rows existing at once.
update public.rule_sets set active = false where version <> '2026.09.10';

update public.rule_sets set active = true where version = '2026.09.10';

commit;

-- If this affected 0 rows, the 2026.09.10 row doesn't exist at all in this
-- environment (not just inactive) and 20260927000200_seed_rule_set_2026_09_10.sql
-- needs to be re-run instead of this file. Check first with:
--   select version, active from public.rule_sets order by version;
