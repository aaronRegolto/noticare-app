# Local interception classifier evaluation

Model inference: 2026-09-16T11:48:37.535199+00:00 · TensorFlow 2.21.0

**Diagnostic results, not held-out accuracy or a claim of production readiness.**

A warning means Suspicious or Dangerous. Phishing labelled Safe is a missed warning. Safe/ham labelled Suspicious or Dangerous is a false alarm.

| Source | Label | Count | Model-only warnings | Rules warnings | Combined warnings |
| --- | --- | ---: | ---: | ---: | ---: |
| noticare_philippines.csv | phishing | 50 | 44 (88.0%) | 16 (32.0%) | 24 (48.0%) |
| noticare_philippines.csv | safe | 50 | 33 (66.0%) | 0 (0.0%) | 0 (0.0%) |
| UCI_SMS_Spam.csv | ham | 4827 | 748 (15.5%) | 14 (0.3%) | 15 (0.3%) |
| UCI_SMS_Spam.csv | spam | 747 | 743 (99.5%) | 17 (2.3%) | 38 (5.1%) |

## Limits

- Training overlap unknown; not held-out accuracy.
- UCI spam labels do not establish phishing.
- Philippine examples are synthetic and marked unverified.
- Desktop CPU inference plus production Kotlin fusion; not an Android device capture test.
- NCSU CSV has no class labels and is excluded.

Thresholds and model weights were not tuned on this evaluation. Credential rule coverage was expanded after inspecting missed examples; these corpora are development diagnostics, not independent validation. No source message bodies are included in this report.

## Reproduce

See `scripts/evaluate-model.py` and `docs/ML_VALIDATION.md`.

Kotlin rules SHA-256: `417489c4558c97f039b86bd4e912a7f7a4d44b2fbfbd9e115a4560f02ae86ef5`

Model SHA-256: `db5d16d97eed9a2f6b07e6bd778b1222aeb74da9c28f429ba6be7379979896fb`

Detailed probabilities and prediction rows remain in the ignored `.detection-test-build/ml-evaluation/` directory.
