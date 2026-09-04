# Google Play data-safety and notification-listener guidance

> Review this document with the final build, the current Google Play policy pages, and legal/privacy counsel before submission. It is implementation guidance, not a completed Play Console declaration or legal advice.

## Prominent in-app disclosure

Show this explanation immediately before opening Android Notification Access settings, in addition to the Android system screen:

> **Allow Notification Access for SMS protection?**  
> NotiCare checks notifications only from the Messages app that Android currently identifies as your default SMS app. It ignores all other apps before reading notification text. This lets NotiCare warn you about suspected scam SMS notifications. We do not read your SMS inbox, delete SMS messages, or upload full message text.

The screen must have clear **Continue to Settings** and **Not now** choices. Do not imply permission was granted until the app verifies it after the user returns.

## Data inventory for the final declaration

Confirm the final implementation against this inventory rather than copying it blindly into Play Console.

| Category                    | Processed?                                | Shared?                                  | Purpose                                                   | Handling                                                                       |
| --------------------------- | ----------------------------------------- | ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Phone number                | Yes, for Supabase phone OTP               | Supabase/Auth SMS provider as configured | Account authentication                                    | Supabase Auth; public profile retains only last four digits                    |
| SMS notification text       | Yes, on device only after package filter  | No                                       | On-device scam analysis and encrypted blocked History     | Not uploaded; History only for successfully suppressed Dangerous notifications |
| Sender/display information  | Yes, on device only                       | No                                       | Local masking and History display                         | Not uploaded                                                                   |
| URLs found in SMS           | Yes, on device only                       | No                                       | On-device detection/explanation                           | Never opened or uploaded raw                                                   |
| Anonymous installation UUID | Yes                                       | Supabase                                 | Idempotent event synchronization                          | App-generated; not hardware or advertising ID                                  |
| Classification metadata     | Yes                                       | Supabase                                 | Aggregated community statistics and rule-quality feedback | Level, bucket, rule codes/counts, timestamps only                              |
| Diagnostics                 | Only privacy-safe operational diagnostics | `[FINAL VENDOR]` if configured           | Stability/security support                                | Must not include raw SMS, URLs, OTPs, phone numbers, sessions, or keys         |

The final answers for collection, sharing, retention, encryption, deletion, and purpose must reflect the production vendor configuration. Do not represent Android-local data as “shared” merely because it is processed locally; do not omit any enabled analytics/crash SDK.

## Policy-sensitive behavior checklist

- Notification Access is limited to the declared core functionality and is not used for advertising, profiling, or unrelated app monitoring.
- The service filters to the current default SMS app before extracting notification extras.
- The app does not use `READ_SMS`, role-manager default SMS privileges, or accessibility service APIs for SMS scanning.
- The app does not send the notification stream to a server.
- Users can turn scanning off and revoke Android Notification Access.
- The privacy policy and in-app disclosure clearly explain local processing, cloud metadata, and that “blocked” never means SMS deletion.
- The release does not contain test endpoints, placeholder PHP endpoints, service-role secrets, or debug raw-content logging.

## Reviewer instructions

Provide a separate, current reviewer guide with:

1. A test phone number/OTP route approved for review.
2. Steps to set an SMS app as default and enable Notification Access.
3. Synthetic Safe, Suspicious, and Dangerous test messages.
4. Expected behavior and the limitation that source-app/Android policies can affect suppression.
5. An explanation that the SMS remains in the Messages inbox even after notification suppression.

Do not include real messages, user data, production credentials, or an unrestricted service-role key in reviewer materials.
