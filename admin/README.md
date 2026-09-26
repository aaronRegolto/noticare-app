# NotiCare Admin

A standalone browser dashboard in the existing repository. Cloud records remain read-only; administrators can import local dataset CSVs. Uses Node 22+ and the root project's installed Supabase client; no additional install or build is required after `npm install` at the root.

## Run

```powershell
npm run admin
```

Open http://localhost:4173. The server binds to loopback only. Model documentation works before sign-in. Live records require the setup below. No synthetic scan records are displayed.

## Enable live admin access

1. Keep the existing `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the root `.env`. The dashboard never needs a service-role key.
2. Apply the repository's Supabase migrations, including `backend/supabase/migrations/20260907000100_admin_read_access.sql` and `backend/supabase/migrations/20260917000100_realtime_threat_events.sql`, to your intended project. Follow `docs/SUPABASE_SETUP.md` for linking and migration commands. Review `db push --dry-run` before applying. The second migration adds `threat_events` to Supabase's `supabase_realtime` publication; without it, Phishing detections still works but only via manual/interval refresh, not live push.
3. In Supabase Authentication, create a confirmed email/password user for the administrator. Email authentication must be enabled. Copy that user's UUID.
4. As the project owner, run this in the Supabase SQL Editor, replacing the placeholder:

```sql
insert into public.admin_users (user_id)
values ('YOUR-ADMIN-AUTH-USER-UUID')
on conflict do nothing;
```

5. Sign in to the dashboard with that email and password. There is no public admin signup. Existing phone-only app users can continue using the mobile app normally.

To revoke access, delete the corresponding membership through the SQL Editor:

```sql
delete from public.admin_users where user_id = 'YOUR-ADMIN-AUTH-USER-UUID';
```

Membership is checked for every request, so revocation takes effect without waiting for token expiry. Ordinary app users retain their existing owner-scoped access. Admin policies grant SELECT only. The membership table has no client read/write grants. Access tokens live only in browser memory and are removed on sign-out, reload, or expiry. Sign in again after expiry; this dashboard does not persist refresh tokens.

## Views and presentation

**Connection status** checks access to the shared Supabase tables and displays the latest non-demo uploaded scan. See `docs/SUPABASE_SETUP.md` for the phone-to-admin verification steps. Mobile development now uses real Phone OTP by default; local-only login requires explicit opt-in and cannot sync.

In **Dataset library**, choose **Import source CSV** on a missing source card, or **Import a dataset** for an additional file. Select the original UTF-8 CSV, review its destination filename, and choose **Import and browse**. Imports validate headers and row structure, require admin membership, and refuse to overwrite existing files. Imported files stay in the local `datasets/` folder and are not uploaded to Supabase or added to model training. The source name and provenance count alone cannot reconstruct the original message rows.

Use the header’s **Appearance** selector to choose Light, Dark, or System (follows the OS/browser color scheme and updates automatically if it changes). Choices apply immediately and are stored per authenticated account in this browser; they do not sync between devices. Signed-out preferences are stored separately. Only appearance preferences are persisted, never login tokens.

The layout uses [Carbon’s data table guidance](https://carbondesignsystem.com/components/data-table/usage/) for toolbar organization, pagination, and row spacing, and [Material’s color roles](https://material-web.dev/theming/color/) for consistent light/dark surfaces and text.

- Dataset library: catalog of known sources and CSVs placed in `datasets/`, with row browsing, all-column search, pagination, and page export. See `datasets/README.md` for file requirements. Newly added files are not automatically used for training.
- Phishing detections: Suspicious/Dangerous events ordered by `received_at`, excluding demo events. Date filters on this view use receipt time in UTC; the original occurrence time is also shown. These are unverified detections, not confirmed phishing samples. While this view is open, it also listens live: a Supabase Realtime subscription (see the `20260917000100` migration) pushes each newly inserted event to the browser the instant `record_threat_event` commits it, so page 1 refreshes itself without waiting for the 30-second poll or a manual click. If you are browsing a later page, a status note tells you a new detection arrived instead of silently changing what is on screen.

- Overview: exact all-time non-demo scan counts and classification distribution.
- Records: scans, profiles, daily/hourly statistics, and rule sets; all columns with 50-row pagination, UTC date filters, classification filters where applicable, and current-page CSV export.
- ML & datasets: reads the existing model metadata directly; provenance, training counts, reported frozen-test evaluation, limitations, and full metadata. It does not recalculate accuracy or invent a confusion matrix.
- Source files that have not been provided are labelled in the dataset library. Device-encrypted History and raw SMS content are not cloud records and cannot be browsed here.

CSV exports contain only the visible page, use the active filters, and neutralize spreadsheet formula prefixes. Each aggregate table can be browsed separately; overview totals exclude demo records.

Record and dataset tables support instant **Search this page**, sortable column headers, and **View** buttons for full record details. Page search and sorting apply only to the loaded rows; exports follow that visible subset and order. Use the dataset's **Search all columns** to search across its entire file. Record views also offer Today, Last 7 days, Last 30 days, and Reset filters. Refresh keeps the current record filters and page. Detail dialogs support Escape and return focus to their View button when closed.

For hosting, use a Node-capable host with HTTPS and a reviewed reverse proxy/bind configuration. This local server is intended for development and panel presentations, not an internet deployment without deployment configuration.

## Verification

```powershell
node --test --test-isolation=none admin/server.test.mjs admin/datasets.test.mjs
node --test --test-isolation=none admin/ui.test.mjs
```

The server tests exercise HTTP access control and the static-file allowlist without connecting to Supabase. Database integration requires applying the migration to a test project and checking that an admin can read other users' records, an ordinary user cannot, and neither can grant themselves membership. Do not present local HTTP tests as proof of deployed database policies.
