begin;

-- Lets the admin dashboard receive new threat_events rows the instant `record_threat_event`
-- inserts them, instead of only finding out on the next manual/interval refresh. Realtime still
-- enforces the table's existing RLS: an authenticated non-admin subscriber sees only rows their
-- own policies already allow (none, for threat_events), and an admin sees inserts the same way
-- the "admins can read all rows" policy already lets them SELECT them over REST.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'threat_events'
  ) then
    alter publication supabase_realtime add table public.threat_events;
  end if;
end;
$$;

commit;
