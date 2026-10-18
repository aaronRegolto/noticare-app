# NotiCare release website

This is a static Android app landing page with privacy-safe screenshots captured from the connected Android device. Its download buttons link directly to the tested NotiCare 1.0.0 APK attached to the public GitHub Release, so the release page itself does not open.

## Preview

Open `index.html` in a browser. The page has no build step or runtime dependencies.

## Publish

Upload `index.html`, `styles.css`, and `assets/` to the static hosting provider. The APK is intentionally excluded from Git and hosted separately as a GitHub Release asset, so it does not need to be copied to the website host.

The linked APK is about 241 MiB. Its direct download URL is `https://github.com/aaronRegolto/noticare-app/releases/download/v1.0.0/application-612fb38b-7f1e-400c-b445-2c887c3d3040.apk`.

## Replace the APK for a later release

1. Build and test a new installable Android APK.
2. Keep the Android application ID and signing key consistent with the previous release so users can update without uninstalling.
3. Publish the new APK as an asset on a public GitHub Release.
4. Update all three direct APK links and the version labels in `index.html` to match the new release asset.
5. Upload the updated site and test the new download link.

The APK's current SHA-256 checksum is:

```text
E882BFAEB6EF64FE7D674C76F9499C19B80C820DD29792D24524FB0EF0A414E7
```
