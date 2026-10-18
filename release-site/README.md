# NotiCare release website

This is a static Android app landing page. It includes the tested NotiCare 1.0.0 APK in `downloads/` and privacy-safe screenshots captured from the connected Android device.

## Preview

Open `index.html` in a browser. The page has no build step or runtime dependencies.

## Publish

Upload the **contents** of this folder to the public document root of your web host, preserving the `assets/` and `downloads/` folders. Then open the published site in a private browser window and test the APK download on an Android device.

The included APK is about 241 MiB. Check that your web host allows a file this large and that its bandwidth/download limits suit your audience. If your host cannot serve files of this size, upload the APK to a public object-storage/download service and change the three APK links in `index.html` to that public HTTPS download URL.

## Replace the APK for a later release

1. Build and test a new installable Android APK.
2. Keep the Android application ID and signing key consistent with the previous release so users can update without uninstalling.
3. Replace `downloads/NotiCare-Android-v1.0.0.apk` with the new APK.
4. Update the version labels and APK link filename in `index.html`.
5. Upload the updated site and test the new download link.

The APK's current SHA-256 checksum is:

```text
E882BFAEB6EF64FE7D674C76F9499C19B80C820DD29792D24524FB0EF0A414E7
```
