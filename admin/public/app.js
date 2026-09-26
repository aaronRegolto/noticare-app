const $ = (selector) => document.querySelector(selector);
const sections = {
  overview: 'Overview',
  threat_events: 'Scan records',
  discoveries: 'Phishing detections',
  community_daily_stats: 'Daily statistics',
  community_hourly_stats: 'Hourly statistics',
  profiles: 'Profiles',
  rule_sets: 'Rule sets',
  model: 'Machine Learning',
  datasets: 'Dataset library',
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
function applyAppearance(preferences = {}) {
  const theme = ['minimal', 'sage', 'midnight'].includes(preferences.theme) ? preferences.theme : 'minimal';
  const density = preferences.density === 'compact' ? 'compact' : 'comfortable';
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.density = density;
  $('#appearance').value = theme;
  $('#density').value = density;
}
function restoreAppearance(user = 'guest') {
  appearanceUser = user;
  try {
    applyAppearance(JSON.parse(localStorage.getItem(`noticare.admin.appearance.${user}`)) || {});
  } catch {
    applyAppearance();
  }
}
function saveAppearance() {
  const preferences = { theme: $('#appearance').value, density: $('#density').value };
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
  const request = $('#filters') ? loadRecords() : navigate(section);
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
    signal: AbortSignal.timeout(20000),
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
  renderNav();
}
function renderNav() {
  if (!token) {
    $('#nav').replaceChildren();
    return;
  }
  const query = $('#nav-filter').value.trim().toLocaleLowerCase();
  const renderItem = ([id, title]) =>
    `<button data-section="${id}" class="${id === section ? 'active' : ''}" ${id === section ? 'aria-current="page"' : ''}>${escape(title)}</button>`;
  const rendered = [];
  const groupedSections = new Set(Object.values(navGroups).flatMap((group) => group.sections));
  for (const [id, title] of Object.entries(sections)) {
    if (groupedSections.has(id) || !title.toLocaleLowerCase().includes(query)) continue;
    rendered.push(renderItem([id, title]));
  }
  for (const [groupId, group] of Object.entries(navGroups)) {
    const groupSections = group.sections
      .map((id) => [id, sections[id]])
      .filter(([, title]) => title.toLocaleLowerCase().includes(query));
    if (query && !group.label.toLocaleLowerCase().includes(query) && !groupSections.length) continue;
    const expanded = expandedNavGroups.has(groupId) || Boolean(query);
    rendered.push(
      `<div class="nav-group"><button class="nav-group-toggle" data-nav-group="${groupId}" aria-expanded="${expanded}">${escape(group.label)}<span aria-hidden="true">${expanded ? '−' : '+'}</span></button><div class="nav-group-items" ${expanded ? '' : 'hidden'}>${groupSections.map(renderItem).join('')}</div></div>`,
    );
  }
  $('#nav').innerHTML = rendered.join('') || '<p class="nav-empty">No matching views</p>';
}
function metric(title, value) {
  return `<article class="metric"><small>${escape(title)}</small><strong>${escape(value)}</strong></article>`;
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
function openRecords(level = '') {
  navigate('threat_events').then(() => {
    const filter = $('#filters')?.elements.level;
    if (filter && level) {
      filter.value = level;
      page = 0;
      loadRecords();
    }
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
        ? 'A live view of community scan activity. Demo events are excluded.'
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
        'Browse provided training files and newly added datasets. Adding a file does not retrain the model.';
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
    } else if (section === 'overview') {
      const stats = await api('/api/overview');
      if (current !== generation) return;
      const scans = Number(stats.scans) || 0;
      const risky = (Number(stats.suspicious) || 0) + (Number(stats.dangerous) || 0);
      const riskRate = scans ? ((risky / scans) * 100).toFixed(1) : '0.0';
      $('#content').innerHTML =
        `<section class="overview-hero"><div><span class="overview-kicker">LIVE SECURITY PULSE</span><h2>${scans ? `${number(scans)} scans monitored` : 'Your security pulse is ready'}</h2><p>${scans ? `${number(risky)} scans need attention across your community activity.` : 'Scan activity will appear here once the mobile app starts syncing metadata.'}</p><div class="hero-actions"><button id="open-records" class="primary">Review scan records</button><button id="open-discoveries">Review detections</button></div></div><div class="risk-orb" aria-label="${riskRate}% of scans need attention"><strong>${riskRate}%</strong><span>need attention</span></div></section><div class="metrics dashboard-metrics">${Object.entries(
          stats,
        )
          .map(([name, count]) => metric(label(name), number(count)))
          .join(
            '',
          )}</div><div class="overview-grid"><article class="panel distribution-panel"><div class="panel-title"><div><span class="section-kicker">CLASSIFICATION MIX</span><h2>Scan outcomes</h2></div><button id="view-all-scans" class="text-button">View all <span aria-hidden="true">→</span></button></div>${['safe', 'suspicious', 'dangerous'].map((name) => `<button class="bar-row interactive-bar" data-level="${name}" aria-label="View ${name} scans"><span class="badge ${name}">${name}</span><meter min="0" max="${Math.max(scans, 1)}" value="${stats[name]}" aria-label="${name} scans">${stats[name]}</meter><span>${scans ? ((stats[name] / scans) * 100).toFixed(1) : '0'}%</span></button>`).join('')}<p class="panel-note">Select an outcome to filter the scan records. Successfully blocked is a subset of Dangerous.</p></article><article class="panel activity-panel"><span class="section-kicker">WORKSPACE STATUS</span><h2>Ready for review</h2><div class="readiness-list"><div><span class="readiness-icon">✓</span><p><strong>Privacy-first collection</strong><small>SMS content remains on device.</small></p></div><div><span class="readiness-icon">✓</span><p><strong>Metadata is synchronized</strong><small>Use the connection view to verify the latest upload.</small></p></div></div><div class="activity-actions"><button id="open-connection">Connection status</button><button id="open-model">Model & datasets <span aria-hidden="true">→</span></button></div></article></div>`;
      $('#open-records').onclick = () => openRecords();
      $('#open-discoveries').onclick = () => navigate('discoveries');
      $('#view-all-scans').onclick = () => openRecords();
      $('#open-connection').onclick = () => navigate('connection');
      $('#open-model').onclick = () => navigate('model');
      $('#content')
        .querySelectorAll('[data-level]')
        .forEach((button) => {
          button.onclick = () => openRecords(button.dataset.level);
        });
    } else {
      $('#content').innerHTML =
        `<form class="toolbar" id="filters"><label>From (UTC)<input type="date" name="from"></label><label>Through (UTC)<input type="date" name="to"></label>${['threat_events', 'scan_feedback'].includes(section) ? '<label>Classification<select name="level"><option value="">All classifications</option><option>safe</option><option>suspicious</option><option>dangerous</option></select></label>' : ''}${section === 'threat_events' ? '<label class="check"><input type="checkbox" name="demo" value="true"> Include demo events</label>' : ''}<button type="submit" class="primary">Apply filters</button><button type="button" id="export" disabled>Export page CSV</button></form><div id="records"></div><div class="pagination"><span id="count" role="status"></span><div><button id="previous">← Previous</button> <button id="next">Next →</button></div></div>`;
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
  const available = catalog.filter((item) => item.file).length;
  $('#content').innerHTML =
    `<section class="library-hero"><div><span class="library-kicker">RESEARCH COLLECTION</span><h2>Your data. Ready to explore.</h2><p>Connect your original datasets, inspect individual messages, and follow emerging threats.</p><button id="import-new" class="hero-button">＋ Import a dataset</button></div><div class="library-summary"><strong>${available}<span> / ${catalog.length}</span></strong><span>datasets ready to browse</span><small>${catalog.length - available} awaiting source files</small></div></section>
    <div class="library-section-heading"><div><h2>Dataset collection</h2><p>Original sources and additional research files</p></div><button id="library-detections">Phishing detections ↗</button></div>
    <div class="dataset-catalog">${catalog.map((item, index) => `<article class="dataset-card"><div class="dataset-card-top"><span class="dataset-monogram" aria-hidden="true">${item.source.startsWith('UCI') ? 'UCI' : item.source.startsWith('NCSU') ? 'NC' : 'CSV'}</span><span class="dataset-status ${item.file ? 'ready' : 'pending'}">${item.file ? '● Ready to explore' : '○ Source file needed'}</span></div><h2>${escape(label(item.source))}</h2><span class="dataset-type">${item.provenance_count === null ? 'Additional research dataset' : 'Listed model source'}</span><div class="dataset-count"><strong>${item.provenance_count === null ? 'CSV' : number(item.provenance_count)}</strong><span>${item.provenance_count === null ? 'Imported research file' : 'reported provenance rows'}</span></div><p class="dataset-description">${item.file ? 'Search the provided messages and labels. Importing a file does not verify its contents or retrain the model.' : 'The model records this source, but its message rows are missing. Import the original CSV to unlock browsing.'}</p><div class="dataset-card-footer"><span>${item.file ? 'Available locally' : 'Metadata only'}</span><button class="primary" ${item.file ? `data-dataset="${escape(item.file)}"` : `data-import-index="${index}"`}>${item.file ? 'Browse rows →' : 'Import source CSV'}</button></div></article>`).join('')}</div>
    <p class="library-footnote">Provenance counts can overlap. CSV row counts appear when a dataset is opened. Detections remain separate from training data.</p><div id="dataset-browser"></div>
    <dialog id="import-dialog"><form id="import-form"><div class="import-heading"><h2>Import dataset</h2><button type="button" id="close-import" aria-label="Close import">✕</button></div><p>Add a CSV to your local dataset library. Existing files are preserved.</p><label>Dataset filename<input id="import-name" required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}\\.csv" placeholder="my_research.csv"></label><label class="file-drop">Choose a CSV file<input id="import-file" type="file" accept=".csv,text/csv" required><small>UTF-8 · Header row required · Up to 10 MB</small></label><p id="import-status" role="status"></p><button id="submit-import" class="primary" type="submit">Import and browse</button></form></dialog>`;
  const showImport = (name = '') => {
    $('#import-form').reset();
    $('#import-name').value = name;
    $('#import-status').textContent = '';
    $('#import-dialog').showModal();
  };
  $('#import-new').onclick = () => showImport();
  $('#library-detections').onclick = () => navigate('discoveries');
  $('#close-import').onclick = () => $('#import-dialog').close();
  $('#content')
    .querySelectorAll('[data-dataset]')
    .forEach((button) => {
      button.onclick = () => openDataset(button.dataset.dataset);
    });
  $('#content')
    .querySelectorAll('[data-import-index]')
    .forEach((button) => {
      button.onclick = () => showImport(`${catalog[Number(button.dataset.importIndex)].source}.csv`);
    });
  $('#import-file').onchange = () => {
    const file = $('#import-file').files[0];
    if (file && !$('#import-name').value)
      $('#import-name').value =
        file.name
          .replace(/\.csv$/i, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 100) + '.csv';
  };
  $('#import-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = $('#submit-import'),
      status = $('#import-status');
    const file = $('#import-file').files[0],
      filename = $('#import-name').value;
    if (!file || file.size > 10 * 1024 * 1024) {
      status.textContent = 'Choose a CSV no larger than 10 MB.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Validating and importing…';
    const current = generation;
    try {
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const imported = await api('/api/datasets/import', { method: 'POST', body: JSON.stringify({ filename, csv }) });
      if (current !== generation) return;
      $('#import-dialog').close();
      await navigate('datasets');
      if (section === 'datasets' && $('#dataset-browser')) {
        openDataset(imported.file);
        notice(`Imported ${number(imported.count)} rows. This file has not been added to model training.`);
      }
    } catch (error) {
      status.textContent =
        error instanceof TypeError
          ? 'Unable to read a UTF-8 CSV or connect to the server. Check the file and connection.'
          : error.message;
    } finally {
      button.disabled = false;
    }
  };
}
function openDataset(file) {
  page = 0;
  $('#dataset-browser').innerHTML =
    `<article class="panel"><h2>${escape(file)}</h2><form class="toolbar" id="filters"><input type="hidden" name="file" value="${escape(file)}"><label>Search all columns<input name="q" type="search" maxlength="200" placeholder="Message, label, or source"></label><button class="primary" type="submit">Search</button><button type="button" id="export" disabled>Export page CSV</button></form><div id="records"></div><div class="pagination"><span id="count" role="status"></span><div><button id="previous">← Previous</button> <button id="next">Next →</button></div></div></article>`;
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
async function loadRecords() {
  closeRecord();
  const current = ++generation;
  const params = new URLSearchParams(new FormData($('#filters')));
  if (params.get('from') && params.get('to') && params.get('from') > params.get('to')) {
    notice('The start date must be before the end date.');
    return;
  }
  params.set('table', section === 'discoveries' ? 'threat_events' : section);
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
    const data = await api(`${section === 'datasets' ? '/api/dataset-rows' : '/api/records'}?${params}`);
    if (current !== generation) return;
    rows = data.rows;
    renderRecordBrowser();
    $('#count').textContent =
      `${number(data.count)} matching records · Page ${page + 1} of ${Math.max(1, Math.ceil(data.count / 50))}`;
    $('#previous').disabled = page === 0;
    $('#next').disabled = (page + 1) * 50 >= data.count;
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
  if (button) navigate(button.dataset.section);
};
$('#nav-filter').oninput = renderNav;
$('#nav-filter').onkeydown = (event) => {
  if (event.key === 'Escape') {
    event.currentTarget.value = '';
    renderNav();
  }
};
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    $('#nav-filter').focus();
  }
});
$('#logout').onclick = () => {
  signOut();
  notice('Signed out.');
};
$('#preview-model').onclick = () => navigate('model');
$('#refresh').onclick = () => ($('#filters') ? loadRecords() : navigate(section));
$('#appearance').onchange = saveAppearance;
$('#density').onchange = saveAppearance;
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
