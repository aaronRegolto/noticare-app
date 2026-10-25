import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { datasetCatalog, datasetRows, parseCsv } from './datasets.mjs';

test('new CSV files appear in the catalog and support pagination and search', async () => {
  const filename = `admin-test-${randomUUID()}.csv`;
  const fixture = new URL(`../datasets/${filename}`, import.meta.url);
  await writeFile(
    fixture,
    'message,label\n' + Array.from({ length: 53 }, (_, i) => `Sample ${i},${i === 51 ? 'phishing' : 'ham'}`).join('\n'),
    { flag: 'wx' },
  );
  try {
    const catalog = await datasetCatalog();
    const added = catalog.find((item) => item.file === filename);
    assert.equal(added.status, 'Available to browse');
    assert.equal(added.provenance_count, null);
    const first = await datasetRows(new URLSearchParams({ file: filename }));
    assert.equal(first.total, 53);
    // 53 rows at 20 per page: 20 + 20 + 13, and row 21 starts page 2.
    assert.equal(first.rows.length, 20);
    assert.equal(first.pageSize, 20);
    const second = await datasetRows(new URLSearchParams({ file: filename, page: '1' }));
    assert.equal(second.rows.length, 20);
    assert.equal(second.rows[0].message, 'Sample 20');
    const third = await datasetRows(new URLSearchParams({ file: filename, page: '2' }));
    assert.equal(third.rows.length, 13);
    const filtered = await datasetRows(new URLSearchParams({ file: filename, q: 'PHISHING' }));
    assert.equal(filtered.count, 1);
    assert.equal(filtered.rows[0].message, 'Sample 51');
    await assert.rejects(datasetRows(new URLSearchParams({ file: filename, page: '-1' })), { status: 400 });
  } finally {
    await unlink(fixture);
  }
});

test('CSV preserves multiline messages, commas, escaped quotes and labels', () => {
  assert.deepEqual(parseCsv('\uFEFFmessage,label\r\n"Hello, ""friend""\nsecond line",phishing\r\nNormal,ham\r\n'), [
    { message: 'Hello, "friend"\nsecond line', label: 'phishing' },
    { message: 'Normal', label: 'ham' },
  ]);
});
test('CSV preserves control characters in message fields', () => {
  assert.deepEqual(parseCsv('message,label\n"Hello\u0003friend",phishing'), [
    { message: 'Hello\u0003friend', label: 'phishing' },
  ]);
});
test('malformed rows and ambiguous headers fail rather than mislabelling samples', () => {
  for (const csv of [
    '',
    'text,text\na,b',
    'text,\na,b',
    'text,label\na',
    'text,label\n"unfinished,b',
    'text,label\n"a"oops,b',
  ]) {
    assert.throws(() => parseCsv(csv), { status: 400 });
  }
});
test('header-only datasets are empty and untrusted column names remain plain data', () => {
  assert.deepEqual(parseCsv('message,label\n'), []);
  const rows = parseCsv('__proto__,label\nexample,unknown');
  assert.equal(Object.hasOwn(rows[0], '__proto__'), true);
  assert.equal(rows[0].__proto__, 'example');
});
test('dataset browse rejects traversal and non-CSV files', async () => {
  for (const file of ['../.env', '../assets/models/model_metadata.json', 'missing.csv']) {
    await assert.rejects(datasetRows(new URLSearchParams({ file })), { status: 400 });
  }
});
test('catalog retains known model sources even before CSV files are provided', async () => {
  const catalog = await datasetCatalog();
  assert.equal(catalog.find((item) => item.source === 'UCI_SMS_Spam').provenance_count, 5159);
  assert.equal(catalog.find((item) => item.source === 'NCSU_SMS_Phishing').provenance_count, 4135);
});
test('catalog connects the local Philippine spam source to its CSV for browsing', async () => {
  const source = (await datasetCatalog()).find((item) => item.source === 'Local_PH_SMS_spam');
  assert.equal(source.provenance_count, 725);
  assert.equal(source.file, 'datasets-page-1.csv');
  assert.equal(source.row_count, 3080);
  assert.equal(source.status, 'Available to browse');
  const rows = await datasetRows(new URLSearchParams({ file: source.file }));
  assert.equal(rows.total, 3080);
  assert.equal(rows.rows.length, 20);
});
