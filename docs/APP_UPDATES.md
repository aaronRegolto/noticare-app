# Releasing an app update (APK)

NotiCare is installed from an APK, not Google Play, so nothing updates it automatically. Instead, each time the app opens it checks the newest release published in the admin dashboard. If that release's version code is higher than the installed build's, the app shows **Update available** with:

- what the update is for (one line),
- what's new (a list of changes),
- the release date,
- a **Download update** button that opens the APK link.

Users can tap **Later**, except for a **required** update. Settings → Help & privacy → **App version** shows the installed version and lets users check by hand.

Anything that ships inside the app needs a new APK: screens, wording, detection rules, and the ML model. Supabase data, Edge Functions, and the admin dashboard update without one.

## Steps

1. **Raise the version name** in `app.json` (`expo.version`, for example `1.0.0` → `1.1.0`). This is the number users see.
2. **Build the APK:**

   ```powershell
   npx eas-cli@latest build --platform android --profile preview
   ```

   The `preview` profile raises the Android **version code** automatically on every build (`autoIncrement` in `eas.json`).

3. On the EAS build page, note the **version code** and copy the **APK download link**. EAS build links may stop working after a while, so for a release you'll keep offering, upload the APK somewhere permanent (for example a GitHub Release) and use that link.
4. **Install the APK on your own phone first** and check it works.
5. In the admin dashboard, open **App updates** and fill in:
   - **Version code**: the one from the EAS build page. It must be higher than the last published release.
   - **Version name**: the same as `app.json`, for example `1.1.0`.
   - **What this update is for**: one plain sentence, for example _Better detection of GCash scams_.
   - **What's new**: one change per line, written for users, for example _Detects fake GCash and Maya login links_.
   - **APK download link**: must start with `https://`.
   - **Required update**: only for security fixes; users can't dismiss it.
6. Click **Publish update**. Phones show the notice the next time NotiCare opens (or returns to the foreground after an hour).

If a release turns out broken, click **Withdraw** on it. Phones stop offering it; then publish a fixed build with a new, higher version code.

## What users do

1. Tap **Download update**; the browser downloads the APK.
2. Open the downloaded file. The first time, Android asks to allow installs from the browser.
3. Tap **Update**. History, settings, sign-in, and plan are kept, as long as the APK was built by the same EAS project (same signing key and package name).

## Setup (once)

Apply the migration that creates the releases table:

```powershell
npx supabase db push --workdir backend
```

Builds made before this feature can't show the notice. Users of those builds need to install the first build that includes it by hand.
