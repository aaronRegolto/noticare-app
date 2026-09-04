# Android native scanning foundation

NotiCare real-time scanning is Android-only and requires a development or release build. It does not run in Expo Go.

## Privacy boundary

`SmsNotificationListener` is a Kotlin `NotificationListenerService`. For each posted notification it:

1. Reads the persisted `realtime_scanning_enabled` DataStore value; the default is Off.
2. Resolves the current default SMS package with `Telephony.Sms.getDefaultSmsPackage(context)`.
3. Compares the notification package to that package and rejects all other packages before reading notification extras.
4. Rejects NotiCare's own notifications and group summaries.
5. Reads `EXTRA_BIG_TEXT`, `EXTRA_TEXT`, and `EXTRA_TEXT_LINES` only after the package check; duplicate multipart text is collapsed.

Consequently, social, email, banking, shopping, and other unrelated notifications are never read, scored, saved, or queued by this service. The app does not request `READ_SMS`, does not become the default SMS app, and does not use an accessibility service or an overlay.

If Android hides a notification preview, the listener records the non-sensitive runtime status `content_unavailable`; it does not guess at message content.

## Native actions

The Kotlin evaluator is offline-only and mirrors the versioned TypeScript rules in `src/features/detection/rules.ts` (version `2026.08.1`). It also runs the bundled V3 LiteRT model with its audited UTF-8 byte preprocessing and locked thresholds. The V3 model is advisory: it may raise a rule-safe message to Suspicious, but it cannot independently mark a notification Dangerous or suppress it. If model loading or inference fails, scanning falls back to the rule evaluator. Neither evaluator opens, resolves, previews, or fetches a URL.

- **Safe:** leaves the notification visible and queues sanitized aggregate metadata.
- **Suspicious:** leaves it visible and posts a NotiCare caution with no SMS body, sender, or URL.
- **Dangerous:** shows a full-screen warning or actionable banner with heuristic reasons and **Block**/**Ignore** controls. NotiCare calls `cancelNotification(sbn.key)` only after **Block** is chosen. Only when Android accepts that call does NotiCare save the message in encrypted local History and call it _blocked_. **Ignore** leaves the notification visible. The original SMS is never deleted from the Messages inbox.

Android does not provide a separate, synchronous “delivery suppressed” acknowledgement after `cancelNotification`; the app treats the platform accepting the cancellation call as the available best-effort success signal.

## Local data

Blocked History is stored in an AES-GCM encrypted file. The encryption key is created in Android Keystore under a NotiCare-specific alias and never crosses the React Native bridge. History is also scoped to a hash of the currently signed-in profile: a different profile cannot list, open, delete, or clear another profile's records. Clearing the owner scope on sign-out also turns monitoring off, so a shared device cannot save new raw SMS content while it has no active owner. If Keystore or encrypted storage cannot be initialized, raw message text is not written anywhere and the native status reports encrypted History as unavailable.

History lists contain a masked sender, risk metadata, and the fixed label `Content redacted. Open to view the protected SMS.` They never contain an SMS-derived excerpt, URL, OTP, title, or sender value beyond the masked sender. Full encrypted message text is returned only by `getHistoryRecord(id)` after an explicit user action.

The separate telemetry queue is also encrypted. It contains only:

- client-generated UUID
- `realtime` source
- threat level
- coarse score bucket `0..10`
- blocked flag
- stable rule codes
- URL count
- rule version and timestamp

It never contains SMS text, sender, notification title, raw URL, OTP, token, or key. `getPendingTelemetry` claims due entries and applies capped exponential backoff; `ackTelemetry` deletes IDs only after an authenticated, idempotent upload succeeds.

## React Native bridge

The public typed wrapper is `src/services/notificationListener.ts`.

| Function                                      | Purpose                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `getMonitoringStatus()`                       | DataStore preference, Notification Access, listener connection, detected default SMS app, and storage diagnostics. |
| `requestNotificationListenerAccess()`         | Opens Android Notification Access settings after user confirmation.                                                |
| `openAppNotificationSettings()`               | Opens Android's app-notification settings for warning alerts.                                                      |
| `setScanningEnabled(enabled)`                 | Persists the requested scan preference. `active` is returned only when all runtime requirements are met.           |
| `setHistoryOwner(ownerId \| null)`            | Sets the active encrypted-History owner using a native hash; `null` clears the scope and disables scanning.        |
| `scanTextLocally(text)`                       | Runs the same native offline evaluator for a user-initiated Manual Scan.                                           |
| `getHistory()` / `getHistoryRecord(id)`       | Lists masked History summaries and explicitly decrypts a selected record.                                          |
| `deleteHistoryRecord(id)` / `clearHistory()`  | Local encrypted History deletion actions.                                                                          |
| `getPendingTelemetry()` / `ackTelemetry(ids)` | Sanitized native realtime telemetry synchronization.                                                               |

No listener callback sends a background SMS payload to JavaScript. Full message text is only decrypted when the person explicitly opens one of their local History records.

## Prebuild and checks

`plugins/withNotificationListener.js` is the source of truth for prebuild. It writes the Kotlin templates from `plugins/android/`, copies the V3 model and metadata into private packaged assets, registers the listener, removes the obsolete Headless-JS and overlay components, and adds AndroidX DataStore, LiteRT, and JUnit dependencies.

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

The focused unit test executes the shared 60-case synthetic TypeScript detection corpus against the Kotlin evaluator. In addition to broad risk classes, it verifies a canonical SHA-256 digest of every case's capped score, ordered reason codes, and URL count, so a rule-weight or reason-code drift fails native CI.
