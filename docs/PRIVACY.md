# Privacy and data handling

## Plain-language summary

NotiCare reads notifications only while Real-Time Scanning is on, and only from apps the user enables in Settings: the default Messages app and Messenger. Messenger is optional and default off. Notifications from every other app are ignored before their text is read.

NotiCare analyzes available notification previews in memory on the device. Safe messages are discarded immediately; only Suspicious or Dangerous alerts are retained in encrypted local History. Android or a source app may hide or redact previews. NotiCare does not use `READ_SMS`, does not become the default SMS app, and does not delete messages from their source apps.

## What stays on the device

| Data                                 | Why                                                               | Storage/lifetime                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Notification text from selected apps | Local scam/threat analysis and alert detail                       | Memory during analysis; only Suspicious/Dangerous alerts enter encrypted local History, up to the account's retention limit        |
| Complete sender/display details      | Local display and sender masking                                  | Local only; never sent to Supabase                                                                                                 |
| Contact lookup result (optional)     | Label an alert sender as saved or not found in Contacts           | Exact sender-number/name lookup on-device; only a match flag is kept with a non-Safe alert; no contact details are copied/uploaded |
| Raw extracted URLs                   | Explain a local scan result without opening a link                | Local only; rendered as non-clickable text                                                                                         |
| Scan preference and service status   | Keep the real-time switch correct after restart                   | Android DataStore                                                                                                                  |
| History profile scope                | Keep one signed-in account from seeing another's History          | A one-way hash in Android DataStore; never uploaded                                                                                |
| Local History encryption key         | Encrypt alert History                                             | Android Keystore; never export or upload                                                                                           |
| Clipboard text                       | Manual Scan after the user taps Paste                             | Memory/local UI only; never uploaded                                                                                               |
| Photo or screenshot of a message     | Manual Scan after the user taps Take a photo or Upload screenshot | Text read on device by ML Kit's bundled model; the image is deleted from the app cache and never uploaded                          |
| Translated message text              | Alert details when a message language is chosen                   | Translated on device by ML Kit (language pack downloaded once on Wi-Fi); in-memory display cache only; never uploaded              |

If encrypted local History cannot be initialized, the app must not save raw messages. It should show a privacy-safe diagnostic state instead.

The optional **Identify saved senders** setting requires Android Contacts permission. It is off until the user enables it and grants permission. The lookup runs only for messages already classified Suspicious or Dangerous. Revoking permission prevents further lookups.

## What can go to Supabase

The app uses Supabase Phone OTP for authentication and stores only the last four digits of a verified phone number in the `profiles` table. The Supabase project holds the full phone number as required for the authentication provider; the application's public tables do not copy it.

For anonymous community trends, the app may upload:

- A random, idempotent client event UUID.
- An app-generated anonymous installation UUID (not an Android, advertising, or hardware ID).
- Event source (`realtime` or `manual`), threat level, a score bucket (always 0 for Safe), rule version, timestamp, stable indicator codes, URL count, and whether a realtime Dangerous notification was successfully suppressed.
- User feedback classification and stable rule codes.

The database turns this metadata into aggregate hourly and daily counts. The Dashboard sees only aggregate time buckets, never another person's events.

## What never goes to Supabase

- Full SMS message bodies or previews.
- Full sender phone numbers, contact names, or notification titles.
- Raw URLs, redirect parameters, screenshots, or visited-link data.
- Clipboard contents or OTP values.
- Android encryption keys, hardware IDs, advertising IDs, access tokens, database passwords, or Supabase service-role keys.

The database contract rejects arbitrary indicator-code strings so the analytics field cannot become a workaround for sending message text.

## Notification access and “blocked” notices

Android notification access is a sensitive permission. NotiCare requests it only after a user turns on Real-Time Scanning and explains why. The app re-checks access after returning from Android Settings.

When you choose **Block** and Android permits, NotiCare calls the notification-listener API to suppress a Suspicious or Dangerous notification. Choosing **Ignore** leaves it visible. Neither action removes the original message from its source app. Only Suspicious and Dangerous alerts are saved to encrypted local History; the `blocked` marker is set only when Android accepts the suppression request.

## Your choices

- Turn Real-Time Scanning off at any time, or disable individual apps in Settings. The native service then stops processing notification content from those sources.
- Delete one local History record or clear all local History.
- Sign out. The app disables scanning for that signed-out profile and asks whether to delete local History. If it is kept, it remains encrypted and is strictly scoped to that same account; another account on the device cannot list or decrypt it.
- Submit “This seems safe” or “Report false result” feedback without sending the message itself.

## Security practices

- Package allowlisting and the per-app opt-in check happen before notification extras are read.
- The scanner makes no network requests to URLs in a message and opens no detected link in a WebView or browser.
- History encryption is backed by Android Keystore.
- Requests to Supabase use the official client over TLS.
- PostgreSQL RLS restricts private rows to their owner; aggregate statistics are available only through an authenticated RPC.
- The app must use centralized privacy-safe logging that redacts text, raw URLs, OTPs, sessions, and keys.

## Limits

NotiCare is an aid, not a guarantee. Hidden notification previews may prevent analysis, source apps can format notifications differently, and phishing detection can have false positives or false negatives. Users should never tap a suspicious link or share a password, PIN, or OTP because an app marked a message Safe.
