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

| Result     | Meaning                                                  | What NotiCare does                                                       |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Safe       | No meaningful phishing signs were found.                 | Leaves the SMS notification alone.                                       |
| Suspicious | There are warning signs, but not enough strong evidence. | Leaves the SMS notification visible and can show a caution.              |
| Dangerous  | Strong signs suggest phishing or credential theft.       | Shows Block and Ignore controls. The notification is suppressed only if you choose Block. |

If a notification is marked blocked, the original SMS is still in your Messages inbox. NotiCare suppresses a notification only after you choose Block and Android allows it.

In **Settings & Privacy → Real-Time Protection**, turn on **Full-screen phishing warning** to show an immersive explanation when Android permits a background screen to open. Turn it off to use an actionable high-priority banner. Both modes explain the detected warning signs and offer **Block** and **Ignore**. Android can restrict background activity launches, so an actionable banner always remains available as a fallback.

## Manually scan a message

1. Long-press the SMS in your Messages app and tap **Copy**.
2. Return to NotiCare and open **Manual Scan**.
3. Tap **Paste**, review the text, then tap **Scan Message**.

NotiCare reads the clipboard only when you tap Paste. It shows URLs as text and does not open them. A Manual Scan does not add a message to blocked History.

## View and delete History

History contains only Dangerous real-time notifications that NotiCare successfully suppressed. It does not include Safe messages, visible Suspicious messages, unrelated app notifications, or Manual Scan results.

Use search or the month filter to find a local record. You can delete one record or clear all local History. Deleting History removes the encrypted local copy; it does not delete the original SMS from Messages.

## If a message looks suspicious

- Do not tap the link.
- Do not share your password, PIN, or OTP.
- Contact the organisation using its official app, website, or verified phone number.
- Do not rely on a Safe result as a guarantee. If you are unsure, verify independently.

## Common issues

If previews are hidden or notification text is unavailable, NotiCare may report that it cannot scan the notification. You can copy and manually scan the text instead. If you change your default Messages app, open NotiCare again so it can update its status. See [Troubleshooting](TROUBLESHOOTING.md) for more help.
