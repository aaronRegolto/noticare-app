begin;

-- Membership is managed only by the project owner through SQL, never by clients.
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;

create function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'devices', 'threat_events', 'scan_feedback', 'community_daily_stats', 'community_hourly_stats', 'rule_sets']
  loop
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create policy "admins can read all rows" on public.%I for select to authenticated using ((select public.is_admin()))', table_name);
  end loop;
end;
$$;
commit;
