-- Replaces RevenueCat with PayMongo as the subscription processor. profiles.plan
-- (added in 20260922000100_subscription_plan.sql) stays the single source of
-- truth for tier gating; only how it gets written changes (paymongo-webhook
-- Edge Function instead of revenuecat-webhook).
--
-- paymongo_customer_id links a NotiCare account to its PayMongo Customer object
-- so the app doesn't need to create a new Customer on every subscribe attempt.
-- profiles is added to the supabase_realtime publication so the client can
-- react instantly when the webhook flips plan after a successful payment,
-- instead of polling.

begin;

alter table public.profiles
  add column paymongo_customer_id text unique;

alter publication supabase_realtime add table public.profiles;

commit;
