begin;

create function public.replace_admin_dataset_rows(p_rows jsonb)
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
    from jsonb_to_recordset(p_rows) as row_data(row_index integer, message_text text, label text)
    where row_index is null
      or row_index < 1
      or message_text is null
      or length(message_text) > 20000
      or label is null
      or label not in ('0', '1')
  ) then
    raise exception 'Dataset contains invalid rows';
  end if;

  delete from public.admin_dataset_rows
  where source = 'Local_PH_SMS_spam';

  insert into public.admin_dataset_rows (source, row_index, message_text, label, uploaded_by)
  select 'Local_PH_SMS_spam', row_index, message_text, label, (select auth.uid())
  from jsonb_to_recordset(p_rows) as row_data(row_index integer, message_text text, label text);

  get diagnostics inserted_rows = row_count;
  return inserted_rows;
end;
$$;

revoke all on function public.replace_admin_dataset_rows(jsonb) from public, anon, authenticated;
grant execute on function public.replace_admin_dataset_rows(jsonb) to authenticated;

commit;
