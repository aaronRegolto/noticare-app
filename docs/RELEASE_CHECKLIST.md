# Android release checklist

Complete every applicable item before releasing NotiCare. A native scanner change requires a new Android build; an over-the-air JavaScript update cannot add or repair the NotificationListenerService.

## Product and privacy

- [ ] The Dashboard says Active only when scanning is enabled, Notification Access is granted, the listener is connected, and a default Messages app is detected.
- [ ] The onboarding and settings disclosure explain why Notification Access is needed and that NotiCare only examines the default SMS app.
- [ ] “Blocked” is consistently explained as notification suppression, not SMS deletion.
- [ ] The app does not request `READ_SMS`, become the default SMS app, use an accessibility service, or use an intrusive overlay.
- [ ] Local History contains only successfully suppressed, Dangerous, real-time notifications.
- [ ] Manual Scan cannot open, preview, resolve, or upload a pasted URL or raw message.
- [ ] Privacy policy, User Guide, support contact, retention periods, and deletion/sign-out behavior are finalized by the legal/privacy owner.

## Security and backend

- [ ] Supabase Phone OTP is enabled, SMS provider credentials are configured server-side, rate limits/CAPTCHA are reviewed, and test phone numbers are removed or restricted.
- [ ] The local `__DEV__` phone shortcut is unavailable in the release bundle, and production Phone OTP has been tested end-to-end.
- [ ] Production migrations are applied in order and `backend/supabase/types/database.types.ts` is regenerated from the linked project.
- [ ] RLS policies and function grants pass the two-user isolation tests.
- [ ] The mobile build contains only `EXPO_PUBLIC_SUPABASE_URL` and the anon/publishable key; no service-role key, provider secret, database password, or signing key is present in source, build variables, APK, logs, or crash reports.
- [ ] Rule-set checksum/version match the TypeScript evaluator, Kotlin evaluator, and test corpus.
- [ ] Demo mode is clearly labeled and verified not to enter community aggregates.
- [ ] Privacy-safe logging has been reviewed for SMS text, raw URLs, OTPs, phone numbers, sessions, and keys.

## Android build

- [ ] `npx expo install --check`, `npm run lint`, and `npx tsc --noEmit` pass.
- [ ] JavaScript tests, Android unit tests, instrumentation tests, and evaluator parity tests pass.
- [ ] A clean native rebuild has been tested after every Kotlin/config-plugin/dependency change.
- [ ] The release build has the correct Android package name, version, version code, icon, adaptive icon, splash screen, signing configuration, and target SDK.
- [ ] Release artifact is produced with EAS Build or the approved CI pipeline, then installed on a physical Android device.
- [ ] Native debug logging and test/demo controls are absent or disabled in the release variant.

The checked-in EAS profiles support these build entry points:

```powershell
# Installable internal development client
eas build --platform android --profile development

# Store-ready Android App Bundle
eas build --platform android --profile production
```

Use the exact Git revision that passed the checks above. Review the EAS build log for accidental environment-variable output before sharing it.

## Device acceptance

- [ ] Test on at least the supported Android version range and the primary Philippines-market Messages app(s).
- [ ] Test a real physical device with notification access enabled, denied, revoked, and restored.
- [ ] Test default Messages-app change, reboot, app update, service disconnect, locked screen, hidden previews, group/bundled notifications, multipart text, MMS previews, and duplicate notification updates.
- [ ] Confirm non-SMS app notifications are discarded before extras are accessed.
- [ ] Confirm Safe, Suspicious, and Dangerous actions match the product contract and do not delete the SMS inbox item.
- [ ] Confirm offline scans queue metadata, retry idempotently, and show cached/offline aggregate states.

## Google Play submission

- [ ] Complete the Data safety form using [Play Store notes](PLAY_STORE_DATA_SAFETY.md) and the final vendor/legal review.
- [ ] Include a prominent in-app notification-listener disclosure before the Android settings intent.
- [ ] Verify the privacy-policy URL is public, complete, accurate, and matches the build.
- [ ] Document why Notification Access is core functionality in the Play Console declaration and provide reviewer test instructions/test account if requested.
- [ ] Review current Google Play policy requirements immediately before submission; platform policy can change.

## Rollback and monitoring

- [ ] Retain the prior signed release and prior active rule-set version for rollback.
- [ ] Define owner/on-call contacts for authentication, native scanner, database, and policy incidents.
- [ ] Monitor aggregate error rates, authentication delivery failures, crash-free sessions, and false-result feedback without logging user content.
- [ ] Prepare a user-facing incident message that does not expose scans, phone numbers, or messages.
