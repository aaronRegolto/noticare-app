const $ = (selector) => document.querySelector(selector);
const sections = {
  overview: 'Dashboard',
  threat_events: 'Scan records',
  discoveries: 'Phishing detections',
  community_daily_stats: 'Daily statistics',
  community_hourly_stats: 'Hourly statistics',
  profiles: 'Profiles',
  rule_sets: 'Rule sets',
  model: 'Machine Learning',
  datasets: 'Dataset library',
  releases: 'App updates',
  connection: 'Connection status',
};
const navGroups = {
  statistics: {
    label: 'Statistics',
    sections: ['community_daily_stats', 'community_hourly_stats'],
  },
};
let token = null,
  expiryTimer,
  refreshTimer,
  discoveryStream,
  expandedNavGroups = new Set(['statistics']),
  section = 'overview',
  page = 0,
  rows = [],
  generation = 0;
const escape = (value) =>
  String(value ?? '—').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const label = (value) => value.replaceAll('_', ' ');
const number = (value) => Number(value).toLocaleString();
let appearanceUser = 'guest';
const systemThemeQuery =
  typeof matchMedia === 'function'
    ? matchMedia('(prefers-color-scheme: dark)')
    : { matches: false, addEventListener() {} };
// Matches the stylesheet breakpoint where the sidebar becomes a slide-in drawer.
const compactNavQuery =
  typeof matchMedia === 'function' ? matchMedia('(max-width: 1024px)') : { matches: false, addEventListener() {} };
function setNavOpen(open) {
  const isOpen = open && compactNavQuery.matches;
  document.body.classList.toggle('nav-open', isOpen);
  $('#nav-backdrop').hidden = !isOpen;
  $('#menu-toggle').setAttribute('aria-expanded', String(isOpen));
  $('#menu-toggle').setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
}
compactNavQuery.addEventListener('change', () => setNavOpen(false));
function resolveTheme(preference) {
  return preference === 'system' ? (systemThemeQuery.matches ? 'dark' : 'light') : preference;
}
function applyAppearance(preferences = {}) {
  const theme = ['light', 'dark', 'system'].includes(preferences.theme) ? preferences.theme : 'system';
  document.documentElement.dataset.theme = resolveTheme(theme);
  $('#appearance').value = theme;
}
systemThemeQuery.addEventListener('change', () => {
  if ($('#appearance').value === 'system') document.documentElement.dataset.theme = resolveTheme('system');
});
function restoreAppearance(user = 'guest') {
  appearanceUser = user;
  try {
    applyAppearance(JSON.parse(localStorage.getItem(`noticare.admin.appearance.${user}`)) || {});
  } catch {
    applyAppearance();
  }
}
function saveAppearance() {
  const preferences = { theme: $('#appearance').value };
  applyAppearance(preferences);
  try {
    localStorage.setItem(`noticare.admin.appearance.${appearanceUser}`, JSON.stringify(preferences));
  } catch {
    notice('Appearance changed for this visit. Browser storage is unavailable.');
  }
}
function setRefreshStatus(message = '') {
  $('#refresh-status').textContent = message;
}
function refreshCurrentView() {
  if (!token) return;
  setRefreshStatus('Refreshing…');
  const request = $('#filters')
    ? loadRecords()
    : section === 'overview' && Dashboard.isActive()
      ? Dashboard.refresh()
      : navigate(section);
  request.finally(() => {
    if (token) setRefreshStatus(`Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  });
}
/**
 * Pushes new Suspicious/Dangerous detections into view the instant the mobile app reports them,
 * instead of waiting for a manual refresh or the 30-second "Live refresh" poll. Only active while
 * the Phishing detections view itself is open; every other view still relies on refresh/polling.
 */
function connectDiscoveryStream() {
  disconnectDiscoveryStream();
  if (!token) return;
  discoveryStream = new EventSource(`/api/stream/discoveries?token=${encodeURIComponent(token)}`);
  discoveryStream.addEventListener('discovery', () => {
    if (section !== 'discoveries') return;
    if (page === 0) {
      loadRecords();
      setRefreshStatus('New detection received');
    } else {
      setRefreshStatus('New detection received — return to page 1 to view it');
    }
  });
  // EventSource retries automatically per the server's `retry:` hint; a dropped connection here
  // just means live pushes pause until it reconnects, not that anything is broken or unsafe.
  discoveryStream.onerror = () => setRefreshStatus('Live updates reconnecting…');
}
function disconnectDiscoveryStream() {
  discoveryStream?.close();
  discoveryStream = undefined;
}
function updateAutoRefresh(enabled) {
  clearInterval(refreshTimer);
  refreshTimer = undefined;
  if (enabled && token) refreshTimer = setInterval(refreshCurrentView, 30_000);
  $('#auto-refresh').ariaLabel = enabled ? 'Disable live refresh' : 'Enable live refresh';
}
function notice(message = '') {
  $('#notice').textContent = message;
  $('#notice').hidden = !message;
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    // Generous enough to survive a free-tier host's cold start plus a first-time CSV parse
    // (now cached server-side after that) without every other, much faster call feeling different.
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok) {
    if (token && [401, 403].includes(response.status)) signOut();
    throw new Error(data.error || 'Request failed');
  }
  return data;
}
function signOut() {
  closeRecord();
  restoreAppearance();
  token = null;
  clearTimeout(expiryTimer);
  updateAutoRefresh(false);
  disconnectDiscoveryStream();
  setRefreshStatus();
  generation++;
  rows = [];
  $('#content').replaceChildren();
  $('#workspace').hidden = true;
  $('#login').hidden = false;
  $('#logout').hidden = true;
  document.body.dataset.session = 'signed-out';
  setNavOpen(false);
  renderNav();
}
function renderNav() {
  if (!token) {
    $('#nav').replaceChildren();
    return;
  }
  const renderItem = ([id, title]) =>
    `<button data-section="${id}" class="${id === section ? 'active' : ''}" ${id === section ? 'aria-current="page"' : ''}>${escape(title)}</button>`;
  const rendered = [];
  const groupedSections = new Set(Object.values(navGroups).flatMap((group) => group.sections));
  for (const [id, title] of Object.entries(sections)) {
    if (groupedSections.has(id)) continue;
    rendered.push(renderItem([id, title]));
  }
  for (const [groupId, group] of Object.entries(navGroups)) {
    const groupSections = group.sections.map((id) => [id, sections[id]]);
    const expanded = expandedNavGroups.has(groupId);
    rendered.push(
      `<div class="nav-group"><button class="nav-group-toggle" data-nav-group="${groupId}" aria-expanded="${expanded}">${escape(group.label)}<span aria-hidden="true">${expanded ? '−' : '+'}</span></button><div class="nav-group-items" ${expanded ? '' : 'hidden'}>${groupSections.map(renderItem).join('')}</div></div>`,
    );
  }
  $('#nav').innerHTML = rendered.join('');
}
function cell(value) {
  if (['safe', 'suspicious', 'dangerous'].includes(value))
    return `<span class="badge ${value}">${escape(value)}</span>`;
  return escape(
    typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : typeof value === 'boolean'
        ? value
          ? 'Yes'
          : 'No'
        : value,
  );
}
function table(data) {
  if (!data.length)
    return '<div class="empty"><h2>No records to show</h2><p>No stored records match this view. Try a different filter or scan a message in the app.</p></div>';
  const keys = Object.keys(data[0]);
  return `<div class="table-wrap"><table><thead><tr>${keys.map((key) => `<th scope="col">${escape(label(key))}</th>`).join('')}</tr></thead><tbody>${data.map((row) => `<tr>${keys.map((key) => `<td>${cell(row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
/** Opens Scan records, optionally filtered by classification, source, and a UTC date range. */
function openRecords(level = '', { from = '', to = '', source = '' } = {}) {
  navigate('threat_events').then(() => {
    const form = $('#filters');
    if (!form || (!level && !from && !to && !source)) return;
    form.elements.level.value = level;
    if (form.elements.source) form.elements.source.value = source;
    form.elements.from.value = from;
    form.elements.to.value = to;
    page = 0;
    loadRecords();
  });
}
async function navigate(next) {
  closeRecord();
  $('#logout').hidden = false;
  $('#logout').textContent = token ? 'Sign out' : 'Back to sign in';
  section = next;
  page = 0;
  rows = [];
  if (section === 'discoveries') connectDiscoveryStream();
  else disconnectDiscoveryStream();
  const current = ++generation;
  notice();
  renderNav();
  $('#login').hidden = true;
  $('#workspace').hidden = false;
  $('#title').textContent = sections[section];
  $('#subtitle').textContent =
    section === 'model'
      ? 'The machine learning model currently bundled with the app.'
      : section === 'overview'
        ? 'Scan results from every NotiCare user, including separate Manual Scan and real-time totals. Demo scans are excluded.'
        : 'Browse stored metadata. Dates and date filters use UTC; exports include the current page.';
  $('#content').innerHTML = '<div class="empty" role="status">Loading…</div>';
  try {
    if (section === 'connection') {
      $('#subtitle').textContent = 'Check the shared database and the most recent scan received from the mobile app.';
      const connection = await api('/api/connection');
      if (current !== generation) return;
      $('#content').innerHTML =
        `<article class="panel"><h2>Shared Supabase project</h2><p>${escape(connection.project)}</p>${table(connection.checks)}<h2>Latest uploaded scan</h2><p>${connection.latest ? `${escape(connection.latest.received_at)} · ${escape(connection.latest.source)} · Rules ${escape(connection.latest.rule_version)}` : 'No non-demo scans have been received yet.'}</p><p>Sign in on the phone with a Supabase OTP, run a manual scan while online, then refresh this page. Foreground uploads retry every 30 seconds. A local development profile cannot upload data.</p><p>The installed mobile build must use this same project. A successful database check alone does not verify the installed app’s configuration.</p></article>`;
    } else if (section === 'datasets') {
      $('#subtitle').textContent =
        'Browse local CSVs and review the model’s recorded training provenance. This library does not train or update the model.';
      const catalog = await api('/api/datasets');
      if (current !== generation) return;
      renderDatasetLibrary(catalog);
    } else if (section === 'model') {
      const model = await api('/api/model');
      if (current !== generation) return;
      $('#content').innerHTML =
        `<article class="panel"><h2>Active model</h2><div class="facts"><div><small>Version</small>${escape(model.model_provenance.version)}</div><div><small>Model file</small>${escape(model.model_provenance.keras_file)}</div><div><small>Architecture</small>Byte-level CNN text classifier</div></div><p>This model reads a message as raw UTF-8 bytes rather than words. Each byte becomes a number, padded or truncated to a fixed ${escape(model.technical_specifications.input_shape[0])}-byte length, and a convolutional neural network scans that byte sequence for patterns associated with phishing and spam. Working at the byte level lets it handle misspellings, mixed English/Tagalog text, emoji, and unusual formatting without needing a fixed vocabulary. It runs entirely on-device; no message content leaves the phone.</p></article>`;
      $('#content').insertAdjacentHTML(
        'afterbegin',
        `<div class="toolbar"><button id="browse-datasets" ${token ? '' : 'disabled'}>Browse dataset library</button><button id="browse-discoveries" ${token ? '' : 'disabled'}>View phishing detections</button>${token ? '' : '<span class="muted">Sign in to browse records.</span>'}</div>`,
      );
      $('#browse-datasets').onclick = () => navigate('datasets');
      $('#browse-discoveries').onclick = () => navigate('discoveries');
    } else if (section === 'releases') {
      $('#subtitle').textContent =
        'Tell users about a new APK. They see it as "Update available" the next time they open NotiCare.';
      const releases = await api('/api/releases');
      if (current !== generation) return;
      renderReleases(releases);
    } else if (section === 'overview') {
      await Dashboard.render(() => current === generation);
    } else {
      $('#content').innerHTML =
        `<form class="toolbar" id="filters"><label>From (UTC)<input type="date" name="from"></label><label>Through (UTC)<input type="date" name="to"></label>${['threat_events', 'scan_feedback'].includes(section) ? '<label>Classification<select name="level"><option value="">All classifications</option><option>safe</option><option>suspicious</option><option>dangerous</option></select></label>' : ''}${section === 'threat_events' ? '<label>Scan source<select name="source"><option value="">All sources</option><option value="manual">Manual Scan</option><option value="realtime">Real-time scan</option></select></label><label class="check"><input type="checkbox" name="demo" value="true"> Include demo events</label>' : ''}<button type="submit" class="primary">Apply filters</button><button type="button" id="export" disabled>Export page CSV</button></form><div id="records"></div><div class="pagination"><span id="count" role="status"></span><div><button id="previous">← Previous</button> <button id="next">Next →</button></div></div>`;
      $('#filters').onsubmit = (event) => {
        event.preventDefault();
        page = 0;
        loadRecords();
      };
      $('#previous').onclick = () => {
        page--;
        loadRecords();
      };
      $('#next').onclick = () => {
        page++;
        loadRecords();
      };
      $('#export').onclick = exportRows;
      $('#filters').insertAdjacentHTML(
        'beforeend',
        '<div class="quick-filters" aria-label="Quick date filters"><button type="button" data-days="1">Today</button><button type="button" data-days="7">Last 7 days</button><button type="button" data-days="30">Last 30 days</button><button type="button" id="reset-filters">Reset filters</button></div>',
      );
      $('#filters')
        .querySelectorAll('[data-days]')
        .forEach((button) => {
          button.onclick = () => {
            const end = new Date();
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - Number(button.dataset.days) + 1);
            $('#filters').elements.from.value = start.toISOString().slice(0, 10);
            $('#filters').elements.to.value = end.toISOString().slice(0, 10);
            page = 0;
            loadRecords();
          };
        });
      $('#reset-filters').onclick = () => {
        $('#filters').reset();
        page = 0;
        loadRecords();
      };
      if (section === 'discoveries') {
        $('#subtitle').textContent =
          'Suspicious and Dangerous detections, newest received first. These are unverified candidates, not confirmed phishing or training additions. SMS bodies remain on the device.';
        $('#filters').insertAdjacentHTML(
          'afterbegin',
          '<label>Classification<select name="level"><option value="">Suspicious & Dangerous</option><option>suspicious</option><option>dangerous</option></select></label>',
        );
      }
      await loadRecords();
    }
  } catch (error) {
    if (current === generation)
      $('#content').innerHTML =
        '<div class="empty"><h2>Unable to load this view</h2><p>Use Refresh to try again.</p></div>';
    notice(error.message);
  }
}
function renderDatasetLibrary(catalog) {
  const available = catalog.filter((item) => item.file || item.remote_rows).length;
  $('#content').innerHTML =
    `<section class="library-hero"><div><span class="library-kicker">RESEARCH COLLECTION</span><h2>Datasets and model provenance</h2><p>Browse local CSV files or the private dataset rows stored for this admin dashboard. Browsing does not train or update the model.</p></div><div class="library-summary"><strong>${available}<span> / ${catalog.length}</span></strong><span>datasets available to browse</span><small>${catalog.length - available} provenance-only sources</small></div></section>
    <div class="library-section-heading"><div><h2>Dataset collection</h2><p>Browseable rows and model training provenance</p></div><button id="library-detections">Phishing detections ↗</button></div>
    <div class="dataset-catalog"><article class="dataset-card"><div class="dataset-card-top"><span class="dataset-monogram" aria-hidden="true">REPORT</span><span class="dataset-status ready">Opt-in submissions</span></div><h2>Reported phishing messages</h2><span class="dataset-type">Community reports</span><div class="dataset-count"><strong>SMS</strong><span>text and links included</span></div><p class="dataset-description">Messages explicitly shared through Report &amp; Block on a Dangerous result. Reports may contain personal information; links are displayed as text only.</p><div class="dataset-card-footer"><span>Admin access</span><button class="primary" id="open-reported-messages">Open collection</button></div></article><article class="dataset-card"><div class="dataset-card-top"><span class="dataset-monogram" aria-hidden="true">LINK</span><span class="dataset-status ready">Extracted automatically</span></div><h2>Detected phishing links</h2><span class="dataset-type">From reported messages</span><div class="dataset-count"><strong>URL</strong><span>deduplicated across reports</span></div><p class="dataset-description">Links extracted from messages explicitly reported through Report &amp; Block — every source message was already an explicit Dangerous result. Best-effort extraction; links are displayed as text only and never opened.</p><div class="dataset-card-footer"><span>Admin access</span><button class="primary" id="open-phishing-links">Open collection</button></div></article>${catalog
      .map((item) => {
        const browseable = item.file || item.remote_rows;
        const trainingOnly = item.provenance_count !== null && !browseable;
        const rowCount =
          item.row_count !== null && item.row_count !== undefined
            ? number(item.row_count)
            : item.provenance_count === null
              ? 'Local CSV'
              : number(item.provenance_count);
        const rowLabel =
          item.row_count !== null && item.row_count !== undefined
            ? 'rows available to browse'
            : item.provenance_count === null
              ? 'not counted until browsed'
              : 'model provenance rows';
        const description =
          browseable && item.remote_rows
            ? `Browse all ${number(item.remote_row_count)} rows stored in admin-only Supabase storage. Model metadata separately lists ${number(item.provenance_count)} examples for this source; browsing does not train or update the model.`
            : item.file
              ? item.row_count !== null && item.row_count !== undefined
                ? `Browse all ${number(item.row_count)} rows in this local CSV. Model metadata separately lists ${number(item.provenance_count)} examples for this source; browsing does not train or update the model.`
                : 'Browse this local CSV for review. Browsing does not verify its labels or add it to model training.'
              : item.dataset_type === 'URL dataset'
            ? 'The active URL-risk model records this dataset as its training source. Browse the full CSV, including URL feature columns, for research. Browsing does not retrain or update the model.'
            : 'The active model records this source, but its original rows are not yet available in the dashboard. Upload the original text,label CSV to private admin storage for browsing only. This does not add rows to model training.';
        const browserButton = item.file
          ? `<button class="primary" data-dataset-file="${escape(item.file)}">Browse rows →</button>`
          : item.remote_rows
            ? `<button class="primary" data-dataset-source="${escape(item.source)}">Browse rows →</button>`
            : item.source === 'Local_PH_SMS_spam'
              ? `<button class="primary" data-upload-source="${escape(item.source)}">Upload CSV for browsing</button>`
              : '';
        const footer = item.file
          ? 'Local file'
          : item.remote_rows
            ? 'Private admin storage'
            : trainingOnly
              ? 'Source rows unavailable'
              : 'No local CSV';
        return `<article class="dataset-card"><div class="dataset-card-top"><span class="dataset-monogram" aria-hidden="true">${item.source.startsWith('UCI') ? 'UCI' : item.source.startsWith('NCSU') ? 'NC' : 'CSV'}</span><span class="dataset-status ${browseable ? 'ready' : trainingOnly ? 'training' : 'pending'}">${browseable ? '● Available to browse' : trainingOnly ? 'Training provenance' : 'Additional dataset'}</span></div><h2>${escape(label(item.source))}</h2><span class="dataset-type">${item.provenance_count === null ? 'Local research CSV' : 'Recorded model source'}</span><div class="dataset-count"><strong>${rowCount}</strong><span>${rowLabel}</span></div><p class="dataset-description">${description}</p><div class="dataset-card-footer"><span>${footer}</span>${browserButton}</div></article>`;
      })
      .join('')}</div>
    <p class="library-footnote">Model provenance counts describe training inputs, not browseable CSV row totals. Uploaded source rows are stored in admin-only Supabase storage and are not training data. Detections remain separate from training data.</p><div id="dataset-browser"></div>`;
  $('#library-detections').onclick = () => navigate('discoveries');
  $('#open-reported-messages').onclick = openReportedMessages;
  $('#open-phishing-links').onclick = openPhishingLinks;
  $('#content')
    .querySelectorAll('[data-dataset-file]')
    .forEach((button) => {
      button.onclick = () => openDataset({ file: button.dataset.datasetFile });
    });
  $('#content')
    .querySelectorAll('[data-dataset-source]')
    .forEach((button) => {
      button.onclick = () => openDataset({ source: button.dataset.datasetSource });
    });
  $('#content')
    .querySelectorAll('[data-upload-source]')
    .forEach((button) => {
      button.onclick = () => chooseDatasetCsv(button, button.dataset.uploadSource);
    });
}
function chooseDatasetCsv(button, source) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.hidden = true;
  input.onchange = async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      notice('CSV exceeds the 10 MB upload limit.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Uploading…';
    let csv;
    try {
      csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      notice('CSV must be encoded as UTF-8.');
      button.disabled = false;
      button.textContent = 'Upload CSV for browsing';
      return;
    }
    try {
      const result = await api('/api/datasets/source-rows', {
        method: 'POST',
        body: JSON.stringify({ source, csv }),
      });
      await navigate('datasets');
      notice(`Stored ${number(result.rows)} rows for browsing. The model was not trained or changed.`);
    } catch (error) {
      notice(error.message);
      button.disabled = false;
      button.textContent = 'Upload CSV for browsing';
    }
  };
  document.body.append(input);
  input.click();
}
function openReportedMessages() {
  page = 0;
  $('#content').innerHTML =
    `<div class="library-section-heading"><div><h2>Reported phishing messages</h2><p>Only messages explicitly shared through Report &amp; Block are listed here.</p></div><button id="back-to-datasets">← Dataset library</button></div><article class="panel"><p class="muted">These reports contain the submitted message text, including any links. Treat them as untrusted text; links are not opened.</p><form class="toolbar" id="filters"><label>Search all reports<input name="q" type="search" maxlength="200" placeholder="Search message text"></label><input type="hidden" name="reported-messages" value="true"><button class="primary" type="submit">Search</button><button type="button" id="export" disabled>Export page CSV</button></form><div id="records"></div><div class="pagination"><span id="count" role="status"></span><div><button id="previous">← Previous</button> <button id="next">Next →</button></div></div></article>`;
  $('#back-to-datasets').onclick = () => navigate('datasets');
  $('#filters').onsubmit = (event) => {
    event.preventDefault();
    page = 0;
    loadRecords();
  };
  $('#previous').onclick = () => {
    page--;
    loadRecords();
  };
  $('#next').onclick = () => {
    page++;
    loadRecords();
  };
  $('#export').onclick = exportRows;
  loadRecords();
}
function openPhishingLinks() {
  page = 0;
  $('#content').innerHTML =
    `<div class="library-section-heading"><div><h2>Detected phishing links</h2><p>Links extracted from messages explicitly shared through Report &amp; Block.</p></div><button id="back-to-datasets">← Dataset library</button></div><article class="panel"><p class="muted">Best-effort extraction from reported message text. Links are shown as text only and are never opened by this dashboard.</p><form class="toolbar" id="filters"><label>Search all links<input name="q" type="search" maxlength="200" placeholder="Search by domain or URL"></label><input type="hidden" name="phishing-links" value="true"><button class="primary" type="submit">Search</button><button type="button" id="export" disabled>Export page CSV</button></form><div id="records"></div><div class="pagination"><span id="count" role="status"></span><div><button id="previous">← Previous</button> <button id="next">Next →</button></div></div></article>`;
  $('#back-to-datasets').onclick = () => navigate('datasets');
  $('#filters').onsubmit = (event) => {
    event.preventDefault();
    page = 0;
    loadRecords();
  };
  $('#previous').onclick = () => {
    page--;
    loadRecords();
  };
  $('#next').onclick = () => {
    page++;
    loadRecords();
  };
  $('#export').onclick = exportRows;
  loadRecords();
}
function openDataset({ file, source }) {
  page = 0;
  const sourceField = source
    ? `<input type="hidden" name="source" value="${escape(source)}">`
    : `<input type="hidden" name="file" value="${escape(file)}">`;
  $('#dataset-browser').innerHTML =
    `<article class="panel"><h2>${escape(file || label(source))}</h2><form class="toolbar" id="filters">${sourceField}<label>Search all columns<input name="q" type="search" maxlength="200" placeholder="Message, label, or source"></label><button class="primary" type="submit">Search</button><button type="button" id="export" disabled>Export page CSV</button></form><div id="records"></div><div class="pagination"><span id="count" role="status"></span><div><button id="previous">← Previous</button> <button id="next">Next →</button></div></div></article>`;
  $('#filters').onsubmit = (event) => {
    event.preventDefault();
    page = 0;
    loadRecords();
  };
  $('#previous').onclick = () => {
    page--;
    loadRecords();
  };
  $('#next').onclick = () => {
    page++;
    loadRecords();
  };
  $('#export').onclick = exportRows;
  loadRecords();
  $('#dataset-browser').scrollIntoView({ block: 'start' });
}
function releaseCard(release) {
  const status = release.published
    ? '<span class="badge safe">Published</span>'
    : '<span class="badge">Withdrawn</span>';
  const required = release.required ? '<span class="badge dangerous">Required</span> ' : '';
  return `<section class="release-card${release.published ? '' : ' withdrawn'}"><div class="release-head"><div><strong>NotiCare ${escape(release.version_name)}</strong> <span class="muted">version code ${escape(release.version_code)}</span></div><div>${required}${status}</div></div><p class="release-title">${escape(release.title)}</p><ul>${release.changes.map((change) => `<li>${escape(change)}</li>`).join('')}</ul><p class="muted release-meta">${escape(new Date(release.published_at).toLocaleString())} · <span class="release-link">${escape(release.apk_url)}</span></p>${release.published ? `<button data-withdraw="${escape(release.id)}" data-name="${escape(release.version_name)}">Withdraw</button>` : ''}</section>`;
}
/** App updates: publish a new APK's notes and link, and withdraw one that turned out broken. */
function renderReleases(list) {
  const latest = list.find((release) => release.published);
  $('#content').innerHTML =
    `<div class="release-layout"><article class="panel"><h2>Publish an update</h2><p class="muted">Build the APK with EAS first, then copy its version code and download link here. Nothing reaches phones until you publish.</p><form id="release-form" class="release-form"><div class="release-row"><label>Version code<input name="version_code" type="number" min="1" step="1" required placeholder="${latest ? `Higher than ${escape(latest.version_code)}` : 'From the EAS build page'}"></label><label>Version name<input name="version_name" maxlength="32" required placeholder="e.g. 1.1.0"></label></div><label>What this update is for<input name="title" maxlength="80" required placeholder="e.g. Better detection of GCash scams"></label><label>What's new <span>(one change per line, up to 12)</span><textarea name="changes" rows="6" required placeholder="Detects fake GCash and Maya login links&#10;Camera scan reads blurry screenshots better&#10;Fixed: warnings sometimes showed in English"></textarea></label><label>APK download link<input name="apk_url" type="url" required placeholder="https://"></label><label class="check"><input type="checkbox" name="required"> Required update: users can't dismiss it. Use only for security fixes.</label><div><button type="submit" class="primary">Publish update</button></div></form></article><article class="panel"><h2>Releases</h2>${list.length ? `<div class="release-list">${list.map(releaseCard).join('')}</div>` : '<p class="muted">No releases yet. Phones show no update notice until you publish one.</p>'}</article></div>`;
  $('#release-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = form.elements;
    if (
      fields.required.checked &&
      !confirm("Users won't be able to close this notice until they update. Publish as required?")
    )
      return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const release = await api('/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          version_code: fields.version_code.value,
          version_name: fields.version_name.value,
          title: fields.title.value,
          changes: fields.changes.value,
          apk_url: fields.apk_url.value,
          required: fields.required.checked,
        }),
      });
      await navigate('releases');
      notice(`Published NotiCare ${release.version_name}. Phones will show it the next time NotiCare opens.`);
    } catch (error) {
      notice(error.message);
      submit.disabled = false;
    }
  };
  $('#content')
    .querySelectorAll('[data-withdraw]')
    .forEach((button) => {
      button.onclick = async () => {
        if (!confirm(`Withdraw NotiCare ${button.dataset.name}? Phones will stop offering it.`)) return;
        button.disabled = true;
        try {
          await api('/api/releases/withdraw', {
            method: 'POST',
            body: JSON.stringify({ id: button.dataset.withdraw }),
          });
          await navigate('releases');
          notice(`Withdrew NotiCare ${button.dataset.name}. Publish a fixed build with a higher version code.`);
        } catch (error) {
          notice(error.message);
          button.disabled = false;
        }
      };
    });
}
async function loadRecords() {
  closeRecord();
  const current = ++generation;
  const params = new URLSearchParams(new FormData($('#filters')));
  const reportedMessages = section === 'datasets' && params.has('reported-messages');
  const phishingLinks = section === 'datasets' && params.has('phishing-links');
  if (params.get('from') && params.get('to') && params.get('from') > params.get('to')) {
    notice('The start date must be before the end date.');
    return;
  }
  if (section !== 'datasets') params.set('table', section === 'discoveries' ? 'threat_events' : section);
  if (section === 'discoveries') params.set('discoveries', 'true');
  params.set('page', page);
  rows = [];
  $('#export').disabled = true;
  $('#previous').disabled = true;
  $('#next').disabled = true;
  $('#records').innerHTML = '<div class="empty" role="status">Loading records…</div>';
  $('#count').textContent = '';
  notice();
  try {
    const endpoint = reportedMessages
      ? '/api/reported-messages'
      : phishingLinks
        ? '/api/phishing-links'
        : section === 'datasets'
          ? '/api/dataset-rows'
          : '/api/records';
    const data = await api(`${endpoint}?${params}`);
    if (current !== generation) return;
    rows = data.rows;
    renderRecordBrowser();
    const pageSize = data.pageSize || 20;
    $('#count').textContent =
      `${number(data.count)} matching records · Page ${page + 1} of ${Math.max(1, Math.ceil(data.count / pageSize))}`;
    $('#previous').disabled = page === 0;
    $('#next').disabled = (page + 1) * pageSize >= data.count;
    $('#export').disabled = !rows.length;
  } catch (error) {
    if (current === generation) {
      $('#records').innerHTML = '<div class="empty">Records could not be loaded. Apply filters to retry.</div>';
      notice(error.message);
    }
  }
}
function closeRecord() {
  const dialog = $('#record-dialog');
  if (dialog) {
    dialog.close();
    dialog.remove();
  }
}
function showRecord(row, trigger) {
  closeRecord();
  const dialog = document.createElement('dialog');
  dialog.id = 'record-dialog';
  dialog.setAttribute('aria-labelledby', 'record-title');
  dialog.innerHTML = `<div class="import-heading"><h2 id="record-title">Record details</h2><button type="button" aria-label="Close record details" autofocus>✕</button></div><p>All fields in this stored record.</p><dl class="record-fields">${Object.entries(
    row,
  )
    .map(
      ([key, value]) =>
        `<div><dt>${escape(label(key))}</dt><dd>${typeof value === 'object' && value !== null ? `<pre>${escape(JSON.stringify(value, null, 2))}</pre>` : cell(value)}</dd></div>`,
    )
    .join('')}</dl>`;
  document.body.append(dialog);
  dialog.querySelector('button').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (trigger.isConnected) trigger.focus();
  });
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    )
      dialog.close();
  });
  dialog.showModal();
}
function renderRecordBrowser() {
  const loadedRows = [...rows];
  if (!loadedRows.length) {
    $('#records').innerHTML =
      '<div class="empty"><h2>No matching records</h2><p>Try changing the filters or selecting another dataset.</p></div>';
    return;
  }
  const keys = Object.keys(loadedRows[0]);
  let sortKey = null;
  let direction = 1;
  $('#records').innerHTML =
    '<div class="toolbar page-tools"><label>Search this page<input id="page-search" type="search" placeholder="Find a value in loaded rows"></label><span id="page-results" role="status"></span></div><div id="page-table"></div>';
  const valueText = (value) =>
    typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  const render = () => {
    const query = $('#page-search').value.trim().toLocaleLowerCase();
    rows = loadedRows.filter((row) =>
      Object.values(row).some((value) => valueText(value).toLocaleLowerCase().includes(query)),
    );
    if (sortKey !== null)
      rows.sort((a, b) => {
        const left = a[sortKey],
          right = b[sortKey];
        return (
          direction *
          (typeof left === 'number' && typeof right === 'number'
            ? left - right
            : valueText(left).localeCompare(valueText(right), undefined, { numeric: true, sensitivity: 'base' }))
        );
      });
    $('#page-results').textContent = `${rows.length} of ${loadedRows.length} loaded rows · Sort applies to this page`;
    $('#export').disabled = !rows.length;
    $('#page-table').innerHTML = rows.length
      ? `<div class="table-wrap"><table><thead><tr><th scope="col">Details</th>${keys.map((key, index) => `<th scope="col" aria-sort="${key === sortKey ? (direction === 1 ? 'ascending' : 'descending') : 'none'}"><button class="sort-column" data-sort="${index}">${escape(label(key))} <span aria-hidden="true">${key === sortKey ? (direction === 1 ? '↑' : '↓') : '↕'}</span></button></th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr><td><button data-record="${index}" aria-label="View details for row ${index + 1}">View ↗</button></td>${keys.map((key) => `<td><div class="cell-preview">${cell(row[key])}</div></td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><h2>No matches on this page</h2><p>Clear the page search to see all loaded rows.</p></div>';
  };
  $('#page-search').oninput = render;
  $('#page-table').onclick = (event) => {
    const sort = event.target.closest('[data-sort]');
    if (sort) {
      const key = keys[Number(sort.dataset.sort)];
      direction = sortKey === key ? -direction : 1;
      sortKey = key;
      render();
      $('#page-table').querySelector(`[data-sort="${sort.dataset.sort}"]`).focus();
    }
    const record = event.target.closest('[data-record]');
    if (record) showRecord(rows[Number(record.dataset.record)], record);
  };
  render();
}
function exportRows() {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const quote = (value) => {
    let text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv = [keys, ...rows.map((row) => keys.map((key) => row[key]))]
    .map((row) => row.map(quote).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${section}-page-${page + 1}.csv`;
  a.click();
  notice(`Exported ${rows.length} visible rows from page ${page + 1}.`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#login-form').onsubmit = async (event) => {
  event.preventDefault();
  notice();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('#email').value.trim(), password: $('#password').value }),
    });
    token = data.token;
    document.body.dataset.session = 'signed-in';
    restoreAppearance(data.userId || 'guest');
    $('#password').value = '';
    $('#logout').hidden = false;
    updateAutoRefresh($('#auto-refresh').checked);
    expiryTimer = setTimeout(
      () => {
        signOut();
        notice('Your session expired. Sign in again to continue.');
      },
      Math.max(0, data.expiresAt * 1000 - Date.now()),
    );
    await navigate('overview');
  } catch (error) {
    notice(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
};
$('#nav').onclick = (event) => {
  const group = event.target.closest('[data-nav-group]');
  if (group) {
    const groupId = group.dataset.navGroup;
    if (expandedNavGroups.has(groupId)) expandedNavGroups.delete(groupId);
    else expandedNavGroups.add(groupId);
    renderNav();
    return;
  }
  const button = event.target.closest('[data-section]');
  if (button) {
    setNavOpen(false);
    navigate(button.dataset.section);
  }
};
$('#menu-toggle').onclick = () => {
  const open = !document.body.classList.contains('nav-open');
  setNavOpen(open);
  if (open) $('#nav .active')?.focus({ preventScroll: true });
};
$('#nav-backdrop').onclick = () => setNavOpen(false);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('nav-open') && !$('dialog[open]')) {
    setNavOpen(false);
    $('#menu-toggle').focus();
  }
});
$('#logout').onclick = () => {
  signOut();
  notice('Signed out.');
};
$('#preview-model').onclick = () => navigate('model');
$('#refresh').onclick = () =>
  $('#filters')
    ? loadRecords()
    : section === 'overview' && Dashboard.isActive()
      ? Dashboard.refresh().catch((error) => notice(error.message))
      : navigate(section);
$('#appearance').onchange = saveAppearance;
$('#auto-refresh').onchange = (event) => updateAutoRefresh(event.target.checked);
restoreAppearance();
renderNav();
api('/api/config')
  .then((config) => {
    if (!config.configured)
      notice(
        'Supabase is not configured. Add the URL and public key to the root .env, then restart. Model documentation is available now.',
      );
  })
  .catch((error) => notice(error.message));
