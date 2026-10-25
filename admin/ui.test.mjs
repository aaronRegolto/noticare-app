import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInContext } from 'node:vm';

function browser() {
  const dom = new JSDOM(readFileSync(new URL('./public/index.html', import.meta.url), 'utf8'), {
    url: 'http://localhost:4173',
    runScripts: 'outside-only',
  });
  dom.window.fetch = async () => ({ ok: true, json: async () => ({ configured: true }) });
  dom.window.AbortSignal.timeout = () => undefined;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new dom.window.Event('close'));
  };
  runInContext(readFileSync(new URL('./public/app.js', import.meta.url), 'utf8'), dom.getInternalVMContext());
  dom.window.requestAnimationFrame = (callback) => callback();
  dom.window.cancelAnimationFrame = () => {};
  runInContext(readFileSync(new URL('./public/dashboard.js', import.meta.url), 'utf8'), dom.getInternalVMContext());
  dom.window.eval(`
    $('#content').innerHTML = '<button id="export"></button><div id="records"></div>';
    rows = [{ score: 10, message: '<img src=x onerror=alert(1)>', nested: { label: 'dangerous' } }, { score: 2, message: 'Other message', nested: null }];
    renderRecordBrowser();
  `);
  return dom;
}

test('page search narrows export rows and empty searches can be cleared', () => {
  const dom = browser();
  try {
    const { document, Event } = dom.window;
    const search = document.querySelector('#page-search');
    search.value = 'dangerous';
    search.dispatchEvent(new Event('input'));
    assert.equal(dom.window.eval('rows.length'), 1);
    assert.equal(document.querySelectorAll('tbody tr').length, 1);
    search.value = 'no match';
    search.dispatchEvent(new Event('input'));
    assert.equal(document.querySelector('#export').disabled, true);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    assert.equal(dom.window.eval('rows.length'), 2);
    assert.equal(document.querySelector('#export').disabled, false);
  } finally {
    dom.window.close();
  }
});

test('column sorting is numeric, reversible, and retains keyboard focus', () => {
  const dom = browser();
  try {
    const { document } = dom.window;
    document.querySelector('[data-sort="0"]').click();
    assert.equal(dom.window.eval('rows[0].score'), 2);
    assert.equal(document.activeElement.dataset.sort, '0');
    assert.equal(document.activeElement.parentElement.getAttribute('aria-sort'), 'ascending');
    document.activeElement.click();
    assert.equal(dom.window.eval('rows[0].score'), 10);
    assert.equal(document.activeElement.parentElement.getAttribute('aria-sort'), 'descending');
  } finally {
    dom.window.close();
  }
});

test('record details display untrusted text safely and clear on sign out', () => {
  const dom = browser();
  try {
    const { document } = dom.window;
    const trigger = document.querySelector('[data-record="0"]');
    trigger.click();
    const dialog = document.querySelector('#record-dialog');
    assert.match(dialog.textContent, /<img src=x onerror=alert\(1\)>/);
    assert.equal(dialog.querySelector('img'), null);
    assert.match(dialog.querySelector('pre').textContent, /"label": "dangerous"/);
    dialog.querySelector('button').click();
    assert.equal(document.activeElement, trigger);
    trigger.click();
    dom.window.eval('signOut()');
    assert.equal(document.querySelector('#record-dialog'), null);
  } finally {
    dom.window.close();
  }
});

test('daily and hourly statistics share a collapsible navigation group', () => {
  const dom = browser();
  try {
    dom.window.eval("token = 'test-token'; renderNav();");
    const { document } = dom.window;
    const group = document.querySelector('[data-nav-group="statistics"]');
    assert.equal(group.textContent.includes('Statistics'), true);
    assert.equal(
      document.querySelectorAll('[data-section="community_daily_stats"], [data-section="community_hourly_stats"]')
        .length,
      2,
    );
    group.click();
    assert.equal(document.querySelector('.nav-group-items').hidden, true);
    assert.equal(document.querySelector('[data-nav-group="statistics"]').getAttribute('aria-expanded'), 'false');
  } finally {
    dom.window.close();
  }
});

test('dataset library opens opted-in phishing messages as untrusted text', async () => {
  const dom = browser();
  try {
    let requestedUrl = '';
    dom.window.fetch = async (url) => {
      requestedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          rows: [
            {
              id: 'report-1',
              message_text: 'Claim: https://phish.example/path <img src=x onerror=alert(1)>',
              indicator_codes: ['url-shortener'],
              rule_version: 'test',
              report_count: 2,
              viral_score: 24,
              first_reported_at: '2026-09-27T00:00:00Z',
              last_reported_at: '2026-09-27T00:00:00Z',
            },
          ],
          count: 1,
          page: 0,
        }),
      };
    };
    dom.window.eval("token = 'test-token'; section = 'datasets'; renderDatasetLibrary([]);");
    dom.window.document.querySelector('#open-reported-messages').click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    assert.match(requestedUrl, /^\/api\/reported-messages\?/);
    assert.match(dom.window.document.querySelector('#page-table').textContent, /https:\/\/phish\.example\/path/);
    assert.equal(dom.window.document.querySelector('#page-table img'), null);
    assert.equal(dom.window.document.querySelector('#page-table a'), null);
  } finally {
    dom.window.close();
  }
});

test('dataset library shows all local CSV rows and separates them from model provenance', () => {
  const dom = browser();
  try {
    dom.window.eval(
      `renderDatasetLibrary([${JSON.stringify({
        source: 'Local_PH_SMS_spam',
        provenance_count: 725,
        file: 'datasets-page-1.csv',
        row_count: 3080,
        status: 'Available to browse',
      })}]);`,
    );
    const { document } = dom.window;
    assert.doesNotMatch(document.querySelector('#content').textContent, /import dataset|import source csv/i);
    assert.equal(document.querySelector('#import-dialog'), null);
    assert.equal(document.querySelector('[data-import-index]'), null);
    const card = [...document.querySelectorAll('.dataset-card')].find((item) =>
      item.textContent.includes('Local PH SMS spam'),
    );
    assert.ok(card);
    assert.match(card.textContent, /3,080/);
    assert.match(card.textContent, /metadata separately lists 725 examples/i);
    assert.equal(card.querySelector('[data-dataset-file]').dataset.datasetFile, 'datasets-page-1.csv');
  } finally {
    dom.window.close();
  }
});

test('hosted dataset card distinguishes private browse rows from provenance and training', () => {
  const dom = browser();
  try {
    dom.window.eval(
      `renderDatasetLibrary([${JSON.stringify({
        source: 'Local_PH_SMS_spam',
        provenance_count: 725,
        file: null,
        row_count: 3080,
        remote_rows: true,
        remote_row_count: 3080,
      })}]);`,
    );
    const card = [...dom.window.document.querySelectorAll('.dataset-card')].find((item) =>
      item.textContent.includes('Local PH SMS spam'),
    );
    assert.match(card.textContent, /3,080/);
    assert.match(card.textContent, /admin-only Supabase storage/i);
    assert.match(card.textContent, /does not train or update the model/i);
    assert.equal(card.querySelector('[data-dataset-source]').dataset.datasetSource, 'Local_PH_SMS_spam');
    assert.equal(card.querySelector('[data-upload-source]'), null);
  } finally {
    dom.window.close();
  }
});

test('dataset library offers private browsing upload when source rows are not yet present', () => {
  const dom = browser();
  try {
    dom.window.eval(
      `renderDatasetLibrary([${JSON.stringify({
        source: 'Local_PH_SMS_spam',
        provenance_count: 725,
        file: null,
        row_count: 0,
        remote_rows: false,
        remote_row_count: 0,
      })}]);`,
    );
    const card = [...dom.window.document.querySelectorAll('.dataset-card')].find((item) =>
      item.textContent.includes('Local PH SMS spam'),
    );
    assert.equal(card.querySelector('[data-upload-source]').dataset.uploadSource, 'Local_PH_SMS_spam');
    assert.match(card.textContent, /private admin storage for browsing only/i);
  } finally {
    dom.window.close();
  }
});

test('dashboard presents separate Manual Scan and real-time scan totals', async () => {
  const dom = browser();
  try {
    const stats = {
      scans: 51,
      safe: 32,
      suspicious: 9,
      dangerous: 10,
      blocked: 6,
      manual: { scans: 19, safe: 12, suspicious: 4, dangerous: 3, blocked: 0 },
      realtime: { scans: 32, safe: 20, suspicious: 5, dangerous: 7, blocked: 6 },
    };
    const trend = {
      range: '30d',
      granularity: 'day',
      buckets: Array.from({ length: 30 }, (_, index) => ({
        start: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
        safe: 1,
        suspicious: 0,
        dangerous: 0,
        blocked: 0,
      })),
      previous: { safe: 0, suspicious: 0, dangerous: 0, blocked: 0 },
    };
    dom.window.eval(`var dashboardRequests = [];
      api = async (path) => {
      dashboardRequests.push(String(path));
      if (path === '/api/overview') return ${JSON.stringify(stats)};
      if (path.startsWith('/api/trend')) return ${JSON.stringify(trend)};
      return { rows: [], count: 0, page: 0, pageSize: 20 };
    };`);
    await dom.window.eval('Dashboard.render(() => true)');

    const section = dom.window.document.querySelector('#source-overviews');
    assert.ok(section);
    assert.match(section.textContent, /Manual Scan/);
    assert.match(section.textContent, /Real-time scan/);
    const cards = section.querySelectorAll('.source-overview-card');
    assert.equal(cards.length, 2);
    assert.match(cards[0].textContent, /19/);
    assert.match(cards[0].textContent, /12/);
    assert.match(cards[1].textContent, /32/);
    assert.match(cards[1].textContent, /6/);
    cards[1].querySelector('[data-source-records]').click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    assert.equal(dom.window.eval("dashboardRequests.some((path) => path.includes('source=realtime'))"), true);
  } finally {
    dom.window.close();
  }
});

test('app updates page shows releases as text and publishes the form as one request', async () => {
  const dom = browser();
  try {
    const requests = [];
    const release = {
      id: '3f1c2a9e-5b7d-4c1e-9a2f-0b6d8e4c7a1b',
      version_code: 5,
      version_name: '1.0.1',
      title: 'Fixes <img src=x onerror=alert(1)>',
      changes: ['Faster scans', '<script>alert(1)</script>'],
      apk_url: 'https://example.com/noticare.apk',
      required: true,
      published: true,
      published_at: '2026-10-05T10:00:00Z',
    };
    dom.window.fetch = async (url, options = {}) => {
      requests.push({ url: String(url), method: options.method ?? 'GET', body: options.body });
      const published = { ...release, version_code: 6, version_name: '1.1.0' };
      return { ok: true, json: async () => (options.method === 'POST' ? published : [release]) };
    };
    dom.window.eval("token = 'test-token'; section = 'releases'; renderReleases(" + JSON.stringify([release]) + ');');
    const { document } = dom.window;
    assert.equal(document.querySelector('.release-card img'), null);
    assert.equal(document.querySelector('.release-card script'), null);
    assert.match(document.querySelector('.release-card').textContent, /Fixes <img/);
    assert.match(document.querySelector('.release-card').textContent, /Required/);

    const fields = document.querySelector('#release-form').elements;
    fields.version_code.value = '6';
    fields.version_name.value = '1.1.0';
    fields.title.value = 'Better detection of GCash scams';
    fields.changes.value = 'Detects fake GCash links\nFaster camera scan';
    fields.apk_url.value = 'https://example.com/noticare-1.1.0.apk';
    document.querySelector('#release-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    const post = requests.find((request) => request.method === 'POST');
    assert.equal(post.url, '/api/releases');
    assert.deepEqual(JSON.parse(post.body), {
      version_code: '6',
      version_name: '1.1.0',
      title: 'Better detection of GCash scams',
      changes: 'Detects fake GCash links\nFaster camera scan',
      apk_url: 'https://example.com/noticare-1.1.0.apk',
      required: false,
    });
  } finally {
    dom.window.close();
  }
});
