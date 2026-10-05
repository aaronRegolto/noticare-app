import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { server, signInError } from './server.mjs';

test('distinguishes account, confirmation, rate-limit, and service failures without exposing raw errors', () => {
  assert.match(signInError({ code: 'invalid_credentials' }).message, /Authentication → Users/);
  assert.match(signInError({ code: 'email_not_confirmed' }).message, /Confirm/);
  assert.equal(signInError({ status: 429 }).status, 429);
  assert.equal(signInError({ name: 'AuthRetryableFetchError' }).status, 503);
  assert.equal(signInError({ status: 500 }).status, 503);
  assert.doesNotMatch(signInError({ message: 'private provider details' }).message, /private provider details/);
});

let base;
before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test('serves dashboard with restrictive security headers', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /NotiCare · Admin/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
test('serves the tab icons with image content types', async () => {
  for (const [path, type] of [
    ['/favicon.ico', 'image/x-icon'],
    ['/favicon.png', 'image/png'],
    ['/apple-touch-icon.png', 'image/png'],
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), type);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
});
test('serves the public privacy and account-deletion pages without sign-in', async () => {
  for (const [path, heading] of [
    ['/privacy', /Privacy Policy/],
    ['/delete-account', /Delete your NotiCare account/],
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), 'text/html');
    assert.match(await response.text(), heading);
  }
  const css = await fetch(`${base}/legal.css`);
  assert.equal(css.headers.get('content-type'), 'text/css');
});
test('never serves repository files or secrets', async () => {
  for (const path of [
    '/.env',
    '/server.mjs',
    '/package.json',
    '/assets/models/noticare_smishing_v3.tflite',
    '/%2e%2e/.env',
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
  }
});
test('rejects anonymous access to every live data endpoint', async () => {
  for (const path of [
    '/api/overview',
    '/api/trend?range=7d',
    '/api/connection',
    '/api/records?table=threat_events',
    '/api/records?table=admin_users',
    '/api/datasets',
    '/api/dataset-rows?file=UCI_SMS_Spam.csv',
    '/api/reported-messages',
    '/api/phishing-links',
    '/api/records?table=threat_events&discoveries=true',
    '/api/stream/discoveries',
    '/api/releases',
  ]) {
    const response = await fetch(base + path);
    assert.ok([401, 503].includes(response.status));
    assert.ok((await response.json()).error);
  }
});
test('rejects cross-origin login attempts before contacting auth provider', async () => {
  const response = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 403);
});
test('dataset imports require authentication and reject cross-origin requests', async () => {
  const anonymous = await fetch(base + '/api/datasets/import', { method: 'POST', body: '{}' });
  assert.ok([401, 503].includes(anonymous.status));
  const crossOrigin = await fetch(base + '/api/datasets/import', {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example' },
    body: '{}',
  });
  assert.equal(crossOrigin.status, 403);
});
test('publishing or withdrawing a release requires an admin and the dashboard origin', async () => {
  for (const path of ['/api/releases', '/api/releases/withdraw']) {
    const anonymous = await fetch(base + path, { method: 'POST', body: '{}' });
    assert.ok([401, 503].includes(anonymous.status), path);
    const crossOrigin = await fetch(base + path, {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example', Authorization: 'Bearer forged' },
      body: '{}',
    });
    assert.equal(crossOrigin.status, 403, path);
  }
});
test('configuration endpoint exposes no credentials', async () => {
  const response = await fetch(base + '/api/config');
  const data = await response.json();
  assert.deepEqual(Object.keys(data), ['configured']);
  assert.equal(typeof data.configured, 'boolean');
});
test('model documentation reads the existing metadata without fabricated samples', async () => {
  const response = await fetch(base + '/api/model');
  const model = await response.json();
  assert.equal(response.status, 200);
  assert.equal(
    model.final_training_set.total_rows,
    model.final_training_set.base_rows + model.final_training_set.synthetic_rows,
  );
  assert.equal(model.model_provenance.version, '3.0.0-augmented');
});
