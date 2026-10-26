# NotiCare release website

This is a static Android app landing page with privacy-safe screenshots captured from the connected Android device. Its download buttons point directly to the NotiCare 1.0.0 APK and start the download without opening another page. The page includes an interactive screenshot preview, keyboard-accessible screenshot tabs, expandable answers, and scroll controls.

## Preview

Open `index.html` in a browser. The page has no build step or runtime dependencies.
The Privacy section and footer link to the full policy at `https://admin.noticare.site/privacy`.

## Publish

Upload `index.html`, `styles.css`, `script.js`, and `assets/` to the static hosting provider. The APK is hosted as a GitHub Release asset, and the download buttons link directly to that file.

The linked APK is about 230 MiB. Its direct download URL is `https://github.com/aaronRegolto/noticare-app/releases/download/v1.0.0/application-e52e4006-81ed-488c-9933-b6c9e77e692b.apk`.

## Replace the APK for a later release

1. Build and test a new installable Android APK.
2. Keep the Android application ID and signing key consistent with the previous release so users can update without uninstalling.
3. Publish the new APK as an asset on a public GitHub Release.
4. Update all three APK links and the version labels in `index.html` to match the new release asset.
5. Upload the updated site and test the download link.

The APK's current SHA-256 checksum is:

```text
F0CEC42729A2CAB8A618641B160D979896B4332444EF26DE2E1EF24AFDD09D2F
```
