-- Lets one NotiCare account be signed into with more than one verified phone
-- number (e.g. both SIMs of a dual-SIM device), without Supabase Auth's phone
-- provider needing to support multiple identities per user.
--
-- "Linking" a second number is implemented as swapping auth.users.phone via
-- Supabase's existing, fully-supported phone_change OTP flow (updateUser +
-- verifyOtp type=phone_change), while archiving the previous phone here. The
-- login screen resolves whichever phone the user types back to the account's
-- current primary phone (resolve_primary_phone) before calling the normal
-- sign-in OTP flow, so Supabase Auth only ever sees the one phone value it
-- already knows how to authenticate. No custom session minting.

begin;

create table public.linked_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9]\d{7,14}$'),
  created_at timestamptz not null default now()
);

create index linked_phone_numbers_user_idx on public.linked_phone_numbers (user_id);

alter table public.linked_phone_numbers enable row level security;
revoke all on table public.linked_phone_numbers from public, anon, authenticated;

-- Must be callable before sign-in (no session yet), so it's granted to anon too.
-- Always returns *some* phone (the input unchanged if unregistered) so it never
-- leaks which numbers are registered, matching today's sign-in behavior.
create or replace function public.resolve_primary_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
  v_current_phone text;
begin
  select l.user_id into v_owner
  from public.linked_phone_numbers as l
  where l.phone_e164 = p_phone;

  if v_owner is null then
    return p_phone;
  end if;

  select u.phone into v_current_phone from auth.users as u where u.id = v_owner;
  return coalesce(v_current_phone, p_phone);
end;
$$;

revoke all on function public.resolve_primary_phone(text) from public, anon, authenticated;
grant execute on function public.resolve_primary_phone(text) to anon, authenticated;

-- Called right after a successful phone_change verification: the number that
-- was primary a moment ago becomes an archived alias for the same account.
create or replace function public.record_linked_phone(p_previous_phone text)
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

  if p_previous_phone is null or p_previous_phone !~ '^\+[1-9]\d{7,14}$' then
    raise exception 'invalid phone number' using errcode = '22023';
  end if;

  insert into public.linked_phone_numbers (user_id, phone_e164)
  values (v_user_id, p_previous_phone)
  on conflict (phone_e164) do nothing;
end;
$$;

revoke all on function public.record_linked_phone(text) from public, anon, authenticated;
grant execute on function public.record_linked_phone(text) to authenticated;

create or replace function public.list_linked_phones()
returns table (phone_e164 text, created_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  return query
  select l.phone_e164, l.created_at
  from public.linked_phone_numbers as l
  where l.user_id = auth.uid()
  order by l.created_at asc;
end;
$$;

revoke all on function public.list_linked_phones() from public, anon, authenticated;
grant execute on function public.list_linked_phones() to authenticated;

create or replace function public.unlink_phone(p_phone text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  delete from public.linked_phone_numbers
  where user_id = auth.uid() and phone_e164 = p_phone
  returning true into v_deleted;

  return coalesce(v_deleted, false);
end;
$$;

revoke all on function public.unlink_phone(text) from public, anon, authenticated;
grant execute on function public.unlink_phone(text) to authenticated;

commit;
