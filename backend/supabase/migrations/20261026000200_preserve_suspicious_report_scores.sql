-- Scores 1–29 are now Suspicious, not Safe. The older normalizing trigger would
-- erase valid scores in that band from viral report rankings.
begin;

drop trigger if exists viral_phishing_report_events_zero_safe_risk_score
  on public.viral_phishing_report_events;
drop trigger if exists viral_phishing_reports_zero_safe_risk_score
  on public.viral_phishing_reports;
drop function if exists public.zero_safe_risk_score();

commit;
