# NotiCare Supabase backend

This directory is the Supabase source of truth for NotiCare. Ordinary scan telemetry contains anonymous classification metadata only; it does not send message bodies, sender numbers, notification titles, raw URLs, clipboard data, OTP contents, Android/hardware identifiers, or encryption keys. The explicit **Report & Block** action on a Dangerous result is the exception: it shares that exact message text, including any links it contains, in `viral_phishing_reports` so other users can recognize the same scam. This upload never happens automatically.

## Files

| Path                                                 | Purpose                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `migrations/20260811000100_noticare_schema.sql`      | Tables, constraints, masked-profile trigger, and aggregate trigger. |
| `migrations/20260811000200_noticare_rls_and_rpc.sql` | RLS, grants, and authenticated RPCs.                                |
| `migrations/20260811000300_seed_rule_set.sql`        | Initial versioned rule bundle.                                      |
| `types/database.types.ts`                            | TypeScript database contract generated from the migration schema.   |

The older `backend/api` PHP endpoints and MySQL schema are not part of this Supabase design. Do not send production mobile data to those placeholder endpoints.

## Edge Functions (PayMongo QRPh billing)

QRPh has no recurring/subscription concept in PayMongo (confirmed against their docs — only card vaulting and Maya support Subscriptions, and this account only has QRPh active). Pro is granted as a fixed-term one-time payment: `profiles.plan='pro'` plus `profiles.pro_expires_at` pushed forward by the interval's length. Nothing auto-charges again — the user pays again to renew, and every Pro check (client and RPC) treats `plan='pro'` as active only while `pro_expires_at` is still in the future (see `20260926000100_pro_expiry.sql`).

| Function                       | Purpose                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `paymongo-create-qrph-payment`  | Creates a one-time QRPh Payment Intent for the chosen interval; returns a QR image to display.   |
| `paymongo-check-payment`        | Client-side "I've already paid" fallback — re-checks the Payment Intent and grants Pro if paid.  |
| `paymongo-webhook`              | Verifies PayMongo's `Paymongo-Signature` header; on `payment.paid`, grants Pro for the interval — the primary path (paymongo-check-payment is only a fallback for when this is slow). |

Required secrets (`supabase secrets set --workdir backend NAME=value`):

- `PAYMONGO_SECRET_KEY` — server-side only, never in an `EXPO_PUBLIC_` variable.
- `PAYMONGO_WEBHOOK_SECRET` — the `secret_key` returned when registering the webhook via `POST /v1/webhooks`.
- `PRICE_MONTHLY_CENTAVOS`, `PRICE_ANNUAL_CENTAVOS` — the authoritative charged amounts (PHP centavos, e.g. `14900` for ₱149), read server-side only; never trust an amount from the client.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are platform-provided automatically.

The app side needs `EXPO_PUBLIC_PAYMONGO_PRICE_MONTHLY` / `_ANNUAL` (display-only strings matching the secrets above — the actual charged amount always comes from the server-side secret).

`paymongo-webhook` must be deployed without JWT verification (set in `config.toml`; PayMongo can't send a Supabase JWT), and the live webhook registered in PayMongo must subscribe to `payment.paid` — not `checkout_session.payment.paid`, which QRPh payment intents never send. The webhook reads the Payment Intent's metadata at `data.attributes.data.attributes.metadata`, confirmed against a live `payment.paid` payload on 2026-10-04.

## Apply migrations

`backend` is the Supabase CLI work directory; it contains this `supabase/` directory and its `config.toml`. Install and authenticate the CLI, then link it to the intended project:

```powershell
npx supabase --workdir backend login
npx supabase --workdir backend link --project-ref <your-project-ref>
npx supabase --workdir backend db push --dry-run
npx supabase --workdir backend db push
```

For a disposable local database instead:

```powershell
npx supabase --workdir backend start
npx supabase --workdir backend db reset
```

`db reset` removes local Supabase data. Do not run it against a project that contains data you need.

Regenerate the type contract after every migration, then review the diff before committing it:

```powershell
npx supabase --workdir backend gen types typescript --linked --schema public > backend/supabase/types/database.types.ts
```

## Mobile RPC contract

The app uses authenticated Supabase RPC calls rather than direct inserts. This keeps metadata validation and ownership checks inside PostgreSQL.

| RPC                    | Input                                                        | Result            | Privacy/security behavior                                                              |
| ---------------------- | ------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------- |
| `register_device`      | installation UUID, app version, rule version                 | device row        | Binds an anonymous installation UUID to the current user.                              |
| `record_threat_event`  | UUID, device ID, classification metadata                     | event UUID        | Idempotent on `client_event_id`; only realtime Dangerous events can be marked blocked. |
| `submit_scan_feedback` | optional owned event ID, expected level, codes, rule version | feedback UUID     | Rejects raw/unstructured indicator values and cross-user events.                       |
| `get_community_stats`  | `today`, `last_7_days`, `last_30_days`, or `last_6_months`   | aggregate buckets | Returns only UTC time buckets and aggregate counts.                                    |

`get_community_stats` returns objects shaped as:

```ts
{
  date: string; // ISO timestamp; hourly today, otherwise daily/monthly
  safe_count: number;
  suspicious_count: number;
  dangerous_count: number;
  blocked_count: number;
}
```

The client should cache the last successful aggregate result and fill missing date buckets with zeroes for charts. It must not synthesize personal activity from the aggregate result.

## Data model and safeguards

- `profiles` contains the authenticated user ID and only the last four phone digits.
- `devices` stores a generated installation UUID, app/rule versions, and last-seen time. It stores no advertising or hardware ID.
- `threat_events` stores classification metadata only. A database constraint blocks `blocked=true` unless the source is `realtime` and level is `dangerous`.
- `community_daily_stats` and `community_hourly_stats` contain no user or device identifiers. A trigger excludes `is_demo=true` events.
- `scan_feedback` records an expected classification and allow-listed rule codes, not a message.
- `rule_sets` distributes the active checksummed rule bundle. Only active versions are readable by authenticated users.

Every table has RLS enabled. Users may read only their own profile, devices, events, and feedback. There is no client policy for aggregate tables. Indicator codes must be in the rule bundle's version-specific allow-list, and function execution is revoked from `public` then granted only to `authenticated` where required.

## Rule release procedure

Rule changes are a security release, not a UI edit:

1. Add a migration that inserts the new `rule_sets` row with `active=false` and a SHA-256 checksum.
2. Run the shared TypeScript/Kotlin parity corpus against the exact bundle.
3. In one privileged transaction, set the old version inactive and the approved version active.
4. Publish the app/native evaluator only after its bundled rule version is verified.
5. Monitor aggregate false-result feedback without collecting message text.

Never let the mobile client activate, edit, or write rule sets.
