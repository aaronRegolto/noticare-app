begin;

drop function if exists public.resolve_primary_phone(text);
drop function if exists public.record_linked_phone(text);
drop function if exists public.list_linked_phones();
drop function if exists public.unlink_phone(text);
drop table if exists public.linked_phone_numbers;

commit;
