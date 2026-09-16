"""Local diagnostic evaluation; never treats source data as a held-out test set.

py -3.12 scripts/evaluate-model.py
# Run the Kotlin evaluation test with NOTICARE_EVAL_DIR set to the output directory.
py -3.12 scripts/evaluate-model.py --report
"""
import argparse
import base64
import csv
import hashlib
import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '.detection-test-build' / 'ml-evaluation'
SOURCES = ['noticare_philippines.csv', 'UCI_SMS_Spam.csv']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def predict():
    os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
    print('Loading local TensorFlow Lite interpreter...', flush=True)
    import numpy as np
    import tensorflow as tf

    OUTPUT.mkdir(parents=True, exist_ok=True)
    model = ROOT / 'assets/models/noticare_smishing_v3.tflite'
    metadata = ROOT / 'assets/models/model_metadata.json'
    specs = json.loads(metadata.read_text())['technical_specifications']
    threshold = specs['locked_thresholds']['safe']
    interpreter = tf.lite.Interpreter(model_path=str(model), num_threads=1)
    interpreter.allocate_tensors()
    input_info = interpreter.get_input_details()[0]
    output_info = interpreter.get_output_details()[0]
    if list(input_info['shape']) != [1, 256] or input_info['dtype'] != np.int32:
        raise ValueError('Model input differs from Android int32 [1, 256] encoder')
    if list(output_info['shape']) != [1, 1]:
        raise ValueError('Expected a single model probability')
    provenance = {'created_at': datetime.now(timezone.utc).isoformat(), 'model_sha256': digest(model),
                  'metadata_sha256': digest(metadata), 'runtime': f'TensorFlow {tf.__version__}',
                  'warning_threshold': threshold, 'sources': {},
                  'limitations': ['Training overlap unknown; not held-out accuracy.',
                                  'UCI spam labels do not establish phishing.',
                                  'Philippine examples are synthetic and marked unverified.',
                                  'Desktop CPU inference plus production Kotlin fusion; not an Android device capture test.',
                                  'NCSU CSV has no class labels and is excluded.']}
    total = 0
    with (OUTPUT / 'inputs.tsv').open('w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle, delimiter='\t', lineterminator='\n')
        writer.writerow(['threshold', threshold])
        for name in SOURCES:
            path = ROOT / 'datasets' / name
            counts, unique = Counter(), set()
            with path.open(encoding='utf-8-sig', newline='') as source:
                for index, row in enumerate(csv.DictReader(source), 1):
                    text, label = row['text'], row['label']
                    if not text.strip() or label not in {'safe', 'phishing', 'ham', 'spam'}:
                        raise ValueError(f'Unexpected input at {name}:{index}')
                    encoded = np.zeros((1, 256), dtype=np.int32)
                    values = np.frombuffer(text.encode('utf-8')[:256], dtype=np.uint8).astype(np.int32) + 1
                    encoded[0, :len(values)] = values
                    interpreter.set_tensor(input_info['index'], encoded)
                    interpreter.invoke()
                    probability = float(interpreter.get_tensor(output_info['index'])[0][0])
                    if not np.isfinite(probability) or not 0 <= probability <= 1:
                        raise ValueError(f'Invalid model output at {name}:{index}')
                    writer.writerow([name, index, label, probability, base64.b64encode(text.encode()).decode()])
                    counts[label] += 1
                    unique.add(hashlib.sha256(text.strip().lower().encode()).hexdigest())
                    total += 1
                    if total % 500 == 0:
                        print(f'Evaluated {total} messages', flush=True)
            provenance['sources'][name] = {'sha256': digest(path), 'labels': dict(counts), 'unique_texts': len(unique)}
    (OUTPUT / 'provenance.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
    print(f'Prepared {total} real-model predictions in {OUTPUT}', flush=True)


def report():
    provenance = json.loads((OUTPUT / 'provenance.json').read_text())
    with (OUTPUT / 'predictions.tsv').open(encoding='utf-8', newline='') as handle:
        rows = list(csv.DictReader(handle, delimiter='\t'))
    expected = sum(sum(source['labels'].values()) for source in provenance['sources'].values())
    if len(rows) != expected:
        raise ValueError('Kotlin prediction count does not match the input corpus')
    threshold = provenance['warning_threshold']
    summary = {'provenance': provenance, 'diagnostics': {}}
    lines = ['# Local interception classifier evaluation', '',
             f"Model inference: {provenance['created_at']} · {provenance['runtime']}", '',
             '**Diagnostic results, not held-out accuracy or a claim of production readiness.**', '',
             'A warning means Suspicious or Dangerous. Phishing labelled Safe is a missed warning. '
             'Safe/ham labelled Suspicious or Dangerous is a false alarm.', '',
             '| Source | Label | Count | Model-only warnings | Rules warnings | Combined warnings |',
             '| --- | --- | ---: | ---: | ---: | ---: |']
    for source in SOURCES:
        for label in provenance['sources'][source]['labels']:
            group = [row for row in rows if row['source'] == source and row['label'] == label]
            counts = {'count': len(group), 'model_warnings': sum(float(row['probability']) >= threshold for row in group),
                      'rule_warnings': sum(row['rules'] != 'safe' for row in group),
                      'combined_warnings': sum(row['combined'] != 'safe' for row in group)}
            summary['diagnostics'][f'{source}:{label}'] = counts
            def cell(value):
                return f'{value} ({value / len(group):.1%})'
            lines.append(f"| {source} | {label} | {len(group)} | {cell(counts['model_warnings'])} | {cell(counts['rule_warnings'])} | {cell(counts['combined_warnings'])} |")
    lines += ['', '## Limits', ''] + [f'- {item}' for item in provenance['limitations']]
    lines += ['', 'Thresholds and model weights were not tuned on this evaluation. Credential rule coverage was expanded after inspecting missed examples; these corpora are development diagnostics, not independent validation. No source message bodies are included in this report.', '',
              '## Reproduce', '', 'See `scripts/evaluate-model.py` and `docs/ML_VALIDATION.md`.', '',
              f"Kotlin rules SHA-256: `{digest(ROOT / 'plugins/android/SmishingEvaluator.kt')}`", '',
              f"Model SHA-256: `{provenance['model_sha256']}`", '',
              'Detailed probabilities and prediction rows remain in the ignored `.detection-test-build/ml-evaluation/` directory.']
    (OUTPUT / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    (ROOT / 'docs/ML_EVALUATION.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(summary['diagnostics'], indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', action='store_true')
    args = parser.parse_args()
    report() if args.report else predict()
