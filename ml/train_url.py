"""Trains a URL-only phishing classifier for NotiCare.

The model consumes on-device-computable URL structure features, never the URL text or page title.
Use: py -3.12 ml/train_url.py <PhiUSIIL CSV>
"""
import argparse
import csv
import hashlib
import json
import os
import tempfile
import warnings
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
warnings.filterwarnings("ignore", message=".*tf.lite.Interpreter is deprecated.*")

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FEATURE_SPEC = ROOT / "ml" / "url_features.json"


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dataset", help="Path to PhiUSIIL_Phishing_URL_Dataset.csv")
    parser.add_argument("--output", default=str(ROOT / "ml" / "output"))
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch-size", type=int, default=1024)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-false-alarm-rate", type=float, default=0.02)
    return parser.parse_args()


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_data(path, feature_names):
    rows = []
    labels = []
    seen_urls = set()
    duplicate_count = 0
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [name for name in ["URL", "label", *feature_names] if name not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"Dataset is missing columns: {missing}")
        for row in reader:
            url = row["URL"]
            if url in seen_urls:
                duplicate_count += 1
                continue
            seen_urls.add(url)
            try:
                values = [float(row[name]) for name in feature_names]
                label = int(row["label"])
            except (TypeError, ValueError):
                raise ValueError("Dataset contains a non-numeric feature or label")
            if label not in (0, 1) or not np.isfinite(values).all():
                raise ValueError("Dataset contains an invalid label or feature")
            rows.append(values)
            labels.append(1 - label)  # Model output means phishing risk.
    if not rows:
        raise ValueError("Dataset is empty")
    return np.asarray(rows, dtype=np.float32), np.asarray(labels, dtype=np.float32), duplicate_count


def split_by_domain(features, labels, domains):
    buckets = np.asarray([
        int(hashlib.sha256(domain.lower().encode("utf-8")).hexdigest()[:8], 16) % 100
        for domain in domains
    ])
    test = buckets >= 85
    validation = (buckets >= 70) & ~test
    train = ~validation & ~test
    return train, validation, test


def load_domains(path):
    domains = []
    seen = set()
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            url = row["URL"]
            if url not in seen:
                seen.add(url)
                domains.append(row["Domain"])
    return domains


def standardize(features, feature_names):
    spec = json.loads(FEATURE_SPEC.read_text(encoding="utf-8"))["features"]
    transforms = {item["name"]: item["transform"] for item in spec}
    indices = [index for index, name in enumerate(feature_names) if transforms[name] == "standardize"]
    if not indices:
        return features, np.zeros(features.shape[1], dtype=np.float32), np.ones(features.shape[1], dtype=np.float32)
    mean = features[:, indices].mean(axis=0)
    std = features[:, indices].std(axis=0)
    std[std < 1e-7] = 1
    scaled = features.copy()
    scaled[:, indices] = (scaled[:, indices] - mean) / std
    full_mean = np.zeros(features.shape[1], dtype=np.float32)
    full_std = np.ones(features.shape[1], dtype=np.float32)
    full_mean[indices] = mean
    full_std[indices] = std
    return scaled, full_mean, full_std


def metrics(labels, probabilities, threshold):
    scam = labels == 1
    legit = labels == 0
    return {
        "sample_count": int(labels.size),
        "accuracy": round(float(((probabilities >= 0.5) == scam).mean()), 4),
        "false_positive_rate": round(float((probabilities[legit] >= threshold).mean()), 4),
        "false_negative_rate": round(float((probabilities[scam] < threshold).mean()), 4),
        "predicted_phishing": int((probabilities >= threshold).sum()),
        "actual_phishing": int(scam.sum()),
        "actual_legitimate": int(legit.sum()),
    }


def roc_auc(labels, probabilities):
    _, inverse, counts = np.unique(probabilities, return_inverse=True, return_counts=True)
    ranks = (np.cumsum(counts) - (counts - 1) / 2)[inverse]
    positives = labels.sum()
    negatives = len(labels) - positives
    if positives == 0 or negatives == 0:
        return 0.0
    return float((ranks[labels == 1].sum() - positives * (positives + 1) / 2) / (positives * negatives))


def average_precision(labels, probabilities):
    order = np.argsort(-probabilities, kind="mergesort")
    ranked = labels[order]
    precision = np.cumsum(ranked) / np.arange(1, len(ranked) + 1)
    return float((precision * ranked).sum() / max(ranked.sum(), 1))


def threshold_for_false_alarm(labels, probabilities, target_rate):
    legitimate = np.sort(probabilities[labels == 0])[::-1]
    if len(legitimate) == 0:
        raise ValueError("Validation split has no legitimate URLs")
    allowed = int(np.floor(target_rate * len(legitimate)))
    if allowed >= len(legitimate):
        return 0.0
    import tensorflow as tf
    chosen = np.nextafter(legitimate[allowed], np.float32(1.0))
    return float(tf.constant(chosen).numpy())


def build_model(input_count, seed):
    import tensorflow as tf
    tf.keras.utils.set_random_seed(seed)
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(input_count,), dtype=tf.float32),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dropout(0.15),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(1, activation="sigmoid"),
    ])
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss=tf.keras.losses.BinaryCrossentropy(label_smoothing=0.01),
        metrics=[tf.keras.metrics.AUC(name="pr_auc", curve="PR")],
    )
    return model


def export_tflite(model, input_count):
    import tensorflow as tf
    with tempfile.TemporaryDirectory() as saved:
        model.export(saved, format="tf_saved_model", verbose=False,
                     input_signature=[tf.TensorSpec([1, input_count], tf.float32, name="url_features")])
        converter = tf.lite.TFLiteConverter.from_saved_model(saved)
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS]
        return converter.convert()


def main():
    args = parse_args()
    source = Path(args.dataset).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if not 0 <= args.max_false_alarm_rate < 1:
        raise ValueError("--max-false-alarm-rate must be in [0, 1)")

    spec = json.loads(FEATURE_SPEC.read_text(encoding="utf-8"))
    feature_names = [feature["name"] for feature in spec["features"]]
    features, labels, duplicates = load_data(source, feature_names)
    domains = load_domains(source)
    if len(domains) != len(features):
        raise ValueError("Unique URL/domain count changed while reading the dataset")
    train, validation, test = split_by_domain(features, labels, domains)

    import tensorflow as tf
    tf.keras.utils.set_random_seed(args.seed)
    scaled, mean, std = standardize(features[train], feature_names)
    features_scaled = (features - mean) / std

    model = build_model(len(feature_names), args.seed)
    callbacks = [
        tf.keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True, monitor="val_pr_auc", mode="max"),
    ]
    class_counts = np.bincount(labels[train].astype(np.int32), minlength=2)
    class_weight = {index: len(labels[train]) / (2 * count) for index, count in enumerate(class_counts)}
    history = model.fit(
        features_scaled[train], labels[train],
        validation_data=(features_scaled[validation], labels[validation]),
        epochs=args.epochs,
        batch_size=args.batch_size,
        verbose=2,
        shuffle=True,
        class_weight=class_weight,
        callbacks=callbacks,
    )

    validation_probability = model.predict(features_scaled[validation], batch_size=args.batch_size, verbose=0).reshape(-1)
    test_probability = model.predict(features_scaled[test], batch_size=args.batch_size, verbose=0).reshape(-1)
    threshold = threshold_for_false_alarm(labels[validation], validation_probability, args.max_false_alarm_rate)

    run_name = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    run_dir = Path(args.output).expanduser().resolve() / run_name
    run_dir.mkdir(parents=True, exist_ok=False)
    model_bytes = export_tflite(model, len(feature_names))

    metadata = {
        "model_provenance": {
            "candidate_status": "proposed_url_risk_candidate",
            "architecture": "URL feature dense neural network",
            "training_script": "ml/train_url.py",
            "dataset_name": spec["dataset"]["name"],
            "dataset_sha256": sha256(source),
            "dataset_rows": int(len(features)),
            "dataset_unique_urls": int(len(features)),
            "duplicate_urls_removed": int(duplicates),
            "label_meaning": "1 is phishing risk; source label 1 was converted from legitimate to 0.",
            "feature_spec": "ml/url_features.json",
        },
        "technical_specifications": {
            "input_shape": [len(feature_names)],
            "runtime_tensor_shape": [1, len(feature_names)],
            "input_dtype": "float32",
            "preprocessing": {"mean": mean.tolist(), "std": std.tolist(), "features": feature_names},
            "locked_threshold": threshold,
        },
        "training": {
            "runtime": f"TensorFlow {tf.__version__}",
            "parameters": int(model.count_params()),
            "epochs_run": int(len(history.history["loss"])),
            "batch_size": args.batch_size,
            "learning_rate": 0.001,
            "seed": args.seed,
            "class_weight": class_weight,
            "validation_max_false_alarm_rate": args.max_false_alarm_rate,
        },
        "split": {
            "method": "Domain hash, 70/15/15",
            "train": int(train.sum()),
            "validation": int(validation.sum()),
            "test": int(test.sum()),
        },
        "audit_performance_frozen_test": {
            **metrics(labels[test], test_probability, threshold),
            "pr_auc": round(average_precision(labels[test], test_probability), 4),
            "roc_auc": round(roc_auc(labels[test], test_probability), 4),
        },
        "known_limitations": [
            "Evaluated on a domain-isolated split of the supplied public dataset, not live user URLs.",
            "URL features alone cannot confirm whether a destination is malicious.",
            "Dataset rows are historical and must not be treated as ground truth for future URLs.",
        ],
    }

    (run_dir / "noticare_url_risk.tflite").write_bytes(model_bytes)
    (run_dir / "url_model_metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (run_dir / "history.json").write_text(json.dumps(history.history, indent=2) + "\n", encoding="utf-8")
    report = [
        "# NotiCare URL risk candidate",
        "",
        f"Source: `{source.name}`",
        f"Dataset SHA-256: `{metadata['model_provenance']['dataset_sha256']}`",
        f"Unique URLs: {len(features):,}; duplicate URLs removed: {duplicates:,}",
        f"Feature count: {len(feature_names)}; model parameters: {model.count_params():,}",
        f"Phishing threshold: {threshold:.10f}",
        f"Frozen test PR-AUC: {metadata['audit_performance_frozen_test']['pr_auc']:.4f}",
        f"Frozen test ROC-AUC: {metadata['audit_performance_frozen_test']['roc_auc']:.4f}",
        f"Frozen test false-positive rate: {metadata['audit_performance_frozen_test']['false_positive_rate']:.2%}",
        f"Frozen test false-negative rate: {metadata['audit_performance_frozen_test']['false_negative_rate']:.2%}",
        "",
        "Raw URLs and page titles were not written to model outputs.",
    ]
    (run_dir / "training_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Wrote {run_dir}")
    print(json.dumps(metadata["audit_performance_frozen_test"], indent=2))


if __name__ == "__main__":
    main()
