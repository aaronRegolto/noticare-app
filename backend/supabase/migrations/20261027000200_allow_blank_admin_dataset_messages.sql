begin;

alter table public.admin_dataset_rows
  drop constraint admin_dataset_rows_message_text_check;

alter table public.admin_dataset_rows
  add constraint admin_dataset_rows_message_text_check
  check (length(message_text) between 0 and 20000);

commit;
