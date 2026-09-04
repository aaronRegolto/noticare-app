# NotiCare Supabase backend

This directory is the Supabase source of truth for NotiCare. The migrations are designed so the cloud database receives anonymous scan metadata only. It must never receive message bodies, full sender numbers, notification titles, raw URLs, clipboard data, OTP contents, Android/hardware identifiers, or encryption keys.

## Files

| Path                                                 | Purpose                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `migrations/20260811000100_noticare_schema.sql`      | Tables, constraints, masked-profile trigger, and aggregate trigger. |
| `migrations/20260811000200_noticare_rls_and_rpc.sql` | RLS, grants, and authenticated RPCs.                                |
| `migrations/20260811000300_seed_rule_set.sql`        | Initial versioned rule bundle.                                      |
| `types/database.types.ts`                            | TypeScript database contract generated from the migration schema.   |

The older `backend/api` PHP endpoints and MySQL schema are not part of this Supabase design. Do not send production mobile data to those placeholder endpoints.

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
