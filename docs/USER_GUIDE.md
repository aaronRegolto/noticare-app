# NotiCare user guide

## What NotiCare does

NotiCare helps you assess SMS notifications for signs of phishing or smishing. It can watch the Messages app that Android has set as your default SMS app. It checks for suspicious links, urgent requests, fake rewards or deliveries, and attempts to get your password, PIN, or OTP.

NotiCare does not read your SMS inbox, delete messages, or guarantee that every scam will be detected.

## Sign in with your phone

1. Choose your country code. The default is Philippines `+63`.
2. Enter your mobile number and tap **Send OTP**.
3. Enter the six-digit code sent to your phone.
4. If the code expires or does not arrive, wait for the resend timer, check your number, then request a new code.

Your phone number is used to authenticate your account. NotiCare does not upload your SMS content for sign-in.

## Turn on Real-Time Scanning

1. On Dashboard, turn on Real-Time Scanning.
2. Read the explanation, then tap **Continue to Settings**.
3. Allow Notification Access for NotiCare in Android Settings.
4. Return to NotiCare and confirm that it detects a default Messages app.

The status is Active only when notification access is granted, the service is connected, and a default Messages app is available. You can turn scanning off whenever you want.

## What the results mean

| Result     | Score  | Meaning                                                  | What NotiCare does                                                       |
| ---------- | ------ | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Safe       | 0      | No meaningful phishing signs were found.                 | Leaves the SMS notification alone.                                       |
| Suspicious | 30–69  | There are warning signs, but not enough strong evidence. | Uses your selected warning style and lets you Block or Ignore it.         |
| Dangerous  | 70–100 | Strong signs suggest phishing or credential theft.       | Shows Block and Ignore controls. The notification is suppressed only if you choose Block. |

A Safe result always shows a score of 0. It means no strong warning signs were found, not that the message is guaranteed to be safe.

If a notification is marked blocked, the original SMS is still in your Messages inbox. NotiCare suppresses a notification only after you choose Block and Android allows it.

In **Settings & Privacy → Warning Appearance**, choose **Full-screen warning** to show an immersive explanation for Suspicious and Dangerous detections. To cover the screen instantly while you are using another app (a game, TikTok, Facebook), allow **Display over other apps** when NotiCare asks. Without it, the full-screen warning appears only while your phone is locked or the screen is off. Choose **Notification banner** for a compact alert. Both modes explain the detected warning signs and offer **Block** and **Ignore**. An actionable notification always remains available as a fallback.

## Manually scan a message

1. Long-press the SMS in your Messages app and tap **Copy**.
2. Return to NotiCare and open **Manual Scan**.
3. Tap **Paste**, review the text, then tap **Scan Message**.

NotiCare reads the clipboard only when you tap Paste. It shows URLs as text and does not open them. A Manual Scan does not add a message to the captured Messages inbox.

Choose **Mark as safe** if you believe the message is legitimate, or **Report smishing** if you believe it is a scam. Reports contain classification metadata, never message text. With the local OTP bypass, reports are saved on this device and are not sent to admin. Verified Supabase sessions submit reports online.

## View and delete captured messages

**Messages** shows every SMS notification scanned while monitoring is on: Safe, Suspicious, and Dangerous, including messages you ignore or block. These copies remain encrypted and scoped to the signed-in profile. It does not import earlier SMS, unrelated app notifications, or Manual Scan results. The app does not send or reply to SMS.

Search sender names or the first 160 characters of a message, filter by classification, unread or blocked status, and use the month filter to narrow results. Tap a message to read its full text and scan details. Messages refreshes while open; pull down for an immediate refresh. Deleting a local copy or clearing the inbox does not delete the original SMS from your Messages app.

After updating the native capture code, run `npm run android` to build and install it. A Metro reload alone only updates the interface. Previously captured blocked records remain available; new captures include all classifications.

## If a message looks suspicious

- Do not tap the link.
- Do not share your password, PIN, or OTP.
- Contact the organisation using its official app, website, or verified phone number.
- Do not rely on a Safe result as a guarantee. If you are unsure, verify independently.

## Common issues

If previews are hidden or notification text is unavailable, NotiCare may report that it cannot scan the notification. You can copy and manually scan the text instead. If you change your default Messages app, open NotiCare again so it can update its status. See [Troubleshooting](TROUBLESHOOTING.md) for more help.
