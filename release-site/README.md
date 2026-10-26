# NotiCare release website

This is a static Android app landing page with privacy-safe screenshots captured from the connected Android device. Its download buttons point directly to the NotiCare 1.0.0 APK and start the download without opening another page. The page includes an interactive screenshot preview, keyboard-accessible screenshot tabs, expandable answers, and scroll controls.

## Preview

Open `index.html` in a browser. The page has no build step or runtime dependencies.
The Privacy section and footer link to the full policy at `https://admin.noticare.site/privacy`.

## Publish

Upload `index.html`, `styles.css`, `script.js`, `assets/`, and `downloads/NotiCare-Android-v1.0.0.apk` to the static hosting provider. Keep the APK at that path so the download buttons work. The APK is excluded from Git because it is larger than GitHub's standard file-size limit.

The APK is about 230 MiB. The download buttons use a same-site link with the HTML `download` attribute, which starts a direct file download in supported browsers.

## Replace the APK for a later release

1. Build and test a new installable Android APK.
2. Keep the Android application ID and signing key consistent with the previous release so users can update without uninstalling.
3. Replace `downloads/NotiCare-Android-v1.0.0.apk` with the new APK (rename it if the app version changes).
4. Update the download filename and version labels in `index.html` and this README as needed.
5. Upload the updated site, including the APK, and test the download link.

The APK's current SHA-256 checksum is:

```text
F0CEC42729A2CAB8A618641B160D979896B4332444EF26DE2E1EF24AFDD09D2F
```
