# Troubleshooting

## “No Java compiler found” or Gradle uses an old Java version

NotiCare's Android build needs a JDK, not a Java Runtime Environment. Confirm the terminal uses JDK 21:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

Restart the terminal/IDE after changing system environment variables. `java -version` should report Java 21 before running `npx expo run:android`.

## “SDK location not found”

Install Android SDK Platform 36 and configure its path for Gradle. On Windows, set `ANDROID_HOME` for the active terminal or create `android/local.properties` with the escaped SDK path:

```properties
sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

Do not commit `android/local.properties`; it is machine-specific.

## The real-time scanner does not work in Expo Go

Expected behavior. Expo Go cannot contain the custom Kotlin `NotificationListenerService`. Install a local development build with `npx expo run:android --device` or an EAS development/release build, then start Metro with `npx expo start --dev-client`.

## Scanning shows “Permission required”

Turn on scanning in NotiCare, accept the explanation, and grant Notification Access in Android Settings. Return to the app; it must re-check permission rather than assuming the setting changed. Some Android manufacturers place the setting under Special app access or Notification access.

## Scanning shows “SMS app unavailable” or the wrong Messages app

Set a default SMS application in Android Settings, then return to NotiCare. The native service resolves `Telephony.Sms.getDefaultSmsPackage(context)` for each eligible notification, so a default-app change is picked up without trusting a stale stored package.

## A message says `content_unavailable`

The Messages app or Android did not expose usable notification text, commonly because previews are hidden, the phone is locked, an app chose a generic notification summary, or the message is bundled. NotiCare does not guess. Unlock the device/show notification previews if appropriate, or use Manual Scan by copying and pasting the message yourself.

## A Dangerous message remained visible

NotiCare can attempt notification suppression only when Android and the source app permit it. It never deletes the SMS from the inbox. If suppression fails, the event must not appear in blocked History; the app should still provide a clear caution/warning if it has a valid scan result.

## Dashboard chart is empty or offline

Check network access and Supabase authentication. The app should show cached aggregate data as stale/offline when available, with a retry action. A new project will legitimately show empty community statistics until privacy-safe events are recorded. Do not use raw SMS data to populate a chart.

## Phone OTP is not received or verification fails

Verify the phone is E.164, Phone OTP is enabled in Supabase, an SMS provider/sender is configured, and project rate limits permit a new request. Wait for the resend countdown. Treat invalid, expired, rate-limited, and network errors as user-facing generic states; do not log the code or phone number.

## OTP is skipped while developing

Expected behavior when the app is running from Metro in a JavaScript development bundle. NotiCare creates a device-only development profile after validating the phone number, so you can test the app without an SMS provider. Build and test a release variant to exercise Supabase Phone OTP; the shortcut is unavailable there.

## Native change did not appear after a JavaScript reload

Changes to Kotlin, Android manifest, config plugins, `app.json`, or native dependencies require a new native build. Regenerate intentionally after saving/committing native work:

```powershell
npx expo prebuild --clean
npx expo run:android --device
```

For TypeScript-only changes, `npx expo start --dev-client` is enough.
