"""Loads, labels, cleans, and splits the messages listed in sources.json.

Labels: 1 = scam (spam, phishing, smishing), 0 = legitimate (ham, safe).

The split is decided by a hash of each message's "template" (lowercased, links and digits masked),
not by random shuffling. That keeps the same scam campaign with different links or amounts from
landing in both training and test, and it keeps the test set frozen: adding new data never moves an
existing message into or out of the test set, so old and new models can be compared fairly.
"""
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 256

LABELS = {
    'scam': 1, 'spam': 1, 'phishing': 1, 'smishing': 1, 'fraud': 1, '1': 1,
    'legit': 0, 'legitimate': 0, 'ham': 0, 'safe': 0, '0': 0,
}

# Percent of templates in each split: 0-69 train, 70-84 validation, 85-99 test.
VALIDATION_FROM = 70
TEST_FROM = 85

URL = re.compile(r'(?:https?://|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|ph|co|info|xyz|top|link|io|me|ly|cc|vip)\b\S*', re.I)
DIGITS = re.compile(r'\d+')
SPACES = re.compile(r'\s+')
# The admin dashboard prefixes "'" to cells starting with = + - @ so spreadsheets don't run them as formulas.
DASHBOARD_FORMULA_GUARD = re.compile(r"^'(?=[\s=+\-@])")


@dataclass(frozen=True)
class Example:
    text: str
    label: int
    source: str
    split: str


def _duplicate_key(text):
    """Two messages with the same key give the model the same input, so only one is kept."""
    normalized = SPACES.sub(' ', text).strip().lower()
    return normalized.encode('utf-8')[:MAX_BYTES]


def _template_key(text):
    return DIGITS.sub('0', URL.sub('<url>', SPACES.sub(' ', text).strip().lower()))


def _split_for(text):
    bucket = int(hashlib.sha256(_template_key(text).encode('utf-8')).hexdigest()[:8], 16) % 100
    return 'test' if bucket >= TEST_FROM else 'validation' if bucket >= VALIDATION_FROM else 'train'


def _read_source(source, skipped):
    path = ROOT / source['file']
    if not path.exists():
        raise FileNotFoundError(f"{source['name']}: {source['file']} not found. Disable it in sources.json or add the file.")
    fixed = source.get('fixed_label')
    if fixed is not None and fixed not in LABELS:
        raise ValueError(f"{source['name']}: unknown fixed_label {fixed!r}")

    csv.field_size_limit(10_000_000)
    rows = []
    with path.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        needed = [source['text_column']] + ([source['label_column']] if fixed is None else [])
        missing = [column for column in needed if column not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{source['name']}: missing column(s) {missing}; found {reader.fieldnames}")
        for row in reader:
            text = (row[source['text_column']] or '').strip()
            if source.get('from_dashboard_export'):
                text = DASHBOARD_FORMULA_GUARD.sub('', text)
            raw_label = fixed if fixed is not None else (row[source['label_column']] or '').strip().lower()
            if not text:
                skipped[f"{source['name']}: empty text"] += 1
            elif raw_label not in LABELS:
                skipped[f"{source['name']}: unknown label {raw_label!r}"] += 1
            else:
                rows.append((text, LABELS[raw_label]))

    # Duplicates inside one source are dropped before capping, so the cap counts distinct messages.
    unique = {}
    for text, label in rows:
        unique.setdefault(_duplicate_key(text), (text, label))
    skipped[f"{source['name']}: duplicate within source"] += len(rows) - len(unique)
    kept = list(unique.items())
    limit = source.get('max_rows')
    if limit is not None and len(kept) > limit:
        # Deterministic sample: the same file always gives the same rows, whatever order it is in.
        kept.sort(key=lambda item: hashlib.sha256(item[0]).hexdigest())
        skipped[f"{source['name']}: over max_rows"] += len(kept) - limit
        kept = kept[:limit]
    return kept


def load_examples(config_path):
    config = json.loads(Path(config_path).read_text(encoding='utf-8'))
    enabled = [source for source in config['sources'] if source.get('enabled', True)]
    if not enabled:
        raise ValueError('No sources are enabled in sources.json.')

    skipped = Counter()
    by_key = {}
    for source in enabled:
        for key, (text, label) in _read_source(source, skipped):
            by_key.setdefault(key, []).append((text, label, source['name']))

    examples = []
    for key, entries in by_key.items():
        if len({label for _, label, _ in entries}) > 1:
            # The same message labelled scam in one dataset and legitimate in another: trust neither.
            skipped['conflicting labels across sources'] += len(entries)
            continue
        text, label, source = entries[0]
        skipped['duplicate across sources'] += len(entries) - 1
        examples.append(Example(text, label, source, _split_for(text)))

    examples.sort(key=lambda example: hashlib.sha256(example.text.encode('utf-8')).hexdigest())
    return examples, {reason: count for reason, count in skipped.items() if count}


def summarize(examples):
    table = Counter((example.source, example.split, example.label) for example in examples)
    sources = sorted({example.source for example in examples})
    lines = [f"{'source':<24}{'split':<12}{'legitimate':>11}{'scam':>8}"]
    for source in sources:
        for split in ('train', 'validation', 'test'):
            legit, scam = table[(source, split, 0)], table[(source, split, 1)]
            if legit or scam:
                lines.append(f'{source:<24}{split:<12}{legit:>11}{scam:>8}')
    return '\n'.join(lines)


if __name__ == '__main__':
    # Preview the data without training: py -3.12 ml/data.py
    found, dropped = load_examples(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'ml' / 'sources.json')
    print(summarize(found))
    print(f'\nTotal messages: {len(found)}')
    for reason, count in sorted(dropped.items()):
        print(f'Skipped {count:>6}  {reason}')
