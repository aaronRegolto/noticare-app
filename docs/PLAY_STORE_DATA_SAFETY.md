# Google Play data-safety and notification-listener guidance

> Review this document with the final build, the current Google Play policy pages, and legal/privacy counsel before submission. It is implementation guidance, not a completed Play Console declaration or legal advice.

## Prominent in-app disclosure

Show this explanation immediately before opening Android Notification Access settings, in addition to the Android system screen:

> **Allow Notification Access for message protection?**
> NotiCare checks only notifications from apps you enable in Settings: your default Messages app and Messenger. Messenger is optional and default off. Notifications from all other apps are ignored before their text is read. NotiCare checks available previews on this phone; Android or the source app may hide them. It does not read app inboxes or delete messages. Message text is not uploaded unless you explicitly choose a report action.

The screen must have clear **Continue to Settings** and **Not now** choices. Do not imply permission was granted until the app verifies it after the user returns.

## Data inventory for the final declaration

Confirm the final implementation against this inventory rather than copying it blindly into Play Console.

| Category                                   | Processed?                                                   | Shared?                                                | Purpose                                                    | Handling                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone number                               | Yes, for Supabase phone OTP                                  | Supabase/Auth SMS provider as configured               | Account authentication                                     | Supabase Auth; public profile retains only last four digits                                                                                  |
| Notifications from selected messaging apps | Yes, on device only after package and opt-in checks          | No by default; a user-chosen report shares its message | On-device scam/threat analysis and encrypted local History | Safe previews are discarded after analysis; only Suspicious/Dangerous alerts are retained locally; only explicit reports upload message text |
| Sender/display information                 | Yes, on device only                                          | No                                                     | Local masking and History display                          | Not uploaded                                                                                                                                 |
| Manual Scan photos                         | Yes, on device only when the user taps Photo                 | No                                                     | Read a message's text for Manual Scan                      | ML Kit on-device model; image deleted after reading; never uploaded                                                                          |
| Translated message text                    | Yes, on device only when a language is chosen                | No                                                     | Show captured messages in Tagalog or English               | ML Kit on-device translation; language pack downloaded once on Wi-Fi; never uploaded                                                         |
| ML Kit usage statistics                    | Yes, only when a photo is scanned or messages are translated | Google (ML Kit)                                        | Google's diagnostics for ML Kit                            | Device model, OS/app version, per-install ID, latency, image size; no image or text                                                          |
| URLs found in selected notification text   | Yes, on device only                                          | No                                                     | On-device detection/explanation                            | Never opened or uploaded raw                                                                                                                 |
| Anonymous installation UUID                | Yes                                                          | Supabase                                               | Idempotent event synchronization                           | App-generated; not hardware or advertising ID                                                                                                |
| Classification metadata                    | Yes                                                          | Supabase                                               | Aggregated community statistics and rule-quality feedback  | Level, bucket, rule codes/counts, timestamps only                                                                                            |
| Diagnostics                                | Only privacy-safe operational diagnostics                    | `[FINAL VENDOR]` if configured                         | Stability/security support                                 | Must not include raw SMS, URLs, OTPs, phone numbers, sessions, or keys                                                                       |

The final answers for collection, sharing, retention, encryption, deletion, and purpose must reflect the production vendor configuration. Do not represent Android-local data as “shared” merely because it is processed locally; do not omit any enabled analytics/crash SDK.

## Policy-sensitive behavior checklist

- Notification Access is limited to the declared core functionality and is not used for advertising, profiling, or unrelated app monitoring.
- The service checks the package allowlist and per-app opt-in before extracting notification extras. Messenger (`com.facebook.orca`) is an optional selection.
- The app does not use `READ_SMS`, role-manager default SMS privileges, or accessibility service APIs for SMS scanning.
- The app does not send the notification stream to a server. A user who chooses a report action separately authorizes that particular message to be submitted.
- Users can turn scanning off and revoke Android Notification Access.
- The privacy policy and in-app disclosure clearly explain local processing, cloud metadata, and that “blocked” never means SMS deletion.
- The release does not contain test endpoints, placeholder PHP endpoints, service-role secrets, or debug raw-content logging.

## Reviewer instructions

Provide a separate, current reviewer guide with:

1. A test phone number/OTP route approved for review.
2. Steps to select installed apps in NotiCare Settings and enable Notification Access.
3. Synthetic Safe, Suspicious, and Dangerous test messages.
4. Expected behavior and the limitation that source-app/Android policies can affect suppression.
5. An explanation that the original message remains in its source app even after notification suppression.

Do not include real messages, user data, production credentials, or an unrestricted service-role key in reviewer materials.
