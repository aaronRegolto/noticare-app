begin;

create table public.admin_dataset_rows (
  source text not null check (source = 'Local_PH_SMS_spam'),
  row_index integer not null check (row_index > 0),
  message_text text not null check (length(message_text) between 1 and 20000),
  label text not null check (label in ('0', '1')),
  search_text text generated always as (message_text || ' ' || label) stored,
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (source, row_index)
);

alter table public.admin_dataset_rows enable row level security;
revoke all on public.admin_dataset_rows from public, anon, authenticated;
grant select, insert on public.admin_dataset_rows to authenticated;

create policy "admins can read dataset rows"
  on public.admin_dataset_rows
  for select
  to authenticated
  using ((select public.is_admin()));

create policy "admins can upload dataset rows"
  on public.admin_dataset_rows
  for insert
  to authenticated
  with check ((select public.is_admin()) and uploaded_by = (select auth.uid()));

commit;
