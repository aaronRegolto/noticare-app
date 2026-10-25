import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSourceRows, PH_SMS_SOURCE } from './dataset-source.mjs';

test('validates and maps source CSV rows without changing labels or message content', () => {
  const rows = parseSourceRows('text,label\r\n"Hello, ""friend""",0\r\n"Line one\nline two",1\r\n');
  assert.deepEqual(rows, [
    { source: PH_SMS_SOURCE, row_index: 1, message_text: 'Hello, "friend"', label: '0' },
    { source: PH_SMS_SOURCE, row_index: 2, message_text: 'Line one\nline two', label: '1' },
  ]);
});

test('rejects missing, unexpected, or unsafe CSV content instead of storing it', () => {
  for (const csv of [
    undefined,
    '',
    'message,label\nhello,0',
    'text,label,phone\nhello,0,123',
    'text,label\n,0',
    'text,label\nhello,spam',
    'text,label\n"unfinished,0',
  ]) {
    assert.throws(() => parseSourceRows(csv), { status: 400 });
  }
  assert.throws(() => parseSourceRows(`text,label\n${'x'.repeat(20_001)},0`), { status: 400 });
});
