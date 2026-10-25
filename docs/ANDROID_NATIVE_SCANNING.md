# Android native scanning foundation

NotiCare real-time scanning is Android-only and requires a development or release build. It does not run in Expo Go. SMS scanning is enabled by default when monitoring is turned on; Messenger is an opt-in per-app source.

## Privacy boundary

`SmsNotificationListener` is a Kotlin `NotificationListenerService`. For each posted notification it:

1. Reads the persisted `realtime_scanning_enabled` DataStore value; the default is Off.
2. Resolves the current default SMS package and maps the notification package to SMS or Messenger.
3. Checks the per-app opt-in and rejects unsupported packages before reading notification extras.
4. Rejects NotiCare's own notifications and group summaries.
5. Selects the latest structured message by timestamp, or a single expanded/main text payload, only after the package check. It never joins different notification fields or InboxStyle entries into one SMS. Missing, malformed, or ambiguous content is reported unavailable.

Consequently, notifications from apps other than the default SMS app and Messenger (`com.facebook.orca`) are never read. Messenger is detected as installed, default off, and selectable in Settings. The app does not request `READ_SMS`, does not become the default SMS app, and does not use an accessibility service. The only overlay is the opt-in full-screen threat warning described below, which requires the user-granted **Display over other apps** permission and is shown only when a Suspicious or Dangerous message is detected.

If Android hides a notification preview, the listener records the non-sensitive runtime status `content_unavailable`; it does not guess at message content.

## Native actions

The Kotlin evaluator is offline-only and mirrors the versioned TypeScript rules in `src/features/detection/rules.ts` (version `2026.10.26`). The bundled V3 LiteRT model uses its audited UTF-8 byte preprocessing and validation-calibrated thresholds. Model output can reinforce a specific deterministic warning sign but cannot create a warning by itself; deterministic rules control Dangerous results. Every eligible notification is evaluated in memory, but Safe results are immediately discarded and are not saved to History or telemetry. Only Suspicious and Dangerous results are retained locally and shown as alerts. Repeat-sender escalation applies only to the default Messages/SMS source: it requires a retained SMS with independent spam or phishing evidence from the same sender, then raises subsequent SMS scores with a bounded 30-day lookback. Messenger messages do not inherit this sender-history escalation. Model loading failures and invalid outputs fall back to deterministic rules. Neither evaluator opens, resolves, previews, or fetches a URL.

- **Safe:** leaves the notification visible and queues sanitized aggregate metadata.
- **Suspicious / Dangerous:** shows a full-screen warning or actionable banner with reasons and **Block**/**Ignore** controls. With **Full-screen warning** selected (Pro): while the phone is unlocked and in use, `ThreatWarningOverlay` draws the warning over whatever app is open (requires **Display over other apps**); while locked or with the screen off, the notification's full-screen intent opens `ThreatWarningActivity`. Without the overlay permission, an in-use phone shows the heads-up banner. The actionable notification is always posted as a fallback. NotiCare calls `cancelNotification(sbn.key)` only after **Block** is chosen. A captured notification is marked _blocked_ only when Android accepts that call. **Ignore** leaves the notification visible. The original message stays in its source app. All scanned levels are saved in the encrypted local Messages inbox when storage is available.

Android does not provide a separate, synchronous “delivery suppressed” acknowledgement after `cancelNotification`; the app treats the platform accepting the cancellation call as the available best-effort success signal.

## Local data

Captured Messages are stored in an AES-GCM encrypted file. The encryption key is created in Android Keystore under a NotiCare-specific alias and never crosses the React Native bridge. Messages are scoped to a hash of the currently signed-in profile: a different profile cannot list, open, delete, or clear another profile's records. Clearing the owner scope on sign-out also turns monitoring off. If encrypted storage cannot be initialized, raw message text is not written to a fallback store and native status reports storage as unavailable.

Messages lists include only Suspicious and Dangerous alerts, with sender, a 160-character preview, risk metadata, category, source app, blocked status, read status, and the optional local contact match. Full message text is returned by `getHistoryRecord(id)` after the user opens an alert. Safe conversation text is not written to disk, and these local fields never enter telemetry.

The separate telemetry queue is also encrypted. It contains only:

- client-generated UUID
- `realtime` source
- threat level
- coarse score bucket `0..10` (always `0` for Safe)
- blocked flag
- stable rule codes
- URL count
- rule version and timestamp

It never contains SMS text, sender, notification title, raw URL, OTP, token, or key. `getPendingTelemetry` claims due entries and applies capped exponential backoff; `ackTelemetry` deletes IDs only after an authenticated, idempotent upload succeeds.

## React Native bridge

The public typed wrapper is `src/services/notificationListener.ts`.

| Function                                      | Purpose                                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `getMonitoringStatus()`                       | DataStore preference, Notification Access, listener connection, detected apps and per-app selection, and storage diagnostics. |
| `requestNotificationListenerAccess()`         | Opens Android Notification Access settings after user confirmation.                                                           |
| `openAppNotificationSettings()`               | Opens Android's app-notification settings for warning alerts.                                                                 |
| `setScanningEnabled(enabled)`                 | Persists the requested scan preference. `active` is returned only when all runtime requirements are met.                      |
| `setMonitoredAppEnabled(id, enabled)`         | Enables or disables SMS or Messenger without granting access to other package notifications.                                  |
| `setHistoryOwner(ownerId \| null)`            | Sets the active encrypted-History owner using a native hash; `null` clears the scope and disables scanning.                   |
| `scanTextLocally(text)`                       | Runs the same native offline evaluator for a user-initiated Manual Scan.                                                      |
| `getHistory()` / `getHistoryRecord(id)`       | Lists local message previews and opens a selected encrypted record.                                                           |
| `deleteHistoryRecord(id)` / `clearHistory()`  | Local encrypted History deletion actions.                                                                                     |
| `getPendingTelemetry()` / `ackTelemetry(ids)` | Sanitized native realtime telemetry synchronization.                                                                          |

No listener callback sends a background SMS payload to JavaScript. Full message text is only decrypted when the person explicitly opens one of their local History records.

## Prebuild and checks

`plugins/withNotificationListener.js` is the source of truth for prebuild. It writes the Kotlin templates from `plugins/android/`, copies the V3 model and metadata into private packaged assets, registers the listener, removes the obsolete Headless-JS components and the legacy `WarningOverlayActivity`, and adds AndroidX DataStore, LiteRT, and JUnit dependencies.

Run these on Windows with the installed JDK 21:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21.0.12'
$env:ANDROID_HOME = 'C:\Users\Aaron\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:NODE_ENV = 'development'

cd android
.\gradlew.bat :app:compileDebugKotlin --console=plain
.\gradlew.bat :app:testDebugUnitTest --tests com.aaronnkie12.noticareapp.bridge.SmishingEvaluatorParityTest --console=plain
```

The focused unit test executes the shared 60-case synthetic TypeScript detection corpus against the Kotlin evaluator. In addition to broad risk classes, it verifies a canonical SHA-256 digest of every case's capped score, ordered reason codes, and URL count, so a rule-weight or reason-code drift fails native CI. The digest is taken from the raw rule output (TypeScript `evaluateRules`), before Safe scores are finalized to 0.
