# Local interception classifier evaluation

Model inference: 2026-10-24T00:09:31.806451+00:00 · TensorFlow 2.21.0

**Diagnostic results, not held-out accuracy or a claim of production readiness.**

A warning means Suspicious or Dangerous. Phishing labelled Safe is a missed warning. Safe/ham labelled Suspicious or Dangerous is a false alarm.

| Source                   | Label    | Count | Model-only warnings | Rules warnings | Combined warnings |
| ------------------------ | -------- | ----: | ------------------: | -------------: | ----------------: |
| noticare_philippines.csv | phishing |    50 |          42 (84.0%) |     46 (92.0%) |       50 (100.0%) |
| noticare_philippines.csv | safe     |    50 |          32 (64.0%) |       0 (0.0%) |        32 (64.0%) |
| UCI_SMS_Spam.csv         | ham      |  4827 |           16 (0.3%) |      92 (1.9%) |        108 (2.2%) |
| UCI_SMS_Spam.csv         | spam     |   747 |         733 (98.1%) |      14 (1.9%) |       733 (98.1%) |

## Limits

- Training overlap unknown; not held-out accuracy.
- UCI spam labels do not establish phishing.
- Philippine examples are synthetic and marked unverified.
- Desktop CPU inference plus production Kotlin fusion; not an Android device capture test.
- NCSU CSV has no class labels and is excluded.

Thresholds and model weights were not tuned on this evaluation. Rule coverage was expanded after inspecting synthetic Philippine examples, so those detection rates are development diagnostics, not an unbiased estimate. The attached local Philippine messages were used for training and are not part of this report or an independent test. No source message bodies are included in this report.

## Reproduce

See `scripts/evaluate-model.py` and `docs/ML_VALIDATION.md`.

Kotlin rules SHA-256: `37416159af45663c4bc706821f641d4713fc9aa0d25363992b5e60f6c08f9ab1`

Model SHA-256: `921c0baed60662db5ec23f4c66e3ffcd8596dad8b290ad8af6f8e2979eda360a`

Detailed probabilities and prediction rows remain in the ignored `.detection-test-build/ml-evaluation/` directory.
