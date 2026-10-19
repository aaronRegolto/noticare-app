# NotiCare release website

This is a static Android app landing page with privacy-safe screenshots captured from the connected Android device. Its download buttons link directly to the NotiCare 1.0.0 APK attached to the public GitHub Release, so the release page itself does not open. The page includes an interactive screenshot preview, keyboard-accessible screenshot tabs, expandable answers, and scroll controls.

## Preview

Open `index.html` in a browser. The page has no build step or runtime dependencies.
The Privacy section and footer link to the full policy at `https://admin.noticare.site/privacy`.

## Publish

Upload `index.html`, `styles.css`, `script.js`, and `assets/` to the static hosting provider. The APK is hosted separately as a GitHub Release asset, so it does not need to be copied to the website host.

The linked APK is about 229 MiB. Its direct download URL is `https://github.com/aaronRegolto/noticare-app/releases/download/v1.0.0/application-9c292ec2-cdb4-47f2-9fa4-5a36fa1cc3b6.apk`.

## Replace the APK for a later release

1. Build and test a new installable Android APK.
2. Keep the Android application ID and signing key consistent with the previous release so users can update without uninstalling.
3. Publish the new APK as an asset on a public GitHub Release.
4. Update all three direct APK links and the version labels in `index.html` to match the new release asset.
5. Upload the updated site and test the new download link.

The APK's current SHA-256 checksum is:

```text
C44939FCFD1C15A6DE253A2B9045B15694D10EBB3D0932B818E3BA0EC3449BE0
```
