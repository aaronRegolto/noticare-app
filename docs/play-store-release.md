# Google Play release checklist

What to enter in the Play Console for NotiCare, and the steps that happen outside the code.

## 1. Before the first build

- [ ] Apply the account-deletion migration to the live database:
      `npx supabase db push --workdir backend` (adds `delete_my_account`). Until then, **Delete account** in the app shows "Unable to delete account".
- [ ] Push `master` so Render redeploys the admin site, then check that these open without signing in:
  - https://admin.noticare.site/privacy
  - https://admin.noticare.site/delete-account
- [ ] Make sure **support@noticare.site** receives email (it is the contact on both pages), or replace it in
      `admin/public/privacy.html` and `admin/public/delete-account.html`.
- [ ] Add a reviewer test number in Supabase: **Authentication → Sign In / Providers → Phone → Test phone numbers
      and OTPs**: `639171234567=123456`. Test numbers never send a real SMS. Set **Test OTPs Valid Until** well
      past the review and closed-test period (for example a year ahead), or the reviewer login stops working.

## 1b. SMS sign-in codes (Semaphore)

Sign-in codes go through Semaphore via a Supabase "Send SMS" hook (`backend/supabase/functions/send-sms-semaphore`).
Once the hook is enabled it takes over from the Twilio settings under Sign In / Providers → Phone, which can stay as
they are.

- [ ] Semaphore account with credit; copy the API key (never commit it or paste it in chat).
- [x] Deploy the function: `npx supabase functions deploy send-sms-semaphore --no-verify-jwt --workdir backend`
- [ ] Supabase → **Authentication → Hooks → Add hook → Send SMS hook** → type **HTTPS**, URL
      `https://<project-ref>.supabase.co/functions/v1/send-sms-semaphore`. Generate the secret and copy it.
- [ ] Supabase → **Edge Functions → Secrets**: add `SEND_SMS_HOOK_SECRET` (the hook secret, `v1,whsec_…`) and
      `SEMAPHORE_API_KEY`. Optional: `SEMAPHORE_SENDER_NAME` once Semaphore approves a sender name.
- [ ] Enable the hook, then sign in with a real PH number to confirm the code arrives.
- [ ] Authentication → Rate Limits: keep **SMS sent per hour** low (30–60) so nobody can drain the credit.

Only Philippine numbers (+63 9…) can receive codes; others get an error. Test numbers keep working without SMS.

- [ ] Semaphore account with credit; copy the API key (never commit it or paste it in chat).
- [ ] Deploy the function: `npx supabase functions deploy send-sms-semaphore --no-verify-jwt --workdir backend`
- [ ] Supabase → **Authentication → Hooks → Add hook → Send SMS hook** → type **HTTPS**, URL
      `https://<project-ref>.supabase.co/functions/v1/send-sms-semaphore`. Generate the secret and copy it.
- [ ] Supabase → **Edge Functions → Secrets**: add `SEND_SMS_HOOK_SECRET` (the hook secret, `v1,whsec_…`) and
      `SEMAPHORE_API_KEY`. Optional: `SEMAPHORE_SENDER_NAME` once Semaphore approves a sender name.
- [ ] Enable the hook, then sign in with a real PH number to confirm the code arrives.
- [ ] Authentication → Rate Limits: keep **SMS sent per hour** low (30–60) so nobody can drain the credit.

Only Philippine numbers (+63 9…) can receive codes; others get an error. Test numbers keep working without SMS.

## 2. Build

```
npm run build:android:production
```

This makes a signed `.aab` on EAS (EAS manages the upload key; the version code increases automatically). Do not
upload a locally built release: the local Gradle config signs it with the debug key.

## 3. Play Console: App content

**Privacy policy:** `https://admin.noticare.site/privacy`

**App access → All or some functionality is restricted:**

> Sign in with phone number +63 917 123 4567 and code 123456 (a test number; no SMS is sent). To see a scam warning,
> open the Manual Scan tab and paste: "Your GCash account is suspended. Verify now at http://gcash-verify.xyz"

**Data safety:**

| Question | Answer |
|---|---|
| Collects or shares user data? | Yes |
| Encrypted in transit? | Yes |
| Users can request deletion? | Yes, in the app and at https://admin.noticare.site/delete-account |
| Personal info → Phone number | Collected. Purpose: Account management. Required. |
| Messages → SMS or MMS | Collected **and shared** (other users see reported scam text). Purpose: App functionality, Fraud prevention and security. **Optional** (only when the user reports a message: Block & Report on a warning, or Report on a Manual Scan result). |
| App activity → Other actions (scan results) | Collected. Purpose: Analytics, App functionality. Required when signed in. |
| Device or other IDs | Collected (random installation ID). Purpose: App functionality. |
| Financial info → Purchase history | Collected (plan status only). Payments go through PayMongo. |
| App info and performance → Diagnostics | Collected by Google ML Kit when a photo is scanned in Manual Scan or messages are translated (device model, OS and app version, latency, input size; never the image or any message text). Purpose: Analytics. Confirm against Google's ML Kit data disclosure. |

Photos are not declared: Manual Scan reads the image on the device and deletes it, and nothing from it
is uploaded. The camera permission needs no Play Console form.

**Account deletion URL:** `https://admin.noticare.site/delete-account`

**Target audience:** 18 and over (keeps the app out of Families policy review).

## 4. Play Console: Permission declarations

**Full-screen intent (`USE_FULL_SCREEN_INTENT`)**

Google grants this by default only to calling and alarm apps. Declare it and explain:

> NotiCare shows a full-screen warning on the lock screen when an incoming SMS is a likely phishing scam, so the user
> sees it before they open the message and tap its link. It is only used for messages scored Dangerous.

If Google declines, the app still works: Android turns the warning into a heads-up banner, and the "Display over
other apps" warning still covers the screen while the phone is in use.

**Notification access, Display over other apps, default browser**

No form is needed, but the store description and screenshots must show the in-app explanation that appears before
each permission is requested (onboarding slide 2, and the Settings prompts).

## 5. Store listing

- **App name:** NotiCare
- **Short description** (80 characters max):
  "Blocks scam texts and warns you before you tap a phishing link."
- **App icon:** 512×512 PNG (`play-store-icon-512.png`, generated from the logo)
- **Feature graphic:** 1024×500 PNG (still needed)
- **Phone screenshots:** at least 2, for example the Dashboard, a warning with the score breakdown, Manual Scan, and
  the Safe Link warning.
- **Category:** Tools. **Contact email:** the same support address.

## 6. Testing requirement

Personal developer accounts created after 13 November 2023 must run a **closed test with at least 12 testers for 14
days in a row** before they can apply for production access. Start the closed test as soon as the first build is
uploaded.

## Known gaps (not policy blockers)

- Filipino-language scam phrases score lower than English ones.
- Some older queued reports keep being rejected by the server (unknown rule version) and retry forever.
