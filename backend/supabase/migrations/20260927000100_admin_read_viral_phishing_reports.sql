begin;

-- Reported message text is available to administrators only through the admin
-- dashboard. The mobile app continues using its narrowly scoped RPCs.
revoke all on table public.viral_phishing_reports from public, anon, authenticated;
grant select on table public.viral_phishing_reports to authenticated;
create policy "admins can read reported phishing messages"
  on public.viral_phishing_reports
  for select
  to authenticated
  using ((select public.is_admin()));

commit;