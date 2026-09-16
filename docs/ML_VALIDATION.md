# Validate intercepted-message classification

Manual scans (`NotificationListenerModule.scanText`) and live SMS notifications (`SmsNotificationListener`) call the same production `V3RiskEvaluator.evaluate`. The system uses rules plus a corroborated model signal, rather than treating the model output as proof of smishing.

## Capture correctness

`NotificationInputTest` covers a new greeting following an old phishing message, a new phishing message following an old greeting, expanded text containing a threat beyond the short preview, missing content, ambiguous multi-message summaries, and changed content on an existing notification. The listener chooses the newest structured message by timestamp and uses its sender. Without structured messages it prefers expanded text over the short preview. It does not concatenate independent fields. Ambiguous summaries and missing text result in `content_unavailable`, not Safe.

The field distinctions follow the [Android Notification reference](https://developer.android.com/reference/android/app/Notification#EXTRA_MESSAGES): `EXTRA_MESSAGES` contains structured messages, `EXTRA_TEXT` is the main payload, and `EXTRA_TEXT_LINES` contains InboxStyle entries. These entries should not be concatenated into a single alleged SMS.

## Run the evaluation

Use Python 3.12 with NumPy and TensorFlow installed. The script runs the actual bundled `.tflite` asset with int32 UTF-8 bytes plus one, truncated/zero-padded to `[1, 256]`, and the unchanged threshold from `model_metadata.json`. It checks tensor shapes and rejects invalid model probabilities. No SMS is sent to any service.

From the repository root:

```powershell
py -3.12 scripts/evaluate-model.py
npx expo prebuild --platform android --no-install
$env:NOTICARE_EVAL_DIR = Join-Path (Get-Location) '.detection-test-build/ml-evaluation'
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21.0.12'
$env:NODE_ENV = 'development'
Push-Location android
.\gradlew.bat :app:cleanTestDebugUnitTest :app:testDebugUnitTest --offline --console=plain
Pop-Location
py -3.12 scripts/evaluate-model.py --report
```

Adapt the JDK path to your installation. `cleanTestDebugUnitTest` ensures changed corpus inputs are evaluated even if the Kotlin test source did not change. Without `NOTICARE_EVAL_DIR`, the optional corpus diagnostic is skipped; ordinary regression tests still run.

The Python script writes actual model probabilities to an ignored local directory. `ModelEvaluationTest` applies production Kotlin rules and `V3RiskEvaluator.combine` to those same messages and probabilities. The final script creates `docs/ML_EVALUATION.md` with counts, model/data hashes, runtime version, and limitations. It never includes raw source message bodies in the checked-in report. This is desktop CPU inference plus production Kotlin decision logic; Android runtime/inference parity still requires device testing.

## Interpret the evidence honestly

- The Philippine file has 50 safe and 50 phishing examples, all supplied synthetic seeds marked unverified. This is diagnostic coverage, not a representative test set.
- UCI labels are **ham/spam**, not legitimate/phishing. Report ham false alarms and spam warning rates separately; do not call spam detection smishing accuracy.
- The supplied NCSU CSV has no classification column. Exclude it from accuracy denominators.
- Training/split overlap cannot be established from the supplied source files. Do not use these results to claim held-out accuracy or retune thresholds until the result looks good.
- Preserve both false-positive and false-negative counts. An all-Safe classifier avoids false alarms but is ineffective.
- Before claiming production accuracy, use independently reviewed, deduplicated, held-out Philippine English/Tagalog/Taglish messages, separated by campaign and time from training/tuning data. Measure warning precision/recall, false alarms, missed phishing, and long/hidden/truncated message behavior.

## Device verification still required

Install the updated Android build (`npm run android`), enable Notification Access and scanning, and send synthetic test SMS from a second device. Compare each captured message with a manual scan of the identical text. Include a greeting, an ordinary OTP notice, a legitimate wallet receipt, an OTP request with a suspicious link, and two rapid messages in the same conversation. Confirm that the newest body/sender is used, risk results match, and a hidden/ambiguous payload is reported unavailable. Do not use real credentials in test messages.

No phone or emulator was connected during the local corpus run, so those results do not establish device interception accuracy.
