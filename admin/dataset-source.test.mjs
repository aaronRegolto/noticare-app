import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSourceRows, PH_SMS_SOURCE } from './dataset-source.mjs';

test('validates and maps source CSV rows without changing labels or message content', () => {
  const rows = parseSourceRows('text,label\r\n"Hello, ""friend""",0\r\n"Line one\nline two",1\r\n');
  assert.deepEqual(
    rows.map(({ source, row_index, message_text, label }) => ({ source, row_index, message_text, label })),
    [
      { source: PH_SMS_SOURCE, row_index: 1, message_text: 'Hello, "friend"', label: '0' },
      { source: PH_SMS_SOURCE, row_index: 2, message_text: 'Line one\nline two', label: '1' },
    ],
  );
});

test('preserves blank and whitespace-only message rows from the source CSV', () => {
  const rows = parseSourceRows('text,label\n,0\n"   ",1');
  assert.deepEqual(
    rows.map(({ source, row_index, message_text, label }) => ({ source, row_index, message_text, label })),
    [
      { source: PH_SMS_SOURCE, row_index: 1, message_text: '', label: '0' },
      { source: PH_SMS_SOURCE, row_index: 2, message_text: '   ', label: '1' },
    ],
  );
});

test('keeps PostgreSQL-incompatible NUL characters losslessly encoded for browsing', () => {
  const [row] = parseSourceRows('text,label\n"before\u0000after",1');
  assert.equal(row.message_text, 'before\uFFFDafter');
  assert.equal(Buffer.from(row.message_base64, 'base64').toString('utf8'), 'before\u0000after');
});

test('rejects missing, unexpected, or unsafe CSV content instead of storing it', () => {
  for (const csv of [
    undefined,
    '',
    'message,label\nhello,0',
    'text,label,phone\nhello,0,123',
    'text,label\nhello,spam',
    'text,label\n"unfinished,0',
  ]) {
    assert.throws(() => parseSourceRows(csv), { status: 400 });
  }
  assert.throws(() => parseSourceRows(`text,label\n${'x'.repeat(20_001)},0`), { status: 400 });
});
