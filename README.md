# NotiCare

NotiCare is an Android-only, privacy-first anti-smishing application. It checks notifications from the device's current default Messages app, classifies them locally, and can warn about or suppress a dangerous notification when Android permits it. It never becomes the default SMS app, does not request `READ_SMS`, and does not delete messages from the Messages inbox.

“Blocked” means a dangerous **notification** was successfully suppressed. The original SMS remains in the Messages inbox.

## Privacy promise

- Non-SMS notifications are rejected before notification extras are read.
- Full SMS text, complete sender numbers, raw URLs, notification titles, clipboard content, OTPs, and encryption keys stay off Supabase.
- Every scanned SMS notification is saved in the encrypted local Messages inbox, with sender previews, classification filters, unread status, and message details. Blocked status records successful notification suppression separately from risk level.
- Community charts use anonymous, aggregate metadata only.
- Manual Scan reads the clipboard only after the user taps Paste and never opens detected links.

Read the details in [Architecture](docs/ARCHITECTURE.md), [Privacy and data handling](docs/PRIVACY.md), and [the backend data contract](backend/supabase/README.md).

## Requirements

- Node.js 20.19 or newer.
- JDK 21.
- Android Studio with Android SDK Platform 36, Build-Tools, platform-tools, and a physical Android device or emulator.
- An Expo development build or Android release build. Real-time notification scanning is unavailable in Expo Go because it needs a custom native Android service.
- A Supabase project with Phone OTP and an SMS provider configured for production and remote-data testing.

Expo SDK 54 targets React Native 0.81 and Android compile/target SDK 36. See the [Expo SDK 54 reference](https://docs.expo.dev/versions/v54.0.0/).

## Quick start

1. Install JavaScript dependencies.

   ```powershell
   npm ci
   ```

2. Copy `.env.example` to `.env`, add the Supabase URL and anon/publishable key, and make sure `.env` is not tracked by Git.

3. Configure Phone OTP and apply migrations as described in [Supabase setup](docs/SUPABASE_SETUP.md).

4. Confirm the Android toolchain points to JDK 21 and your SDK directory. On Windows, a typical local configuration is:

   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Java\jdk-21.0.12"
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   $env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
   ```

5. Build and install a native development client on an Android device. The launcher regenerates Android code first, so native Expo modules such as SecureStore and Clipboard are included in the installed app.

   ```powershell
   npm run android -- --device
   ```

6. Start Metro for later JavaScript-only changes.

   ```powershell
   npx expo start --dev-client
   ```

## Development phone sign-in

NotiCare uses Supabase Phone OTP by default, including Metro development builds. For offline UI/scanner testing only, set `EXPO_PUBLIC_ENABLE_DEV_PHONE_LOGIN=true` and restart Metro. This explicit development shortcut creates a device-only profile: it cannot upload scans or feedback to the admin dashboard. Release builds always require real OTP.

Release bundles always use Supabase Phone OTP. Test the production login flow with a configured SMS provider before distributing an APK or App Bundle.

When native Kotlin code, config plugins, Expo config, or a native dependency changes, rebuild with the launcher. It regenerates the Android project before installing:

```powershell
npm run android -- --device
```

If a non-clean prebuild is not enough, use `npx expo prebuild --clean` explicitly. It regenerates native folders, so commit or back up intentional native edits first. Expo documents this development-build workflow in its [SDK 54 documentation](https://docs.expo.dev/develop/development-builds/introduction/).

## Quality checks

Run these before opening a pull request:

```powershell
npm run lint
npm run typecheck
npm test -- --runInBand
npm run format:check
```

See [Testing](docs/TESTING.md) for JavaScript, Android, Supabase/RLS, and physical-device test requirements. See [Release checklist](docs/RELEASE_CHECKLIST.md) before distributing an Android build.

## Documentation

- [Architecture and Android limitations](docs/ARCHITECTURE.md)
- [Supabase setup and RPC security](docs/SUPABASE_SETUP.md)
- [Privacy and data handling](docs/PRIVACY.md)
- [Privacy-policy template](docs/PRIVACY_POLICY_TEMPLATE.md)
- [User guide](docs/USER_GUIDE.md)
- [Testing guide](docs/TESTING.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Google Play data safety and notification-listener disclosure](docs/PLAY_STORE_DATA_SAFETY.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
