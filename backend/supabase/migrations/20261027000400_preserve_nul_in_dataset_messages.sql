begin;

alter table public.admin_dataset_rows
  add column message_base64 text;

update public.admin_dataset_rows
set message_base64 = encode(convert_to(message_text, 'UTF8'), 'base64');

alter table public.admin_dataset_rows
  alter column message_base64 set not null;

create or replace function public.replace_admin_dataset_rows(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_rows integer;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Dataset rows must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) not between 1 and 10000 then
    raise exception 'Dataset must contain between 1 and 10000 rows';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row_data(
      row_index integer,
      message_text text,
      message_base64 text,
      label text
    )
    where row_index is null
      or row_index < 1
      or message_text is null
      or length(message_text) > 20000
      or message_base64 is null
      or label is null
      or label not in ('0', '1')
  ) then
    raise exception 'Dataset contains invalid rows';
  end if;

  delete from public.admin_dataset_rows
  where source = 'Local_PH_SMS_spam';

  insert into public.admin_dataset_rows (
    source,
    row_index,
    message_text,
    message_base64,
    label,
    uploaded_by
  )
  select
    'Local_PH_SMS_spam',
    row_index,
    message_text,
    message_base64,
    label,
    (select auth.uid())
  from jsonb_to_recordset(p_rows) as row_data(
    row_index integer,
    message_text text,
    message_base64 text,
    label text
  );

  get diagnostics inserted_rows = row_count;
  return inserted_rows;
end;
$$;

commit;
