begin;

-- APK releases the app offers as "Update available". NotiCare is installed from an APK, not
-- Google Play, so nothing updates it automatically: on launch the app reads the newest
-- published row here and, if its version_code is higher than the installed build's, shows the
-- notes and a download link. Rows are written only through the admin functions below.
create table public.app_releases (
  id uuid primary key default gen_random_uuid(),
  -- Android versionCode of the APK (EAS shows it on the build page). Compared with the
  -- installed build's code; version_name is only for display.
  version_code integer not null unique check (version_code > 0),
  version_name text not null check (char_length(version_name) between 1 and 32),
  -- What the update is for, in one line, e.g. "Better detection of GCash scams".
  title text not null check (char_length(title) between 1 and 80),
  -- What was added or changed, one item per entry.
  changes text[] not null check (cardinality(changes) between 1 and 12 and array_position(changes, null) is null),
  apk_url text not null check (char_length(apk_url) <= 2048 and apk_url ~ '^https://[^[:space:]]+$'),
  -- Required releases cannot be dismissed in the app; use for security fixes.
  required boolean not null default false,
  -- Withdrawing a broken release hides it from the app without deleting its record.
  published boolean not null default true,
  published_at timestamptz not null default now()
);

alter table public.app_releases enable row level security;
revoke all on public.app_releases from public, anon, authenticated;
grant select on public.app_releases to anon, authenticated;

-- Signed-out phones check too, so an outdated app on the login screen still learns of a fix.
create policy "anyone can read published releases" on public.app_releases
  for select to anon, authenticated using (published);
create policy "admins can read all rows" on public.app_releases
  for select to authenticated using ((select public.is_admin()));

create function public.publish_app_release(
  p_version_code integer,
  p_version_name text,
  p_title text,
  p_changes text[],
  p_apk_url text,
  p_required boolean default false
)
returns public.app_releases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes text[];
  v_latest integer;
  v_release public.app_releases;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select coalesce(array_agg(trim(item) order by position), '{}')
    into v_changes
    from unnest(coalesce(p_changes, '{}')) with ordinality as entries(item, position)
    where trim(coalesce(item, '')) <> '';
  if cardinality(v_changes) = 0 then
    raise exception 'List at least one change in this update' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_changes) as item where char_length(item) > 200) then
    raise exception 'Each change must be 200 characters or fewer' using errcode = '22023';
  end if;

  select max(version_code) into v_latest from public.app_releases where published;
  if p_version_code <= coalesce(v_latest, 0) then
    raise exception 'Version code must be higher than the latest published release (%)', v_latest
      using errcode = '22023';
  end if;

  insert into public.app_releases (version_code, version_name, title, changes, apk_url, required)
  values (p_version_code, trim(p_version_name), trim(p_title), v_changes, trim(p_apk_url), coalesce(p_required, false))
  returning * into v_release;
  return v_release;
end;
$$;

create function public.withdraw_app_release(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  update public.app_releases set published = false where id = p_id;
  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.publish_app_release(integer, text, text, text[], text, boolean) from public, anon;
revoke all on function public.withdraw_app_release(uuid) from public, anon;
grant execute on function public.publish_app_release(integer, text, text, text[], text, boolean) to authenticated;
grant execute on function public.withdraw_app_release(uuid) to authenticated;

commit;
