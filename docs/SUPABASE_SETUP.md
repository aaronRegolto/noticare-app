# Supabase setup

## 1. Create the project and configure phone OTP

Create a Supabase project, then enable **Phone** in Authentication Providers. Configure an SMS provider such as Twilio, MessageBird, Vonage, or TextLocal and set realistic rate limits and CAPTCHA before production. Supabase's phone-login guide documents the provider and OTP setup: [Phone Login](https://supabase.com/docs/guides/auth/phone-login).

NotiCare sends the phone number in E.164 form, for example `+639171234567`:

```ts
await supabase.auth.signInWithOtp({ phone: '+639171234567' });
await supabase.auth.verifyOtp({
  phone: '+639171234567',
  token: sixDigitCode,
  type: 'sms',
});
```

Show a generic error for rate limits, invalid/expired code, or network problems. Do not log the phone number, code, session, or error payload if it might contain them.

### Local development shortcut

Supabase Phone OTP is the default in both development and release builds. Set `EXPO_PUBLIC_ENABLE_DEV_PHONE_LOGIN=true` only for deliberately offline development. This opt-in validates the phone number locally and creates a device-only profile; it cannot upload scans, feedback, or access authenticated community data. Release bundles always use OTP regardless of this flag.

## Verify mobile → Supabase → admin

1. Run the admin server and Metro from this repository using the same root `.env`. For EAS builds, set the same Supabase URL and public key in the selected EAS environment. Previously installed builds may contain older values; rebuild when changing embedded configuration.
2. Restart Metro with `npx expo start --dev-client --clear` after updating the login configuration. Sign in on the phone using real Supabase Phone OTP. Local development profiles cannot be converted to authenticated Supabase sessions.
3. Run a Manual Scan while online. Open the admin dashboard's **Connection status** and refresh: verify the latest received timestamp advances. Open **Scan records** to inspect the new manual event. Raw SMS text is never uploaded.
4. Leave the app open: queues retry every 30 seconds and when it returns to the foreground. Background notifications remain locally queued until the app resumes; this is not an always-running background upload service.
5. Submit feedback on the phone and refresh **User feedback**. To check offline retries, disconnect the phone, scan, reconnect, and keep the app foregrounded for at least 30 seconds. Repeated retries must not create duplicate events.

Manual queues are now account-scoped and serialized to prevent lost writes during uploads. Older unscoped queues are left untouched and are not uploaded because their account ownership cannot be determined. Supabase remains the shared backend; the phone does not connect to the local admin server. Training CSVs remain admin-local and do not update the model bundled with the phone.

## 2. Create local environment values

Copy `.env.example` to `.env` at the repository root and fill in the Project URL and browser-safe anon/publishable key:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key>
```

Only the URL and anon/publishable key belong in the Expo app. Never put a service-role key, database password, SMS-provider credential, or signing secret in `.env`, `app.json`, a build log, or an `EXPO_PUBLIC_*` variable.

Ensure the root `.env` is ignored by Git before adding real values.

## 3. Apply the database migrations

From the repository root, point the CLI at `backend`, whose `supabase/` child contains the migration project:

```powershell
npx supabase --workdir backend login
npx supabase --workdir backend link --project-ref <project-ref>
npx supabase --workdir backend db push --dry-run
npx supabase --workdir backend db push
```

The migration order is intentional:

1. Schema, ownership triggers, and private aggregate tables.
2. RLS, grants, and secured RPC functions.
3. The active versioned rule bundle.

Use `npx supabase --workdir backend db reset` only with a disposable local database. It clears the local database and reapplies migrations.

## 4. Verify RLS and RPC access

Use two distinct phone-authenticated test users. Verify that each can select only their own `profiles`, `devices`, `threat_events`, and `scan_feedback` rows. Verify that neither can directly select `community_daily_stats` or `community_hourly_stats`.

As an authenticated user, test these functions:

```ts
await supabase.rpc('register_device', {
  p_installation_id: installationId,
  p_app_version: appVersion,
  p_rule_version: ruleVersion,
});

await supabase.rpc('get_community_stats', { p_range: 'last_7_days' });
```

Do not use direct `.from('threat_events').insert(...)` in the mobile client. Call `record_threat_event` instead. Its server-side validation prevents manual scans from claiming `blocked=true`, checks device ownership, accepts only the rule version's allow-listed codes, and enforces idempotency.

## 5. Regenerate TypeScript types

After a migration is applied, regenerate and commit the checked-in type contract:

```powershell
npx supabase --workdir backend gen types typescript --linked --schema public > backend/supabase/types/database.types.ts
```

Use `createClient<Database>()` with the generated `Database` type. The schema has no columns for raw message bodies, full sender numbers, raw URLs, notification titles, OTPs, or encryption keys; adding one requires a privacy/security review.

## Operational rules

- Run migrations through the Supabase CLI/CI using a privileged database connection, never from the mobile app.
- Keep the `service_role` key exclusively in a server-side secret store. It bypasses RLS and must never ship in the app.
- Treat rule changes as a release: checksum the bundle, run evaluator parity tests, then activate the new version in a privileged transaction.
- Review PostgreSQL function grants as well as RLS. RLS does not restrict a function by itself; only `authenticated` receives execute privileges for the mobile RPCs. See [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api).
