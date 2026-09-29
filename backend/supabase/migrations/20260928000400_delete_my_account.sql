-- Lets a signed-in user permanently delete their own NotiCare account from the
-- app, as Google Play requires for apps that let users create an account.
--
-- Deleting the auth.users row cascades through profiles to every per-user
-- table (devices, threat_events, scan_feedback, linked_phone_numbers,
-- viral_phishing_report_events, admin_users). Aggregate community tables and
-- viral_phishing_reports hold no user id, so the anonymous totals and the text
-- of messages the user chose to Block & Report stay, unlinked from anyone.

begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

commit;
  