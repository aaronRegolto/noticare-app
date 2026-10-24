# NotiCare user guide

## What NotiCare does

NotiCare helps you assess messaging notifications for scams, phishing, abusive language, and direct or cyber threats. It can watch the Messages app Android has set as your default SMS app, plus Messenger when you opt in to it in Settings.

NotiCare does not read your SMS inbox, delete messages, or guarantee that every scam will be detected.

## Sign in with your phone

1. Choose your country code. The default is Philippines `+63`.
2. Enter your mobile number and tap **Send OTP**.
3. Enter the six-digit code sent to your phone.
4. If the code expires or does not arrive, wait for the resend timer, check your number, then request a new code.

Your phone number is used to authenticate your account. NotiCare does not upload your SMS content for sign-in.

## Turn on Real-Time Scanning

1. On Dashboard, turn on Real-Time Scanning.
2. In Settings, choose which apps to scan. SMS is enabled by default; Messenger is optional and appears as unavailable if not installed.
3. Allow Notification Access for NotiCare in Android Settings.
4. Return to NotiCare. Android or a source app may hide or redact message previews, so some notifications cannot be checked.

You can turn scanning off globally or disable an individual app whenever you want. Per-app selection is not a guarantee that every notification is readable or suppressible.

## What the results mean

| Result     | Score  | Meaning                                                  | What NotiCare does                                                                        |
| ---------- | ------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Safe       | 0      | No meaningful phishing signs were found.                 | Leaves the SMS notification alone.                                                        |
| Suspicious | 30–69  | There are warning signs, but not enough strong evidence. | Uses your selected warning style and lets you Block or Ignore it.                         |
| Dangerous  | 70–100 | Strong signs suggest phishing or credential theft.       | Shows Block and Ignore controls. The notification is suppressed only if you choose Block. |

A Safe result always shows a score of 0. It means no strong warning signs were found, not that the message is guaranteed to be safe. NotiCare's English and Filipino profanity list is curated, not exhaustive; a curse word may be misunderstood without context. Direct physical or cyber-threat patterns are scored Dangerous when matched.

After independent spam or phishing evidence from a sender in the default Messages/SMS app, subsequent retained SMS messages from that sender can move from Suspicious toward Dangerous. Messenger messages do not inherit this sender-history score. Repetition alone never raises a benign sender's score. This history-based signal is limited by the local History retention cap and a 30-day lookback.

If a notification is marked blocked, the original SMS is still in your Messages inbox. NotiCare suppresses a notification only after you choose Block and Android allows it.

In **Settings & Privacy → Warning Appearance**, choose **Full-screen warning** to show an immersive explanation for Suspicious and Dangerous detections. To cover the screen instantly while you are using another app (a game, TikTok, Facebook), allow **Display over other apps** when NotiCare asks. Without it, the full-screen warning appears only while your phone is locked or the screen is off. Choose **Notification banner** for a compact alert. Both modes explain the detected warning signs and offer **Block** and **Ignore**. An actionable notification always remains available as a fallback.

## Check links before opening them

To check links that Android sends to NotiCare, set NotiCare as the default browser in **Settings → Safe Link Protection**. If Facebook or Messenger offers an **Open links externally** option, enable it; otherwise, links opened inside those apps may stay in their built-in browser and never reach Android's browser chooser. NotiCare cannot force those apps to hand off an in-app link tap.

When Android routes a link to NotiCare, NotiCare checks it first. Safe links show a browser picker so you choose where to continue. Suspicious or Dangerous links show a warning; choosing **Open anyway** then shows the browser picker. You can also share a link to NotiCare from an app's Share menu. NotiCare does not inspect page contents or guarantee that a Safe link is harmless.

## Manually scan a message

Use **Manual Scan** to check a message you weren't sent directly, such as one on a friend's phone or in a screenshot.

1. Open **Manual Scan** and tap **Take a photo**, then point your camera at the message. Or tap **Upload screenshot**.
2. Crop to just the message, leaving out names, times, and other messages.
3. Check that the text NotiCare read matches the message, especially any links, then tap **Check message**.

The photo is read on your phone and deleted right after; it is never uploaded. NotiCare asks for camera access only the first time you tap **Take a photo**. For a clearer read, turn the other phone's brightness up and avoid glare.

To check a message on your own phone, use that app's share menu and choose **NotiCare** when available, or copy the text and tap **Paste text** in Manual Scan. NotiCare reads the clipboard only when you tap Paste text. It shows URLs as text and does not open them. A Manual Scan does not add a message to the captured Messages inbox.

Choose **Mark as safe** if you believe the message is legitimate, or **Report smishing** if you believe it is a scam. A scam report shares the message text you chose to report so other users can be warned; safe feedback contains classification metadata only. With the local OTP bypass, reports are saved on this device and are not sent to admin. Verified Supabase sessions submit reports online.

## Read messages in Tagalog or English

In **Settings → Message language**, choose **Tagalog** or **English** to show captured messages in that language, or **Default** to show them exactly as received. This is free on every plan.

The same choice sets the language of NotiCare's scam warning pop-ups, notifications, Manual Scan results, and the warning signs listed in an opened message: **Tagalog** shows them in Tagalog, while **Default** and **English** show them in English. Warnings are written in both languages inside the app, so they appear instantly and work offline, with no download needed.

- NotiCare downloads a language pack (about 60 MB) once, over Wi-Fi only. Until then, messages show as received.
- English and Taglish messages are translated to Tagalog, or Tagalog and Taglish messages to English. Taglish translations can be imperfect.
- Links and email addresses always stay exactly as received.
- Open a message and tap **Show original** to see the exact wording that was received.
- Translation is for reading only: NotiCare always scans the original message, so a translation never changes a result.

## View and delete captured messages

**Messages** shows only messages NotiCare classified as Suspicious or Dangerous from apps you enabled. Safe messages are evaluated in memory and immediately discarded; they are not added to History or telemetry. Flagged alerts are encrypted and scoped to the signed-in profile, up to the plan's retention cap. It does not import earlier messages, unrelated app notifications, or Manual Scan results. The app does not send or reply to messages.

Search alert senders or message text, filter by Spam, Threats, or Phishing and by Suspicious/Dangerous risk level, unread or blocked status, and month. Tap an alert to read its full text and scan details. Optionally enable **Identify saved senders** in Settings and grant Contacts permission to label whether an alert sender matches a contact stored on this phone. That lookup is local and only the match flag is kept with the alert. Messages refreshes while open; pull down for an immediate refresh. Deleting a local copy or clearing the inbox does not delete the original message from its source app.

After updating the native capture code, run `npm run android` to build and install it. A Metro reload alone only updates the interface. Previously captured blocked records remain available; new captures include all classifications.

## If a message looks suspicious

- Do not tap the link.
- Do not share your password, PIN, or OTP.
- Contact the organisation using its official app, website, or verified phone number.
- Do not rely on a Safe result as a guarantee. If you are unsure, verify independently.

## Common issues

If previews are hidden or notification text is unavailable, NotiCare may report that it cannot scan the notification. You can copy and manually scan the text instead. If you change your default Messages app, open NotiCare again so it can update its status. See [Troubleshooting](TROUBLESHOOTING.md) for more help.
