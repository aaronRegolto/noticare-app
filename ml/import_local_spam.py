"""Create a local-only, de-identified training source from a categorized SMS export.

Usage:
    py -3.12 ml/import_local_spam.py C:\\path\\to\\text-messages.csv

Only rows whose category is exactly "spam" are included. Sender and date fields are
discarded; phone numbers, email addresses, long numeric strings, and URL paths/queries
are masked. The output and generated source manifest live under ignored ml/output/.
"""
import argparse
import csv
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from data import ROOT

OUTPUT_DIR = ROOT / 'ml' / 'output'
LOCAL_CSV = OUTPUT_DIR / 'local_ph_spam.csv'
LOCAL_SOURCES = OUTPUT_DIR / 'local_sources.json'

EMAIL = re.compile(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', re.I)
URL = re.compile(r'https?://[^\s<>"\']+|www\.[^\s<>"\']+', re.I)
PHONE = re.compile(r'(?<!\w)(?:\+?63|0)?[\s().-]*\d(?:[\s().-]*\d){8,11}(?!\w)')
LONG_NUMBER = re.compile(r'(?<!\w)\d{4,}(?!\w)')
TRAILING_URL_PUNCTUATION = '.,!?;:)]}'


def sanitize_message(value: str) -> str:
    """Mask common personal identifiers while retaining URL hostnames as a signal."""
    text = EMAIL.sub('<email>', value)

    def keep_url_host(match: re.Match[str]) -> str:
        raw = match.group(0).rstrip(TRAILING_URL_PUNCTUATION)
        suffix = match.group(0)[len(raw):]
        candidate = raw if raw.lower().startswith(('http://', 'https://')) else f'https://{raw}'
        hostname = urlsplit(candidate).hostname
        if not hostname:
            return '<url>' + suffix
        normalized_host = hostname.lower().removeprefix('www.')
        return f'<url:{normalized_host}>' + suffix

    text = URL.sub(keep_url_host, text)
    text = PHONE.sub('<phone>', text)
    text = LONG_NUMBER.sub('<number>', text)
    return text.strip()


def import_dataset(path: Path) -> tuple[int, int]:
    if not path.is_file():
        raise FileNotFoundError(f'Input CSV not found: {path}')
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    csv.field_size_limit(10_000_000)
    kept = 0
    skipped_empty = 0
    with path.open(encoding='utf-8-sig', newline='') as source, LOCAL_CSV.open(
        'w', encoding='utf-8', newline=''
    ) as output:
        reader = csv.DictReader(source)
        required = {'category', 'text'}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f'Missing required column(s): {", ".join(sorted(missing))}')
        writer = csv.DictWriter(output, fieldnames=['text', 'label'])
        writer.writeheader()
        for row in reader:
            if (row.get('category') or '').strip().lower() != 'spam':
                continue
            message = sanitize_message(row.get('text') or '')
            if not message:
                skipped_empty += 1
                continue
            writer.writerow({'text': message, 'label': 'spam'})
            kept += 1

    config = json.loads((ROOT / 'ml' / 'sources.json').read_text(encoding='utf-8'))
    sources = [source for source in config['sources'] if source.get('enabled', True)]
    sources.append({
        'name': 'Local_PH_SMS_spam',
        'file': str(LOCAL_CSV),
        'text_column': 'text',
        'label_column': 'label',
        'enabled': True,
        'note': 'Locally filtered category=spam rows; sender/date fields omitted and common identifiers masked.',
    })
    LOCAL_SOURCES.write_text(json.dumps({'sources': sources}, indent=2) + '\n', encoding='utf-8')
    return kept, skipped_empty


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv_path', type=Path, help='Path to the attached categorized SMS CSV')
    args = parser.parse_args()
    kept, skipped = import_dataset(args.csv_path)
    print(f'Wrote {kept} labeled spam rows; skipped {skipped} empty spam rows.')
    print(f'Sanitized data: {LOCAL_CSV}')
    print(f'Training manifest: {LOCAL_SOURCES}')
    print(f'Next: py -3.12 ml/train.py --sources "{LOCAL_SOURCES}"')


if __name__ == '__main__':
    main()
