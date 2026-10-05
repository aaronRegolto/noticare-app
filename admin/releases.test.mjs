import assert from 'node:assert/strict';
import { test } from 'node:test';

import { publishRelease, validateRelease, withdrawRelease } from './releases.mjs';

const form = {
  version_code: '6',
  version_name: ' 1.1.0 ',
  title: ' Better scam detection ',
  changes: '- Detects fake GCash links\n\n• Faster camera scan\r\n',
  apk_url: 'https://example.com/noticare.apk',
  required: false,
};

test('turns the form into publish arguments, one change per line', () => {
  assert.deepEqual(validateRelease(form), {
    p_version_code: 6,
    p_version_name: '1.1.0',
    p_title: 'Better scam detection',
    p_changes: ['Detects fake GCash links', 'Faster camera scan'],
    p_apk_url: 'https://example.com/noticare.apk',
    p_required: false,
  });
});

test('rejects missing details and unsafe links with a plain explanation', () => {
  for (const change of [
    { version_code: '1.5' },
    { version_code: '0' },
    { version_name: '' },
    { title: '' },
    { title: 'x'.repeat(81) },
    { changes: '\n \n' },
    { changes: 'x'.repeat(201) },
    { apk_url: 'http://example.com/noticare.apk' },
    { apk_url: 'javascript:alert(1)' },
    { apk_url: 'https://example.com/a b.apk' },
  ]) {
    assert.throws(
      () => validateRelease({ ...form, ...change }),
      (error) => error.status === 400,
      JSON.stringify(change),
    );
  }
});

test('explains database refusals without leaking internals', async () => {
  const db = (error) => ({ rpc: async () => ({ data: null, error }) });
  await assert.rejects(publishRelease(db({ code: '23505', message: 'duplicate key' }), form), (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /already used/);
    return true;
  });
  await assert.rejects(
    publishRelease(
      db({ code: '22023', message: 'Version code must be higher than the latest published release (6)' }),
      form,
    ),
    /must be higher/,
  );
  await assert.rejects(publishRelease(db({ code: 'XX000', message: 'internal detail' }), form), (error) => {
    assert.equal(error.status, 502);
    assert.doesNotMatch(error.message, /internal detail/);
    return true;
  });
});

test('withdraw only accepts a release id', async () => {
  const calls = [];
  const db = { rpc: async (name, args) => (calls.push([name, args]), { error: null }) };
  await assert.rejects(withdrawRelease(db, { id: "1' or 1=1" }), /Unknown release/);
  const id = '3f1c2a9e-5b7d-4c1e-9a2f-0b6d8e4c7a1b';
  assert.deepEqual(await withdrawRelease(db, { id }), { id, published: false });
  assert.deepEqual(calls, [['withdraw_app_release', { p_id: id }]]);
});
