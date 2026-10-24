# Testing guide

## Required test layers

| Layer                         | Purpose                                                           | Minimum evidence                                                                              |
| ----------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| TypeScript unit tests         | Normalization, URL extraction, scoring, Manual Scan UI logic      | Shared corpus covers at least 50 English, Tagalog, and Taglish messages.                      |
| Kotlin unit tests             | Native rules, selected-package gate, repeat scoring, link sharing | Same rule corpus produces the same result as TypeScript; Messenger routing is fixture-tested. |
| Android instrumentation tests | Native module, notification listener behavior, encrypted History  | Tests run on a device/emulator API level supported by the app.                                |
| Supabase/RLS tests            | Ownership, RPC input validation, aggregates, idempotency          | Two-user isolation test and retry test pass.                                                  |
| Physical-device test          | Actual Notification Access, selected apps, suppression behavior   | Tested with a development or release build, never Expo Go.                                    |

## Fast checks

From the repository root, run the checks the project exposes:

```powershell
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:android
npm run format:check
```

Do not treat a successful TypeScript build as proof that the NotificationListenerService works. `test:android` needs an Android SDK/JDK and a generated Android project.

## Detection corpus requirements

Maintain a versioned, non-production corpus with at least 50 synthetic messages. It must include:

- Legitimate OTP notifications and bank notices without links.
- Normal conversations and legitimate promotions.
- English, Filipino/Tagalog, and Taglish phishing messages.
- Shortened URLs, IP-address URLs, punycode, zero-width characters, spacing-obfuscated links, multiline text, and no-link social engineering.
- Fake prizes, refunds, parcel delivery, account warning, credential/PIN/OTP requests, and ambiguous messages.

Each fixture defines expected level, score, indicator codes, normalized URLs, and rule version. A parity test fails if Kotlin and TypeScript differ on any field that is shared between them. Parity compares the raw rule output (`evaluateRules` in TypeScript, `SmishingEvaluator.evaluate` in Kotlin), before a Safe result's score is finalized to 0; regenerate the digest from `evaluateRules`, never from `evaluateThreat`.

## Supabase/RLS test cases

Use two phone-authenticated users, **A** and **B**, and distinct registered device UUIDs:

1. A can read only A's profile/devices/events/feedback; B cannot read A's rows.
2. Neither A nor B can directly read aggregate tables or write private tables.
3. A can call `register_device` only for A's session.
4. A can create an event only with A's device ID.
5. Repeating the same `client_event_id` returns the original event ID and increments aggregate counts once.
6. B cannot reuse A's `client_event_id` or submit feedback against A's event.
7. `manual + blocked=true` and `safe/suspicious + blocked=true` are rejected.
8. `is_demo=true` events never affect `get_community_stats`.
9. `get_community_stats` accepts only the four documented ranges and returns no identifiers.
10. Invalid/free-form indicator strings are rejected, proving the field cannot carry raw message text.
11. A Safe `record_threat_event` sent with `p_score_bucket` 1 or 2 (as older app builds and queued events do) is accepted and stored with `score_bucket = 0`; its indicator codes are kept. Suspicious and Dangerous buckets are stored as sent, and the event is counted once in `get_community_stats`.
12. `record_phishing_report` with `p_risk_score` 1–29 is accepted and stores 0 in both `viral_phishing_reports.risk_score` and the reporter's `viral_phishing_report_events.risk_score`. 0 and 30–100 are stored as sent, and `NULL` stays `NULL`.
13. A message reported by A with a Safe score (for example 20) and by B with 85 shows 85 in `get_viral_phishing_ranking`; a message reported only with Safe scores shows 0. No ranking row has a risk score of 1–29.
14. After applying `20261004000200_safe_risk_score_zero.sql`, the three "Check afterwards" queries at the end of that migration each return 0.

## Physical Android device procedure

1. Use a development or release APK; do not use Expo Go.
2. Sign in with a test phone number and complete onboarding.
3. Set the intended Messages application as Android's default SMS app. In NotiCare Settings, verify Messenger installed status, then enable it if you want to test Messenger notifications.
4. Turn scanning on, accept the explanation, and grant Notification Access in Android Settings.
5. Return to NotiCare and verify app selections persist and the listener reports permission/service state honestly.
6. Send synthetic Safe, Suspicious, and Dangerous messages to the physical test device from each selected app available. Verify Safe results are evaluated but never saved in History or telemetry, and only Suspicious/Dangerous results create alerts. Never use real customer messages.
7. Verify an unselected app and an unrelated package are rejected before extras are read.
8. Confirm readable selected-app previews are classified in memory, Safe previews are discarded, and only Suspicious/Dangerous alerts are saved in encrypted History. Verify category and alert filters.
9. Confirm Suspicious and Dangerous notifications show warning controls. **Ignore** leaves the notification visible; **Block** attempts suppression and sets the blocked marker only when Android accepts the request. Verify the underlying message remains in its source app.
10. After one SMS with independent spam/phishing evidence in the default Messages app, send subsequent SMS messages from that sender. Verify the score rises; verify Messenger messages from the same displayed name do not inherit the SMS repeat-sender score. Benign repeated SMS messages alone must not escalate.
11. Turn scanning off and repeat a message test; confirm no notification content is processed.
12. Hide message previews/lock the device and confirm the app reports `content_unavailable`, not a guessed result.
13. Change the default Messages app, revoke/regrant access, restart the device, and update the app. Verify per-app installed/selected status remains accurate.
14. Sign out while keeping protected History, sign in as a different test account, and verify that the second account cannot list, open, delete, or clear the first account's records.

Record Android version, tested source app/package/version, device model, build SHA, scanner rule version, and observed limitation. Do not attach raw message content or full phone numbers to test reports.

## Manual Scan checks

- Clipboard remains untouched until the user taps Paste.
- Paste, clear, character count, disabled-empty scan button, tutorial replay/skip/hide, and accessibility labels work.
- URLs are displayed as text only; no link is opened, previewed, resolved, or fetched.
- Sharing exactly one http/https URL to NotiCare routes it through the same local URL checker. Missing or multiple links are rejected.
- Manual scans use the same rule version as the native scanner.
- A Manual Scan can send anonymous classification metadata but never `blocked=true` and never creates encrypted blocked History.

## Manual Scan photo checks

- **Take a photo**, first time: Android asks for camera access. Allow: after cropping, the text fills the box with the "Read from your photo" note and is not checked until **Check message** is tapped.
- Deny camera access: an explanation appears and nothing opens. Deny with "Don't ask again": the explanation offers **Open settings**.
- **Upload screenshot**: Android's photo picker opens without any permission prompt.
- While text is being read, the capture buttons are disabled and the main button shows "Reading text…".
- In a build without the text reader (Expo Go or an older install), the camera options are hidden and **Paste text** appears under the text box.
- A photo with no text (or too blurry): "No text found" with advice; the box is unchanged.
- A link split across two lines on the other phone's screen reads back as one link; a Tagalog word broken at its hyphen (`i-` / `click`) reads back joined.
- Cancel at the camera, crop, or picker step: nothing changes.
- The photo note stays while the user corrects the text, and clearing or pasting removes it.
- After reading, `adb shell run-as <package> ls cache/ImagePicker` shows no leftover image.
- Airplane mode: reading text still works (the model is bundled).
- Turn on Developer options → "Don't keep activities", take a photo: on return, the text still fills the box.

## Message language checks

- Settings → Message language → **Tagalog** on mobile data: status says to connect to Wi-Fi; inbox messages show as received. On Wi-Fi, **Try again** (or reopening Settings/Messages) downloads the pack and the status turns ready.
- With the pack ready: an English message's preview and details show in Tagalog, the list card says "Translated", and details offer **Show original** / **Show translation**.
- A Tagalog message stays as received with Tagalog chosen; with **English** chosen it is translated to English.
- A message containing `http://gcash-verify.xyz/login`, `bit.ly/abc`, or an email address keeps each exactly as received in the translation.
- **Default** shows every message exactly as received.
- The scan result, score, and warning signs of a message are the same in every language setting.
- Airplane mode after the pack downloads: translation still works.
- An older build without the translator: the Message language section is hidden.
- With **Tagalog** chosen, a Suspicious and a Dangerous message show the warning pop-up (title, badge, advice, every warning sign, buttons) and the notifications in Tagalog, with the same score and link domains. Switching back to **Default** or **English** shows them in English. No download or connection is needed for this.
- With **Tagalog** chosen, a Manual Scan result (level, explanations, warning signs, score breakdown, bands, recommended action, feedback buttons and messages) and an opened inbox message's warning signs are in Tagalog, with the same score and points.

## Regression gates

Block a release if package filtering occurs after extras access, raw content appears in logs/network assertions, RLS isolation fails, evaluator parity fails, a demo event reaches aggregate data, or the native physical-device test is missing.
