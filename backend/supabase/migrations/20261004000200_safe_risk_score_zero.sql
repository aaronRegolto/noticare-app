-- Safe results always carry a score of 0.
--
-- Classification is unchanged: a raw score under 30 is Safe, 30-69 Suspicious and 70-100
-- Dangerous (the 'thresholds' in rule_sets.rule_bundle, which this migration does not touch). The
-- app now shows, stores and sends every Safe result with score 0 instead of its raw 1-29. Old app
-- builds, and events and reports already queued on phones (the JS AsyncStorage queues,
-- EncryptedTelemetryQueue and EncryptedCommunityReportQueue), still carry the score from when they
-- were queued, so the database normalizes every write too:
--   threat_events                 threat_level 'safe' -> score_bucket 0 (was floor(score / 10), 0-2)
--   viral_phishing_report_events  risk_score 1-29     -> 0
--   viral_phishing_reports        risk_score 1-29     -> 0
-- The triggers coerce and never reject: clients retry a failed upload forever, so raising here
-- would leave old-build uploads stuck. A NULL risk_score (reports filed before
-- 20260928000200_phishing_report_risk_score.sql) stays NULL.
--
-- The report tables have no threat level, so they key on the score. That is exact: level is a
-- function of the raw score, and V3RiskEvaluator's model reinforcement lifts a Safe result to at
-- least 30, so 1-29 only ever comes from a Safe result. The 29 here must move together with
-- thresholds.safeMax if that threshold ever changes.
--
-- Indicator codes on Safe results are kept on purpose: they are the tuning signal for scams the
-- rules missed. scan_feedback and the community stats tables hold no score and are unchanged.
--
-- The backfill at the end rewrites existing rows and cannot be undone. On those UPDATEs only the
-- new triggers and viral_phishing_reports_set_updated_at fire (it bumps updated_at, which nothing
-- reads): threat_events_assert_device_owner fires only when user_id or device_id is updated, and
-- aggregate_threat_event only on insert, so community counts do not change. threat_events is in
-- the supabase_realtime publication, so each backfilled row is also one Realtime UPDATE; the admin
-- stream listens for INSERTs only.

begin;

create or replace function public.zero_safe_threat_event_score()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.threat_level = 'safe'::public.threat_level then
    new.score_bucket := 0;
  end if;

  return new;
end;
$$;

create trigger threat_events_zero_safe_score
before insert or update of threat_level, score_bucket on public.threat_events
for each row execute function public.zero_safe_threat_event_score();

create or replace function public.zero_safe_risk_score()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.risk_score between 1 and 29 then
    new.risk_score := 0;
  end if;

  return new;
end;
$$;

create trigger viral_phishing_report_events_zero_safe_risk_score
before insert or update of risk_score on public.viral_phishing_report_events
for each row execute function public.zero_safe_risk_score();

-- Also covers record_phishing_report's greatest(existing, new) update, so a message reported only
-- from Safe results ends at 0 while one any reporter judged Dangerous keeps that score.
create trigger viral_phishing_reports_zero_safe_risk_score
before insert or update of risk_score on public.viral_phishing_reports
for each row execute function public.zero_safe_risk_score();

-- Trigger helpers are implementation details, not Data API RPCs.
revoke all on function public.zero_safe_threat_event_score() from public, anon, authenticated;
revoke all on function public.zero_safe_risk_score() from public, anon, authenticated;

-- One-off backfill of rows written before this migration, including is_demo rows.
update public.threat_events
set score_bucket = 0
where threat_level = 'safe'::public.threat_level
  and score_bucket <> 0;

update public.viral_phishing_report_events
set risk_score = 0
where risk_score between 1 and 29;

update public.viral_phishing_reports
set risk_score = 0
where risk_score between 1 and 29;

commit;

-- Check afterwards (each should return 0):
--   select count(*) from public.threat_events where threat_level = 'safe' and score_bucket <> 0;
--   select count(*) from public.viral_phishing_report_events where risk_score between 1 and 29;
--   select count(*) from public.viral_phishing_reports where risk_score between 1 and 29;
