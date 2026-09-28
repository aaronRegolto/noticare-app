# Local interception classifier evaluation

Model inference: 2026-09-28T16:38:26.353544+00:00 · TensorFlow 2.21.0

**Diagnostic results, not held-out accuracy or a claim of production readiness.**

A warning means Suspicious or Dangerous. Phishing labelled Safe is a missed warning. Safe/ham labelled Suspicious or Dangerous is a false alarm.

| Source | Label | Count | Model-only warnings | Rules warnings | Combined warnings |
| --- | --- | ---: | ---: | ---: | ---: |
| noticare_philippines.csv | phishing | 50 | 44 (88.0%) | 46 (92.0%) | 50 (100.0%) |
| noticare_philippines.csv | safe | 50 | 33 (66.0%) | 0 (0.0%) | 0 (0.0%) |
| UCI_SMS_Spam.csv | ham | 4827 | 748 (15.5%) | 3 (0.1%) | 4 (0.1%) |
| UCI_SMS_Spam.csv | spam | 747 | 743 (99.5%) | 11 (1.5%) | 40 (5.4%) |

## Limits

- Training overlap unknown; not held-out accuracy.
- UCI spam labels do not establish phishing.
- Philippine examples are synthetic and marked unverified.
- Desktop CPU inference plus production Kotlin fusion; not an Android device capture test.
- NCSU CSV has no class labels and is excluded.

Thresholds and model weights were not tuned on this evaluation. Rule coverage was expanded after inspecting missed examples: rule set 2026.09.29 was written using the 50 Philippine phishing rows above, so their detection rate is not an unbiased estimate. As a separate check at that time, 12 newly written scam variants were all flagged and 20 newly written lookalike legitimate messages all stayed Safe; a subset of both is kept as the Philippine regression tests in src/features/detection/__tests__/evaluator.test.ts. These corpora are development diagnostics, not independent validation. No source message bodies are included in this report.

## Reproduce

See `scripts/evaluate-model.py` and `docs/ML_VALIDATION.md`.

Kotlin rules SHA-256: `89b34375c864f27810a434fc32ea671820d47584f2a29bea69426568bbdbb407`

Model SHA-256: `db5d16d97eed9a2f6b07e6bd778b1222aeb74da9c28f429ba6be7379979896fb`

Detailed probabilities and prediction rows remain in the ignored `.detection-test-build/ml-evaluation/` directory.
