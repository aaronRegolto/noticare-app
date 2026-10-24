# NotiCare privacy-policy template

> This is a technical starting point, not legal advice. A qualified privacy professional must adapt it for the organisation, target countries, actual vendors, retention periods, contact details, and Google Play submission before publication.

**Effective date:** `[DATE]`  
**Operator:** `[LEGAL ENTITY]`  
**Contact:** `[PRIVACY EMAIL / POSTAL ADDRESS]`

## 1. What this app does

NotiCare is an Android scam-detection application. When you turn on Real-Time Scanning and grant Android Notification Access, it examines only notifications from apps you enable in Settings: the current default SMS app and Messenger. Messenger is optional and default off. Other apps are rejected before notification text is read. Android or a source app may hide or redact previews.

NotiCare does not use the Android `READ_SMS` permission, does not become your default SMS application, and does not delete messages from their source apps.

## 2. Information we process

**On your device:** NotiCare may process the available text, sender/display information, and URLs included in an enabled app's notification preview in memory to scan it locally. Safe messages are discarded immediately. Only Suspicious or Dangerous alerts may be saved in encrypted local History, subject to the in-app retention limit. If you enable sender identification and grant Android Contacts permission, NotiCare checks whether the flagged sender matches a saved contact; the lookup stays on-device and only the match/no-match flag is saved with the alert. Contact details are not copied or uploaded. The encryption key is protected by Android Keystore and is not uploaded.

**For authentication:** We use your phone number through Supabase Phone OTP to send and verify a login code. Our application profile stores only the last four digits of the verified phone number.

**For anonymous community statistics:** We may send an application-generated event UUID, anonymous installation UUID, scan source, threat level, score bucket, stable rule codes, URL count, rule version, timestamp, and whether a realtime Dangerous notification was successfully suppressed.

**Feedback:** If you submit a correction, we process the classification you selected, optional event reference, stable rule codes, rule version, and timestamp.

## 3. Information we do not upload by default

We do not upload scanned message text, full sender numbers, contact names, notification titles, raw URLs, clipboard contents, OTP contents, Android/advertising/hardware IDs, local encryption keys, or links you may have visited unless you explicitly choose a message-report action. A report shares that message's text and sender with the community service so other users can be warned.

## 4. How we use information

We use local notification data to classify a message, explain a result, issue an on-device caution or warning, and maintain encrypted local History for successfully scanned notifications. We use authenticated and anonymous metadata to operate the service, prevent duplicate aggregate counts, show community trends, improve rules using non-content feedback, and protect the service from abuse.

We do not sell SMS content, build an advertising profile, or use message content to target advertising.

## 5. Sharing and service providers

We use Supabase for authentication and database services and `[SMS PROVIDER]` to send authentication codes. These providers process data only as needed to provide their services, subject to their agreements and privacy terms. We may disclose information when required by applicable law or to protect the safety, rights, and security of users and the service.

## 6. Retention

Encrypted local History is capped by the account's current plan and older records may be pruned as new messages arrive. You can delete records, clear History, or choose removal at sign-out. Authentication data is retained by the authentication provider according to the operator's configured retention policy. Anonymous event and aggregate retention periods are: `[DEFINE PERIODS]`.

## 7. Your choices and rights

You can turn off Real-Time Scanning, revoke Notification Access in Android Settings, delete local History, sign out, and choose whether to remove local History at sign-out. Depending on your location, you may have rights to access, correct, delete, or restrict processing of personal information. Contact `[PRIVACY EMAIL]` to make a request.

## 8. Security

We use TLS for service communication, database Row Level Security for account-scoped cloud data, and Android Keystore-backed encryption for local blocked-message History. No security method is perfect; do not rely on NotiCare as the only protection against fraud.

## 9. Children

`[STATE AGE POLICY AND JURISDICTION-SPECIFIC TERMS.]`

## 10. Changes and contact

We may update this policy when the application or legal requirements change. We will update the effective date and provide notice where required. For questions, contact `[PRIVACY EMAIL]`.
