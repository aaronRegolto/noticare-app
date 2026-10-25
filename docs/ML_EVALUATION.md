# Local interception classifier evaluation

Model inference: 2026-10-25T11:24:44.410271+00:00 · TensorFlow 2.21.0

**Diagnostic results, not held-out accuracy or a claim of production readiness.**

A warning means Suspicious or Dangerous. Phishing labelled Safe is a missed warning. Safe/ham labelled Suspicious or Dangerous is a false alarm.

| Source | Label | Count | Model-only warnings | Rules warnings | Combined warnings |
| --- | --- | ---: | ---: | ---: | ---: |
| noticare_philippines.csv | phishing | 50 | 42 (84.0%) | 50 (100.0%) | 50 (100.0%) |
| noticare_philippines.csv | safe | 50 | 32 (64.0%) | 0 (0.0%) | 0 (0.0%) |
| UCI_SMS_Spam.csv | ham | 4827 | 16 (0.3%) | 156 (3.2%) | 156 (3.2%) |
| UCI_SMS_Spam.csv | spam | 747 | 733 (98.1%) | 362 (48.5%) | 362 (48.5%) |

## Limits

- Training overlap unknown; not held-out accuracy.
- UCI spam labels do not establish phishing.
- Philippine examples are synthetic and marked unverified.
- Desktop CPU inference plus production Kotlin fusion; not an Android device capture test.
- NCSU CSV has no class labels and is excluded.

Thresholds and model weights were not tuned on this evaluation. Rule coverage was expanded after inspecting synthetic Philippine examples, so those detection rates are development diagnostics, not an unbiased estimate. The attached local Philippine messages were used for training and are not part of this report or an independent test. No source message bodies are included in this report.

## Reproduce

See `scripts/evaluate-model.py` and `docs/ML_VALIDATION.md`.

Kotlin rules SHA-256: `972c9434a3fba970b59570ea2473ba25ed9c1274c28d91c7f744e7c4f01bc606`

Model SHA-256: `921c0baed60662db5ec23f4c66e3ffcd8596dad8b290ad8af6f8e2979eda360a`

Detailed probabilities and prediction rows remain in the ignored `.detection-test-build/ml-evaluation/` directory.
