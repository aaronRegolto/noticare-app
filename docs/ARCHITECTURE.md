# Architecture and Android limitations

## Decisions

NotiCare is an Android-only Expo application with a custom Kotlin native module. Expo Router owns the React Native interface, while Android's `NotificationListenerService` owns real-time notification handling. This split is essential: JavaScript may be paused or the UI may be closed when an SMS notification arrives.

The application uses a development or release build. Expo Go cannot include the custom notification-listener service, so it cannot provide real-time scanning.

## Data flow

```text
Android notification
  -> NotificationListenerService
  -> scan preference (Android DataStore)
  -> current default SMS package check
  -> ignore every non-SMS package before reading extras
  -> extract/normalize SMS text locally
  -> Kotlin rule evaluator + advisory V3 LiteRT model
  -> Safe / Suspicious / Dangerous action
  -> user chooses Block or Ignore for Dangerous results
  -> encrypted local History only when chosen suppression succeeds
  -> anonymous, idempotent metadata queue
  -> Supabase authenticated RPC when online
```

The Manual Scan tab calls the Kotlin evaluator in Android development/release builds, matching the background listener. The parity-tested TypeScript evaluator is used only as a UI fallback where the native module is unavailable. It reads the clipboard only after a user taps **Paste**, never visits a detected link, and never sends the pasted content to Supabase.

## Trust boundaries

| Boundary                                 | Allowed data                                                                        | Prohibited data                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Native scanner → local encrypted History | Full blocked message, local masked sender, scanner result                           | Cloud encryption keys, unrelated notifications                                     |
| Native scanner → JavaScript UI           | Redacted scanner result, fixed non-content History summary, and record ID as needed | Broad notification stream, unneeded raw notification extras or History body        |
| Device → Supabase                        | Event UUID, classification, score bucket, rule codes, URL count, timestamps         | SMS text, full sender, raw URL, notification title, clipboard, OTP, hardware/ad ID |
| Supabase → Dashboard                     | Aggregate buckets only                                                              | Other users' records or identifiers                                                |

The History database stays on the device. Its key is generated and protected by Android Keystore; Supabase cannot decrypt it because Supabase never receives it. Each stored record also carries a one-way local scope derived from the signed-in account. The list, detail, delete, and clear APIs reject records outside the active scope.

## Real-time scanner state

The Dashboard may show **Active** only when all of the following are true:

1. The user switched scanning on.
2. Android Notification Access is granted to NotiCare.
3. The native listener service reports connected.
4. Android reports a current default SMS application; Messenger is discovered by package visibility.

If any condition changes, the state becomes Off, Permission required, Service disconnected, or SMS app unavailable. Turning scanning off must cause the service to return before package comparison or notification-content access.

## Android limitations and honest fallback

- A notification listener only sees notification content Android exposes. If previews are hidden, missing, or replaced with an app-generated summary, NotiCare reports `content_unavailable`; it does not guess.
- Notifications are not inbox records. NotiCare does not use `READ_SMS`, does not become the default SMS app, and never deletes a message from its source app. Only the default SMS app and explicitly enabled Messenger notification previews are eligible for analysis. Safe previews are evaluated in memory then discarded; only Suspicious/Dangerous alerts are retained. Optional Contacts lookup runs on-device only for alerts after the user grants permission.
- `cancelNotification` is called only after the user chooses Block and can suppress a posted notification only where Android and the source app permit it. Suspicious and Dangerous alerts are retained in encrypted History regardless of the user's Block/Ignore choice; “Blocked” means the notification was suppressed, not that the SMS was deleted.
- Bundled, group, MMS, multi-SIM, lock-screen, and notification-update behavior differs by Messages app and Android release. The native pipeline deduplicates keys/content fingerprints and treats unavailable content safely.
- Android can stop or disconnect a listener. The app must re-check permission/service state on resume, device restart, app update, and default-Messages-app changes.
- Neither the rule engine nor the V3 model can guarantee every risky message is detected. V3 may raise a rule-safe result to Suspicious only with supporting phishing indicators; generic urgency, click/reply instructions, or obfuscation alone are insufficient. Model output alone cannot create a warning or a Dangerous result. This reduces model-only false positives, but risks missing threats that only the model recognizes; the combined policy needs evaluation on representative held-out messages before claiming a new accuracy figure.

## Offline behavior

Scanning and encrypted History work offline. Anonymous event metadata is placed in a local queue with a client-generated UUID. Upload retries use exponential backoff. Replaying the same UUID is idempotent in `record_threat_event`, so a reconnection cannot increase community counts twice.

The Dashboard caches its last aggregate response and labels it as offline/stale until a successful refresh. Demo events are marked `is_demo=true` and are intentionally excluded from community aggregate tables.
