# Validate intercepted-message classification

Manual scans (`NotificationListenerModule.scanText`) and live notifications from selected apps (`SmsNotificationListener`) call the same production `V3RiskEvaluator.evaluate`. At runtime, the model can only reinforce a specific deterministic warning sign; it cannot create a warning or mark a message Dangerous by itself. The model-only threshold below is retained only as a historical validation diagnostic and is not used to classify users' messages.

## Retrain with the attached categorized SMS data

The attached `text-messages.csv` contains message categories. The importer uses only rows labeled exactly `spam`; it does not assume that unlabeled `SPAM_SMS.csv` rows are phishing. Sender/date fields are omitted, and common emails, phone numbers, long numbers, and URL paths/queries are masked. This is risk-reducing preprocessing, not a guarantee that every personal detail is removed. Keep the raw attachment local and review the sanitized output before sharing it.

Run these commands from the repository root with Python 3.12, NumPy, and TensorFlow installed:

```powershell
py -3.12 ml/import_local_spam.py "C:\path\to\text-messages.csv"
py -3.12 ml/data.py "ml\output\local_sources.json"
py -3.12 ml/train.py --sources "ml\output\local_sources.json"
```

Training proceeds in these steps:

1. **Filter and sanitize.** The importer keeps only labeled spam rows, removes sender/date columns, masks common identifiers and URL paths, and writes `ml\output\local_ph_spam.csv` plus a local-only manifest. The output directory is ignored by Git.
2. **Load and deduplicate.** The trainer combines that source with UCI SMS Spam and the existing NCSU phishing collection. Exact duplicates and conflicting labels are handled by `ml/data.py`; the NCSU source is capped. No unlabeled dataset is silently labeled.
3. **Split by message template.** The stable hash split groups variants of the same text/campaign together, preventing simple train/test leakage and keeping the frozen test partition stable when data is added.
4. **Train.** A byte-level CNN is fit with class weights and early stopping on validation PR-AUC. The raw message bodies are not written into the candidate report.
5. **Calibrate thresholds on validation only.** The spam threshold targets 99.5% validation scam recall; the dangerous threshold limits validation legitimate false alarms to 2%. The model-only Suspicious threshold was an offline evaluation metric, not a runtime threshold; neither metric is a guarantee on new messages.
6. **Export and check.** The candidate is exported to TensorFlow Lite and checked against the Keras model on the test split; the reported maximum output difference must remain below `1e-4`.
7. **Review before installation.** Inspect the new run's `training_report.md` and `model_metadata.json` under `ml\output\<run>\`. Only after review, retrain with `--install` to back up the current assets and install the candidate, or restore the previous files from the run's `previous` directory.

The October 2026 candidate contains 10,019 deduplicated examples: 5,159 UCI, 4,135 NCSU, and 725 from the labeled Philippine spam rows. Its frozen test split scored 99.36% accuracy and 0.9997 PR-AUC, with 5 missed scams and 9 false alarms at its ordinary decision threshold; the model-only threshold flagged 841/846 scams and 7/712 legitimate examples on that test split. All 116 Philippine-spam test examples were flagged, but they come from one supplied dataset and are not independent real-world validation. The older bundled model had 2 missed scams and 25 false alarms on the same frozen split; the candidate trades a small increase in misses for fewer false alarms. These results are not a claim of production accuracy or a substitute for a reviewed Philippine holdout set.

## Capture correctness

`NotificationInputTest` covers a new greeting following an old phishing message, a new phishing message following an old greeting, expanded text containing a threat beyond the short preview, missing content, ambiguous multi-message summaries, and changed content on an existing notification. The listener chooses the newest structured message by timestamp and uses its sender. Without structured messages it prefers expanded text over the short preview. It does not concatenate independent fields. Ambiguous summaries and missing text result in `content_unavailable`, not Safe.

The field distinctions follow the [Android Notification reference](https://developer.android.com/reference/android/app/Notification#EXTRA_MESSAGES): `EXTRA_MESSAGES` contains structured messages, `EXTRA_TEXT` is the main payload, and `EXTRA_TEXT_LINES` contains InboxStyle entries. These entries should not be concatenated into a single alleged SMS.

## Run the evaluation

Use Python 3.12 with NumPy and TensorFlow installed. The script runs the actual bundled `.tflite` asset with int32 UTF-8 bytes plus one, truncated/zero-padded to `[1, 256]`, and the thresholds from `model_metadata.json`. It checks tensor shapes and rejects invalid model probabilities. No SMS is sent to any service.

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

- The Philippine rule corpus contains synthetic examples and the attached dataset is spam-labeled; neither is a representative, independently reviewed phishing test set.
- UCI labels are **ham/spam**, not legitimate/phishing. Report ham false alarms and spam warning rates separately; do not call spam detection smishing accuracy.
- The supplied NCSU CSV has no classification column. Exclude it from accuracy denominators.
- The candidate training report uses template-separated frozen splits, but dataset provenance and repeated campaign variants can still limit independence. Do not treat these results as user-level or field accuracy.
- The historical broader diagnostic raised 32 of 50 synthetic Philippine messages labeled safe to Suspicious using the model-only path. This is a serious local false-alarm signal, even though those examples are synthetic and not a representative benchmark. The model-only path is disabled at runtime; do not describe its threshold as validated for Filipino users until a reviewed, independent Philippine legitimate-message holdout is collected and the threshold is recalibrated without using the final test set.
- Preserve both false-positive and false-negative counts. An all-Safe classifier avoids false alarms but is ineffective.
- Before claiming production accuracy, use independently reviewed, deduplicated, held-out Philippine English/Tagalog/Taglish messages, separated by campaign and time from training/tuning data. Measure warning precision/recall, false alarms, missed phishing, and long/hidden/truncated message behavior.

## Device verification still required

Install the updated Android build (`npm run android`), enable Notification Access and scanning, and select only apps available on the device. Send synthetic test messages from another device/account. Compare each captured preview with a manual scan of identical text. Test the default SMS app and Messenger if installed. Include a greeting, ordinary OTP notice, wallet receipt, OTP request with a suspicious link, English/Filipino profanity, direct physical/cyber threats, and repeated messages from the same sender. Confirm repeat-sender escalation occurs only in the default Messages/SMS app, and does not transfer to Messenger. Confirm that a hidden/ambiguous payload is unavailable rather than guessed. Do not use real credentials or threatening content against real people.

No phone or emulator was connected during the local corpus run, so those results do not establish device interception accuracy.
