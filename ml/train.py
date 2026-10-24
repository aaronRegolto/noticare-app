"""Trains the NotiCare Smishing byte-level CNN text classifier and exports it for the app.

    py -3.12 ml/train.py                 train, test, and export to ml/output/<run>/
    py -3.12 ml/train.py --install       ...and copy the new model into assets/models/

Steps: load and split the data (data.py) -> train with early stopping -> choose the safe/dangerous
thresholds on the validation split -> export the phone model (.tflite) -> check it gives the same
answers as the trained model -> score it, and the currently bundled model, on the frozen test split
-> write model_metadata.json and training_report.md. Message text is never written to any output.
"""
import argparse
import json
import os
import shutil
import tempfile
import warnings
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
# tf.lite.Interpreter warns it is moving to the ai_edge_litert package; it still works and needs no extra install.
warnings.filterwarnings('ignore', message='.*tf.lite.Interpreter is deprecated.*')

import numpy as np

from data import ROOT, load_examples, summarize
from model import MAX_LENGTH, build_model, encode_all

MODEL_FILE = 'noticare_smishing_v3.tflite'  # The app loads this exact asset name.
METADATA_FILE = 'model_metadata.json'
KERAS_FILE = 'noticare_smishing_v3.keras'
ASSETS = ROOT / 'assets' / 'models'


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--sources', default=str(ROOT / 'ml' / 'sources.json'))
    parser.add_argument('--output', default=str(ROOT / 'ml' / 'output'))
    parser.add_argument('--version', default='3.2.0', help='Version recorded in model_metadata.json')
    parser.add_argument('--epochs', type=int, default=30, help='Maximum epochs; training stops early when validation stops improving')
    parser.add_argument('--batch-size', type=int, default=64)
    parser.add_argument('--learning-rate', type=float, default=1e-3)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--target-recall', type=float, default=0.995,
                        help='Share of validation scams that must score at or above the safe threshold')
    parser.add_argument('--max-false-alarm-rate', type=float, default=0.02,
                        help='Largest share of validation legitimate messages allowed at or above the dangerous threshold')
    parser.add_argument('--model-only-max-false-alarm-rate', type=float, default=0.005,
                        help='Largest share of validation legitimate messages allowed at the model-only Suspicious threshold')
    parser.add_argument('--install', action='store_true', help='Copy the new model into assets/models/ (old files are backed up)')
    return parser.parse_args()


# ---- metrics (plain NumPy so no extra packages are needed) ----

def average_precision(labels, probabilities):
    order = np.argsort(-probabilities, kind='mergesort')
    ranked = labels[order]
    precision = np.cumsum(ranked) / np.arange(1, len(ranked) + 1)
    return float((precision * ranked).sum() / max(ranked.sum(), 1))


def roc_auc(labels, probabilities):
    _, inverse, counts = np.unique(probabilities, return_inverse=True, return_counts=True)
    ranks = (np.cumsum(counts) - (counts - 1) / 2)[inverse]
    scams, legit = labels.sum(), len(labels) - labels.sum()
    return float((ranks[labels == 1].sum() - scams * (scams + 1) / 2) / (scams * legit))


def choose_thresholds(labels, probabilities, target_recall, max_false_alarm_rate):
    """safe: at least target_recall of scams score >= it. dangerous: at most the allowed share of legit messages do."""
    scams = np.sort(probabilities[labels == 1])
    legit = np.sort(probabilities[labels == 0])[::-1]
    safe = float(scams[min(int(np.floor((1 - target_recall) * len(scams))), len(scams) - 1)])
    allowed = int(np.floor(max_false_alarm_rate * len(legit)))
    dangerous = float(np.nextafter(np.float32(legit[allowed]), np.float32(1))) if allowed < len(legit) else safe
    # The app ignores thresholds outside (0, 1).
    safe = min(max(safe, 1e-6), 1 - 1e-6)
    return safe, min(max(dangerous, safe), 1 - 1e-6)


def choose_model_only_threshold(labels, probabilities, max_false_alarm_rate):
    """Choose a high-specificity threshold for an advisory Suspicious-only model signal."""
    if not 0 <= max_false_alarm_rate < 1:
        raise ValueError('model-only false-alarm rate must be in [0, 1)')
    legitimate = np.sort(probabilities[labels == 0])[::-1]
    if len(legitimate) == 0:
        raise ValueError('validation split must contain legitimate messages')
    allowed = int(np.floor(max_false_alarm_rate * len(legitimate)))
    if allowed >= len(legitimate):
        return float(np.nextafter(np.float32(1), np.float32(0)))
    return float(np.nextafter(np.float32(legitimate[allowed]), np.float32(np.inf)))


def score(labels, probabilities, safe, dangerous):
    scam, legit = labels == 1, labels == 0
    missed = int((scam & (probabilities < safe)).sum())
    false_alarms = int((legit & (probabilities >= dangerous)).sum())
    uncertain = int(((probabilities >= safe) & (probabilities < dangerous)).sum())
    return {
        'sample_count': int(len(labels)),
        'accuracy': round(float(((probabilities >= 0.5) == scam).mean()), 4),
        'pr_auc': round(average_precision(labels, probabilities), 4),
        'roc_auc': round(roc_auc(labels, probabilities), 4),
        'safety_errors': {
            'false_negatives': missed,
            'false_positives': false_alarms,
            'rate': f'{(missed + false_alarms) / len(labels):.2%}',
        },
        'uncertainty_count': uncertain,
        # What the app actually uses: only the safe threshold, and only alongside rule evidence.
        'at_app_threshold': {
            'scams_flagged': int((scam & (probabilities >= safe)).sum()),
            'scams_total': int(scam.sum()),
            'legitimate_flagged': int((legit & (probabilities >= safe)).sum()),
            'legitimate_total': int(legit.sum()),
        },
    }


# ---- phone model ----

def export_tflite(model):
    import tensorflow as tf

    # Through a SavedModel so the weights are baked in. Converting a tf.function over a Keras 3
    # model directly leaves them as unset variables, and the phone model then outputs NaN.
    with tempfile.TemporaryDirectory() as saved:
        model.export(saved, format='tf_saved_model', verbose=False,
                     input_signature=[tf.TensorSpec([1, MAX_LENGTH], tf.int32, name='bytes')])
        converter = tf.lite.TFLiteConverter.from_saved_model(saved)
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS]  # LiteRT built-in ops only
        return converter.convert()


def tflite_predict(model_content, encoded):
    """Runs a .tflite model one message at a time, exactly like the app does."""
    import tensorflow as tf

    interpreter = tf.lite.Interpreter(model_content=model_content, num_threads=1)
    interpreter.allocate_tensors()
    source, target = interpreter.get_input_details()[0], interpreter.get_output_details()[0]
    if list(source['shape']) != [1, MAX_LENGTH] or source['dtype'] != np.int32 or list(target['shape']) != [1, 1]:
        raise ValueError(f"Model must take int32 [1, {MAX_LENGTH}] and return [1, 1]; got {source['shape']} -> {target['shape']}")
    results = np.empty(len(encoded), dtype=np.float32)
    for index, row in enumerate(encoded):
        interpreter.set_tensor(source['index'], row[np.newaxis])
        interpreter.invoke()
        results[index] = interpreter.get_tensor(target['index'])[0][0]
    if not np.all(np.isfinite(results)) or results.min() < 0 or results.max() > 1:
        raise ValueError('Model returned probabilities outside 0..1')
    return results


def current_model_score(labels, encoded):
    model, metadata = ASSETS / MODEL_FILE, ASSETS / METADATA_FILE
    if not model.exists() or not metadata.exists():
        return None
    info = json.loads(metadata.read_text(encoding='utf-8'))
    thresholds = info['technical_specifications']['locked_thresholds']
    probabilities = tflite_predict(model.read_bytes(), encoded)
    result = score(labels, probabilities, thresholds['safe'], thresholds.get('dangerous', thresholds['safe']))
    result['version'] = info.get('model_provenance', {}).get('version', 'unknown')
    return result


# ---- report ----

def write_report(path, metadata, current, history_epochs):
    new = metadata['audit_performance_frozen_test']
    rows = [('Accuracy (cut-off 0.5)', 'accuracy'), ('PR-AUC', 'pr_auc'), ('ROC-AUC', 'roc_auc'),
            ('Missed scams (below safe)', ('safety_errors', 'false_negatives')),
            ('False alarms (above dangerous)', ('safety_errors', 'false_positives')),
            ('Uncertain (between thresholds)', 'uncertainty_count')]

    def get(result, key):
        return result[key[0]][key[1]] if isinstance(key, tuple) else result[key]

    lines = [
        f"# Training report: NotiCare Smishing {metadata['model_provenance']['version']}", '',
        f"Exported {metadata['exported_at']} · {metadata['training']['runtime']} · {history_epochs} epochs run "
        f"(best: {metadata['training']['best_epoch']})", '',
        '## Data', '', '| Source | Messages |', '| --- | ---: |',
        *[f'| {name} | {count:,} |' for name, count in metadata['model_provenance']['dataset_provenance_counts'].items()],
        '', '| Split | Messages | Scam | Legitimate |', '| --- | ---: | ---: | ---: |',
        *[f"| {split} | {counts['total']:,} | {counts['scam']:,} | {counts['legitimate']:,} |"
          for split, counts in metadata['final_training_set']['splits'].items()],
        '', '## Frozen test split', '',
        '| Metric | New model |' + (f" Current model ({current['version']}) |" if current else ''),
        '| --- | ---: |' + (' ---: |' if current else ''),
        *[f'| {label} | {get(new, key)} |' + (f' {get(current, key)} |' if current else '') for label, key in rows],
        '',
        f"At the high-specificity model-only threshold the model flags "
        f"{new['at_model_only_threshold']['scams_flagged']} of {new['at_model_only_threshold']['scams_total']} "
        f"scams and {new['at_model_only_threshold']['legitimate_flagged']} of "
        f"{new['at_model_only_threshold']['legitimate_total']} legitimate messages. A model-only hit can raise a "
        "message to Suspicious, never Dangerous; rule evidence still controls Dangerous results.", '',
    ]
    if current:
        lines += ['The current model may have been trained on some of these test messages (its training split is '
                  'unknown), so its numbers can look better than they really are.', '']
    lines += ['## Thresholds', '',
              f"- safe = {metadata['technical_specifications']['locked_thresholds']['safe']:.10f}",
              f"- dangerous = {metadata['technical_specifications']['locked_thresholds']['dangerous']:.10f}",
              f"- model_only = {metadata['technical_specifications']['locked_thresholds']['model_only']:.10f}",
              f"- Rule: {metadata['technical_specifications']['threshold_rule']}", '',
              '## Known limitations', '', *[f'- {item}' for item in metadata['known_limitations']], '']
    path.write_text('\n'.join(lines), encoding='utf-8')


def main():
    args = parse_args()
    import tensorflow as tf

    print('Loading data...', flush=True)
    examples, skipped = load_examples(args.sources)
    print(summarize(examples))
    for reason, count in sorted(skipped.items()):
        print(f'  skipped {count:>6}  {reason}')

    splits = {name: [example for example in examples if example.split == name] for name in ('train', 'validation', 'test')}
    for name, items in splits.items():
        labels = {example.label for example in items}
        if labels != {0, 1}:
            raise SystemExit(f'The {name} split needs both scam and legitimate messages; add more data.')
    data = {name: (encode_all([e.text for e in items]), np.array([e.label for e in items], dtype=np.int32))
            for name, items in splits.items()}

    tf.keras.utils.set_random_seed(args.seed)
    tf.config.experimental.enable_op_determinism()
    model = build_model()
    model.compile(optimizer=tf.keras.optimizers.Adam(args.learning_rate), loss='binary_crossentropy',
                  metrics=[tf.keras.metrics.AUC(curve='PR', name='pr_auc')])
    print(f'\nModel: {model.count_params():,} parameters', flush=True)

    train_x, train_y = data['train']
    scam_count = int(train_y.sum())
    # Balance the classes so the larger one doesn't dominate what the model learns.
    class_weight = {0: len(train_y) / (2 * (len(train_y) - scam_count)), 1: len(train_y) / (2 * scam_count)}
    history = model.fit(
        train_x, train_y, validation_data=data['validation'], epochs=args.epochs, batch_size=args.batch_size,
        class_weight=class_weight, verbose=2,
        callbacks=[tf.keras.callbacks.EarlyStopping(monitor='val_pr_auc', mode='max', patience=4, restore_best_weights=True)],
    )
    best_epoch = int(np.argmax(history.history['val_pr_auc'])) + 1

    print('\nChoosing thresholds on the validation split...', flush=True)
    validation_x, validation_y = data['validation']
    validation_p = model.predict(validation_x, batch_size=256, verbose=0).ravel()
    safe, dangerous = choose_thresholds(validation_y, validation_p, args.target_recall, args.max_false_alarm_rate)
    model_only = choose_model_only_threshold(
        validation_y, validation_p, args.model_only_max_false_alarm_rate,
    )

    print('Exporting the phone model and checking it matches...', flush=True)
    tflite_model = export_tflite(model)
    test_x, test_y = data['test']
    keras_p = model.predict(test_x, batch_size=256, verbose=0).ravel()
    test_p = tflite_predict(tflite_model, test_x)
    difference = float(np.abs(keras_p - test_p).max())
    if difference > 1e-4:
        raise SystemExit(f'Exported model disagrees with the trained model by {difference}; not saving it.')

    print('Scoring on the frozen test split...', flush=True)
    result = score(test_y, test_p, safe, dangerous)
    result['at_model_only_threshold'] = {
        'scams_flagged': int(((test_y == 1) & (test_p >= model_only)).sum()),
        'scams_total': int((test_y == 1).sum()),
        'legitimate_flagged': int(((test_y == 0) & (test_p >= model_only)).sum()),
        'legitimate_total': int((test_y == 0).sum()),
        'validation_max_false_alarm_rate': args.model_only_max_false_alarm_rate,
    }
    result['by_source'] = {}
    for source in sorted({example.source for example in splits['test']}):
        mask = np.array([example.source == source for example in splits['test']])
        labels, probabilities = test_y[mask], test_p[mask]
        result['by_source'][source] = {
            'scams_flagged': f'{int((probabilities[labels == 1] >= safe).sum())}/{int(labels.sum())}',
            'legitimate_flagged': f'{int((probabilities[labels == 0] >= safe).sum())}/{int((labels == 0).sum())}',
        }
    current = current_model_score(test_y, test_x)

    counts = Counter(example.source for example in examples)
    enabled_sources = set(counts)
    limitations = [
        'Accuracy is measured on a test split of the same datasets, not on messages from NotiCare users.',
        'SAFE label represents lower estimated risk, not guaranteed safety.',
        'The model-only high-specificity threshold may raise a message to Suspicious but never Dangerous; rule evidence still controls Dangerous results.',
    ]
    if enabled_sources <= {'UCI_SMS_Spam', 'NCSU_SMS_Phishing'}:
        limitations.insert(0, 'Training data is mostly English (UCI, NCSU); it has no reviewed Tagalog or Taglish messages.')

    metadata = {
        'model_provenance': {
            'candidate_status': 'retrained_candidate',
            'version': args.version,
            'architecture': 'Byte-level CNN text classifier',
            'keras_file': KERAS_FILE,
            'training_script': 'ml/train.py',
            'dataset_provenance_counts': dict(sorted(counts.items())),
        },
        'final_training_set': {
            'total_rows': len(examples),
            'splits': {name: {'total': len(items), 'scam': sum(e.label for e in items),
                              'legitimate': sum(1 - e.label for e in items)} for name, items in splits.items()},
            'skipped': skipped,
            'note': 'Duplicates removed; splits are assigned by message template so one campaign never spans train and test.',
        },
        'technical_specifications': {
            'input_shape': [MAX_LENGTH],
            'runtime_tensor_shape': [1, MAX_LENGTH],
            'input_dtype': 'int32',
            'preprocessing': {
                'encoding': 'UTF-8',
                'max_length': MAX_LENGTH,
                'byte_offset': 'add 1 to each byte value',
                'padding': 'zero-pad to max_length',
                'truncation': f'truncate beyond {MAX_LENGTH} bytes',
            },
            'locked_thresholds': {'safe': safe, 'dangerous': dangerous, 'model_only': model_only},
            'threshold_rule': (f'safe keeps {args.target_recall:.1%} of validation scams at or above it; dangerous lets at most '
                               f'{args.max_false_alarm_rate:.1%} of validation legitimate messages reach it; model-only '
                               f'keeps at most {args.model_only_max_false_alarm_rate:.1%} of validation legitimate messages above threshold'),
        },
        'audit_performance_frozen_test': result,
        'training': {
            'runtime': f'TensorFlow {tf.__version__}',
            'parameters': int(model.count_params()),
            'epochs_run': len(history.history['loss']),
            'best_epoch': best_epoch,
            'batch_size': args.batch_size,
            'learning_rate': args.learning_rate,
            'seed': args.seed,
            'class_weight': {str(key): round(value, 4) for key, value in class_weight.items()},
            'tflite_max_difference': difference,
        },
        'known_limitations': limitations,
        'exported_at': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S'),
    }

    run = Path(args.output) / datetime.now().strftime('%Y%m%d-%H%M%S')
    run.mkdir(parents=True)
    (run / MODEL_FILE).write_bytes(tflite_model)
    model.save(run / KERAS_FILE)
    (run / METADATA_FILE).write_text(json.dumps(metadata, indent=4) + '\n', encoding='utf-8')
    (run / 'history.json').write_text(json.dumps(history.history, indent=2) + '\n', encoding='utf-8')
    write_report(run / 'training_report.md', metadata, current, len(history.history['loss']))

    print(f'\nSaved to {run}')
    print(f"Test accuracy {result['accuracy']:.2%} | PR-AUC {result['pr_auc']} | "
          f"missed scams {result['safety_errors']['false_negatives']} | false alarms {result['safety_errors']['false_positives']}")
    if current:
        print(f"Current model on the same test split: accuracy {current['accuracy']:.2%} | PR-AUC {current['pr_auc']} | "
              f"missed scams {current['safety_errors']['false_negatives']} | false alarms {current['safety_errors']['false_positives']}")
    print(f"Read {run / 'training_report.md'} before using this model.")

    if args.install:
        backup = run / 'previous'
        backup.mkdir()
        for name in (MODEL_FILE, METADATA_FILE):
            if (ASSETS / name).exists():
                shutil.copy2(ASSETS / name, backup / name)
            shutil.copy2(run / name, ASSETS / name)
        print(f'Installed into {ASSETS} (old files backed up to {backup}). Rebuild the app to ship it.')
    else:
        print('Not installed. Re-run with --install, or copy the .tflite and model_metadata.json into assets/models/.')


if __name__ == '__main__':
    main()
