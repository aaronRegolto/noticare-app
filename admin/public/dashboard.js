// Dashboard view: all-time hero, a range picker, KPI tiles, the stacked activity chart, and the
// classification mix. Relies on app.js globals ($, api, number, openRecords, navigate). All text
// that could vary is inserted with textContent; markup strings below contain only fixed labels
// and numbers.
const Dashboard = (() => {
  const SVG = 'http://www.w3.org/2000/svg';
  const LEVELS = [
    { key: 'safe', label: 'Safe', upIsBad: false },
    { key: 'suspicious', label: 'Suspicious', upIsBad: true },
    { key: 'dangerous', label: 'Dangerous', upIsBad: true },
  ];
  const RANGES = [
    { key: '24h', label: '24 hours', period: 'previous 24 hours' },
    { key: '7d', label: '7 days', period: 'previous 7 days' },
    { key: '30d', label: '30 days', period: 'previous 30 days' },
    { key: '90d', label: '90 days', period: 'previous 90 days' },
  ];
  const reducedMotion =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };

  let range = readStoredRange();
  let view = 'chart';
  let hidden = new Set();
  let trend = null;
  let totals = null;
  let active = null;
  let request = 0;
  let resizeObserver = null;
  let animateNext = true;

  function readStoredRange() {
    try {
      const stored = localStorage.getItem('noticare.admin.dashboard.range');
      return RANGES.some((item) => item.key === stored) ? stored : '30d';
    } catch {
      return '30d';
    }
  }
  function storeRange() {
    try {
      localStorage.setItem('noticare.admin.dashboard.range', range);
    } catch {
      // Remembering the range is a convenience only.
    }
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svg = (tag, attributes = {}) => {
    const node = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  };
  const sum = (bucket, keys = LEVELS.map((level) => level.key)) => keys.reduce((total, key) => total + bucket[key], 0);
  const percent = (part, whole) => (whole ? (part / whole) * 100 : 0);
  const rangeInfo = () => RANGES.find((item) => item.key === range);

  const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const longDayFormat = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: 'UTC' });
  const axisLabel = (start) => (trend.granularity === 'hour' ? hourFormat : dayFormat).format(new Date(start));
  const bucketTitle = (start) =>
    trend.granularity === 'hour'
      ? `${dayFormat.format(new Date(start))}, ${hourFormat.format(new Date(start))} UTC`
      : `${longDayFormat.format(new Date(start))} (UTC)`;

  /** Clean y-axis ticks: steps of 1, 2, or 5 × 10^n, about four intervals. */
  function niceTicks(max) {
    const top = Math.max(max, 4);
    const rough = top / 4;
    const power = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough);
    const ticks = [];
    for (let value = 0; value <= top + step * 0.001; value += step) ticks.push(value);
    if (ticks[ticks.length - 1] < top) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  }

  function periodTotals() {
    const current = { safe: 0, suspicious: 0, dangerous: 0, blocked: 0 };
    for (const bucket of trend.buckets) for (const key of Object.keys(current)) current[key] += bucket[key];
    return current;
  }

  function recordRange(bucket) {
    const start = bucket ? new Date(bucket.start) : new Date(trend.buckets[0].start);
    const end = bucket ? start : new Date(trend.buckets[trend.buckets.length - 1].start);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }

  // ---------- Layout ----------

  function heroMarkup(stats) {
    const scans = Number(stats.scans) || 0;
    const risky = (Number(stats.suspicious) || 0) + (Number(stats.dangerous) || 0);
    const riskRate = scans ? (risky / scans) * 100 : 0;
    return `<section class="overview-hero"><div><span class="overview-kicker">ALL-TIME OVERVIEW</span><h2>${scans ? `${number(scans)} ${scans === 1 ? 'message' : 'messages'} scanned` : 'No scans yet'}</h2><p>${scans ? `${number(risky)} flagged as suspicious or dangerous, and ${number(Number(stats.blocked) || 0)} dangerous ${Number(stats.blocked) === 1 ? 'message' : 'messages'} blocked. Totals cover every NotiCare user and exclude demo scans.` : 'Totals will appear here once the NotiCare app starts uploading scan results.'}</p><div class="hero-actions"><button id="open-records" class="primary">View scan records</button><button id="open-discoveries">View flagged messages</button></div></div><div class="risk-orb" role="img" aria-label="${riskRate.toFixed(1)}% of all scans were flagged"><svg class="risk-gauge" viewBox="0 0 120 120" aria-hidden="true"><circle class="risk-track" cx="60" cy="60" r="52"></circle><circle class="risk-value" cx="60" cy="60" r="52" pathLength="100" data-rate="${riskRate.toFixed(2)}"></circle></svg><strong>${riskRate.toFixed(1)}%</strong><span>flagged</span></div></section>`;
  }

  function layoutMarkup() {
    return `<div class="dash-toolbar"><div><span class="section-kicker">COMMUNITY ACTIVITY</span><h2 class="dash-heading">Scan activity</h2></div><div class="range-picker" role="radiogroup" aria-label="Time range">${RANGES.map((item) => `<button type="button" role="radio" data-range="${item.key}" aria-checked="${item.key === range}">${item.label}</button>`).join('')}</div></div><div id="dash-body" class="dash-body"><div id="kpis" class="kpi-grid"></div><article class="panel chart-card"><div class="chart-head"><div><span class="section-kicker">TREND</span><h2>Scans by classification</h2><p id="chart-sub" class="chart-sub"></p></div><div class="chart-controls"><div id="legend" class="legend" role="group" aria-label="Show or hide classifications"></div><div class="view-switch" role="group" aria-label="Display as"><button type="button" data-view="chart" aria-pressed="${view === 'chart'}">Chart</button><button type="button" data-view="table" aria-pressed="${view === 'table'}">Table</button></div></div></div><div id="chart-frame" class="chart-frame" tabindex="0" role="group" aria-roledescription="chart" aria-label="Scans by classification over time. Use the left and right arrow keys to read each period; press Enter to open its records."><div id="chart-tooltip" class="chart-tooltip" hidden></div></div><div id="chart-table" class="chart-table" hidden></div></article><div class="overview-grid"><article class="panel mix-card"><div class="panel-title"><div><span class="section-kicker">CLASSIFICATION MIX</span><h2>Scan outcomes</h2></div><button id="view-all-scans" class="text-button">View all <span aria-hidden="true">→</span></button></div><div id="mix"></div><p class="panel-note">Select a row to open its scan records for this period. Blocked messages are counted within Dangerous.</p></article><article class="panel activity-panel"><span class="section-kicker">DATA &amp; PRIVACY</span><h2>What this data includes</h2><div class="readiness-list"><div><span class="readiness-icon">✓</span><p><strong>Message text stays on the phone</strong><small>Scans upload only the result: classification, score, and warning signs.</small></p></div><div><span class="readiness-icon">✓</span><p><strong>Reports are the one exception</strong><small>When a user reports a message, its text is shared so others can spot it.</small></p></div></div><div class="activity-actions"><button id="open-connection">Check connection</button><button id="open-model">Model &amp; datasets <span aria-hidden="true">→</span></button></div></article></div></div>`;
  }

  // ---------- KPI tiles ----------

  // Below this many scans in the previous period, a percentage swings wildly (1 → 20 scans is
  // "+1,900%"), so the change is shown as a plain count instead.
  const MIN_BASE_FOR_PERCENT = 20;

  /** The change vs. the previous period: a count difference, plus a percentage on a large base. */
  function deltaInfo(current, previous, upIsBad) {
    const period = `the ${rangeInfo().period}`;
    if (!current && !previous) return { text: 'No activity', detail: ` in this or ${period}`, tone: 'flat', arrow: '' };
    const difference = current - previous;
    if (!difference) return { text: 'No change', detail: ` from ${period}`, tone: 'flat', arrow: '' };
    const up = difference > 0;
    const tone = upIsBad === null ? 'flat' : up === upIsBad ? 'bad' : 'good';
    const percent =
      previous >= MIN_BASE_FOR_PERCENT
        ? ` (${up ? '+' : '−'}${Math.round(Math.abs(difference / previous) * 100)}%)`
        : '';
    return {
      text: `${number(Math.abs(difference))} ${up ? 'more' : 'fewer'}${percent}`,
      detail: ` than ${period}`,
      tone,
      arrow: up ? '▲' : '▼',
    };
  }

  function sparkline(host, values, seriesKey) {
    const width = Math.max(host.clientWidth, 60);
    const height = 30;
    const max = Math.max(...values, 1);
    const x = (index) => (values.length === 1 ? width / 2 : 4 + (index * (width - 8)) / (values.length - 1));
    const y = (value) => height - 4 - (value / max) * (height - 8);
    const graphic = svg('svg', {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      'aria-hidden': 'true',
      class: 'spark',
    });
    graphic.append(
      svg('path', {
        class: 'spark-area',
        d: `M${x(0)},${height - 4} ${values.map((value, index) => `L${x(index)},${y(value)}`).join(' ')} L${x(values.length - 1)},${height - 4} Z`,
      }),
    );
    graphic.append(
      svg('polyline', {
        class: 'spark-line',
        points: values.map((value, index) => `${x(index)},${y(value)}`).join(' '),
      }),
    );
    graphic.append(
      svg('circle', {
        class: `spark-dot ${seriesKey ? `s-${seriesKey}` : 's-total'}`,
        cx: x(values.length - 1),
        cy: y(values[values.length - 1]),
        r: 3.5,
      }),
    );
    host.replaceChildren(graphic);
  }

  function renderKpis() {
    const host = $('#kpis');
    const current = periodTotals();
    const previous = trend.previous;
    const tiles = [
      { key: 'total', label: 'Scans', value: sum(current), previous: sum(previous), upIsBad: null, level: '' },
      ...LEVELS.map((level) => ({
        key: level.key,
        label: level.label,
        value: current[level.key],
        previous: previous[level.key],
        upIsBad: level.upIsBad,
        level: level.key,
      })),
      {
        key: 'blocked',
        label: 'Blocked',
        value: current.blocked,
        previous: previous.blocked,
        upIsBad: null,
        level: 'dangerous',
      },
    ];
    host.replaceChildren(
      ...tiles.map((tile) => {
        const button = el('button', 'kpi');
        button.type = 'button';
        const delta = deltaInfo(tile.value, tile.previous, tile.upIsBad);
        button.setAttribute(
          'aria-label',
          `${tile.label}: ${number(tile.value)} in the last ${rangeInfo().label}. ${delta.text}${delta.detail}. Open matching scan records.`,
        );
        const labelRow = el('span', 'kpi-label');
        if (LEVELS.some((level) => level.key === tile.key)) labelRow.append(el('i', `key s-${tile.key}`));
        labelRow.append(tile.label);
        const deltaRow = el('span', `kpi-delta ${delta.tone}`);
        if (delta.arrow) deltaRow.append(el('span', 'kpi-arrow', delta.arrow));
        deltaRow.append(delta.text, el('small', '', delta.detail));
        const spark = el('span', 'kpi-spark');
        button.append(labelRow, el('strong', 'kpi-value', number(tile.value)), deltaRow, spark);
        button.onclick = () => openRecords(tile.level, recordRange());
        return button;
      }),
    );
    host.querySelectorAll('.kpi-spark').forEach((spark, index) => {
      const tile = tiles[index];
      const values = trend.buckets.map((bucket) => (tile.key === 'total' ? sum(bucket) : bucket[tile.key]));
      sparkline(spark, values, LEVELS.some((level) => level.key === tile.key) ? tile.key : null);
    });
  }

  // ---------- Legend, table, mix ----------

  function renderLegend() {
    $('#legend').replaceChildren(
      ...LEVELS.map((level) => {
        const button = el('button', 'legend-item');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(!hidden.has(level.key)));
        button.append(el('i', `key s-${level.key}`), level.label);
        button.onclick = () => {
          if (!hidden.has(level.key) && hidden.size === LEVELS.length - 1) return; // keep one series visible
          if (hidden.has(level.key)) hidden.delete(level.key);
          else hidden.add(level.key);
          renderLegend();
          drawChart(false);
          renderTable();
        };
        return button;
      }),
    );
  }

  function renderTable() {
    const wrap = el('div', 'table-wrap');
    const tableNode = el('table');
    const head = el('tr');
    for (const name of [
      trend.granularity === 'hour' ? 'Hour (UTC)' : 'Date (UTC)',
      'Safe',
      'Suspicious',
      'Dangerous',
      'Total',
      'Blocked',
    ]) {
      const th = el('th', '', name);
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const bucket of [...trend.buckets].reverse()) {
      const row = el('tr');
      row.append(el('td', '', bucketTitle(bucket.start).replace(' (UTC)', '').replace(' UTC', '')));
      for (const value of [bucket.safe, bucket.suspicious, bucket.dangerous, sum(bucket), bucket.blocked])
        row.append(el('td', 'num', number(value)));
      tbody.append(row);
    }
    tableNode.append(thead, tbody);
    wrap.append(tableNode);
    $('#chart-table').replaceChildren(wrap);
  }

  function renderMix() {
    const current = periodTotals();
    const total = sum(current);
    const bar = el('div', 'mix-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute(
      'aria-label',
      LEVELS.map((level) => `${level.label} ${percent(current[level.key], total).toFixed(1)}%`).join(', '),
    );
    if (total) {
      for (const level of LEVELS) {
        if (!current[level.key]) continue;
        const segment = el('span', `mix-segment s-${level.key}`);
        segment.style.setProperty('flex-grow', String(current[level.key]));
        bar.append(segment);
      }
    } else bar.classList.add('empty-bar');
    const rows = el('div', 'mix-rows');
    for (const level of LEVELS) {
      const row = el('button', 'mix-row');
      row.type = 'button';
      row.setAttribute(
        'aria-label',
        `${level.label}: ${number(current[level.key])} scans, ${percent(current[level.key], total).toFixed(1)}%. Open ${level.label.toLowerCase()} scan records.`,
      );
      const name = el('span', 'mix-name');
      name.append(el('i', `key s-${level.key}`), level.label);
      row.append(
        name,
        el('strong', 'mix-count', number(current[level.key])),
        el('span', 'mix-share', `${percent(current[level.key], total).toFixed(1)}%`),
        el('span', 'mix-go', '→'),
      );
      row.onclick = () => openRecords(level.key, recordRange());
      rows.append(row);
    }
    const headline = el('div', 'mix-headline');
    headline.append(
      el('strong', '', `${percent(current.suspicious + current.dangerous, total).toFixed(1)}%`),
      el(
        'span',
        '',
        `of ${number(total)} scans in the last ${rangeInfo().label} were flagged as suspicious or dangerous`,
      ),
    );
    $('#mix').replaceChildren(headline, bar, rows);
  }

  // ---------- Stacked column chart ----------

  function drawChart(animate) {
    const frame = $('#chart-frame');
    if (!frame || !trend) return;
    const tooltip = $('#chart-tooltip');
    frame.querySelector('svg')?.remove();
    const visible = LEVELS.filter((level) => !hidden.has(level.key));
    const buckets = trend.buckets;
    const width = Math.max(frame.clientWidth, 280);
    const height = width < 560 ? 230 : 290;
    const ticks = niceTicks(
      Math.max(
        0,
        ...buckets.map((bucket) =>
          sum(
            bucket,
            visible.map((level) => level.key),
          ),
        ),
      ),
    );
    const top = ticks[ticks.length - 1];
    const margin = { top: 12, right: 6, bottom: 30, left: 12 + String(number(top)).length * 7 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const baseline = margin.top + plotHeight;
    const band = plotWidth / buckets.length;
    const columnWidth = Math.max(2, Math.min(24, band * 0.64));
    const scale = (value) => (value / top) * plotHeight;
    const xCenter = (index) => margin.left + band * index + band / 2;

    const chart = svg('svg', {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      class: 'activity-chart',
      'aria-hidden': 'true',
    });
    const grid = svg('g', { class: 'grid' });
    for (const tick of ticks) {
      const y = baseline - scale(tick);
      grid.append(
        svg('line', {
          x1: margin.left,
          x2: width - margin.right,
          y1: y,
          y2: y,
          class: tick === 0 ? 'baseline' : 'gridline',
        }),
      );
      const label = svg('text', { x: margin.left - 8, y: y + 4, class: 'axis-label', 'text-anchor': 'end' });
      label.textContent = number(tick);
      grid.append(label);
    }
    chart.append(grid);

    const hoverBand = svg('rect', {
      class: 'hover-band',
      y: margin.top,
      height: plotHeight,
      width: band,
      x: 0,
      rx: 6,
      visibility: 'hidden',
    });
    chart.append(hoverBand);

    const columns = svg('g', { class: animate && !reducedMotion.matches ? 'columns animate' : 'columns' });
    const delayStep = Math.min(14, 420 / buckets.length);
    buckets.forEach((bucket, index) => {
      const column = svg('g', { class: 'column' });
      column.style.setProperty('transform-origin', `0px ${baseline}px`);
      column.style.setProperty('animation-delay', `${Math.round(index * delayStep)}ms`);
      const segments = visible.filter((level) => bucket[level.key] > 0);
      let cursor = baseline;
      segments.forEach((level, position) => {
        const full = scale(bucket[level.key]);
        const isTop = position === segments.length - 1;
        // 2px surface gap between stacked segments, taken from the lower segment.
        const drawn = Math.max(1, isTop ? full : full - 2);
        const x = xCenter(index) - columnWidth / 2;
        const y = cursor - full;
        const radius = isTop ? Math.min(4, columnWidth / 2, drawn) : 0;
        const d = radius
          ? `M${x},${y + drawn} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + columnWidth - radius} Q${x + columnWidth},${y} ${x + columnWidth},${y + radius} V${y + drawn} Z`
          : `M${x},${y + (full - drawn)} H${x + columnWidth} V${y + full} H${x} Z`;
        column.append(svg('path', { d, class: `segment s-${level.key}` }));
        cursor -= full;
      });
      columns.append(column);
    });
    chart.append(columns);

    const labelEvery = Math.max(1, Math.ceil(64 / band));
    const axis = svg('g', { class: 'x-axis' });
    buckets.forEach((bucket, index) => {
      if ((buckets.length - 1 - index) % labelEvery) return;
      const label = svg('text', { x: xCenter(index), y: baseline + 20, class: 'axis-label', 'text-anchor': 'middle' });
      label.textContent = axisLabel(bucket.start);
      axis.append(label);
    });
    chart.append(axis);

    const hits = svg('g', { class: 'hits' });
    buckets.forEach((bucket, index) => {
      const hit = svg('rect', {
        x: margin.left + band * index,
        y: margin.top,
        width: band,
        height: plotHeight + margin.bottom,
        class: 'hit',
      });
      hit.addEventListener('pointerenter', () => setActive(index));
      hit.addEventListener('pointermove', () => setActive(index));
      hit.addEventListener('click', () => openRecords('', recordRange(bucket)));
      hits.append(hit);
    });
    chart.append(hits);
    chart.addEventListener('pointerleave', () => setActive(null));
    frame.insertBefore(chart, tooltip);

    if (!buckets.some((bucket) => sum(bucket))) {
      const empty = svg('text', {
        x: margin.left + plotWidth / 2,
        y: margin.top + plotHeight / 2,
        class: 'chart-empty',
        'text-anchor': 'middle',
      });
      empty.textContent = `No scans in the last ${rangeInfo().label}`;
      chart.append(empty);
    }

    function setActive(index) {
      active = index;
      if (index === null) {
        hoverBand.setAttribute('visibility', 'hidden');
        tooltip.hidden = true;
        columns.classList.remove('dimmed');
        return;
      }
      const bucket = buckets[index];
      hoverBand.setAttribute('x', margin.left + band * index);
      hoverBand.setAttribute('visibility', 'visible');
      columns.classList.add('dimmed');
      columns
        .querySelectorAll('.column')
        .forEach((node, position) => node.classList.toggle('active', position === index));
      tooltip.replaceChildren(el('div', 'tip-title', bucketTitle(bucket.start)));
      for (const level of [...visible].reverse()) {
        const row = el('div', 'tip-row');
        row.append(
          el('i', `tip-key s-${level.key}`),
          el('strong', '', number(bucket[level.key])),
          el('span', '', level.label),
        );
        tooltip.append(row);
      }
      const totalRow = el('div', 'tip-row tip-total');
      totalRow.append(
        el('i', 'tip-key blank'),
        el(
          'strong',
          '',
          number(
            sum(
              bucket,
              visible.map((level) => level.key),
            ),
          ),
        ),
        el('span', '', 'Total'),
      );
      const blockedRow = el('div', 'tip-row');
      blockedRow.append(el('i', 'tip-key blank'), el('strong', '', number(bucket.blocked)), el('span', '', 'Blocked'));
      tooltip.append(totalRow, blockedRow, el('div', 'tip-hint', 'Click to view these scans'));
      tooltip.hidden = false;
      const tipWidth = tooltip.offsetWidth;
      const center = xCenter(index);
      const left = center + tipWidth + 16 > width ? center - tipWidth - 12 : center + 12;
      tooltip.style.setProperty('transform', `translate(${Math.max(0, left)}px, ${margin.top}px)`);
    }
    frame.onkeydown = (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : -1;
        setActive(Math.min(buckets.length - 1, Math.max(0, (active ?? (step > 0 ? -1 : buckets.length)) + step)));
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        setActive(event.key === 'Home' ? 0 : buckets.length - 1);
      } else if (event.key === 'Enter' && active !== null) {
        openRecords('', recordRange(buckets[active]));
      } else if (event.key === 'Escape') setActive(null);
    };
    frame.onblur = () => setActive(null);
    if (active !== null && active < buckets.length) setActive(active);
  }

  // ---------- Rendering & data ----------

  function renderAll(animate) {
    const granularity = trend.granularity === 'hour' ? 'Hourly' : 'Daily';
    $('#chart-sub').textContent = `${granularity} totals, UTC · last ${rangeInfo().label} · excludes demo events`;
    renderKpis();
    renderLegend();
    renderMix();
    renderTable();
    $('#chart-frame').hidden = view !== 'chart';
    $('#chart-table').hidden = view !== 'table';
    drawChart(animate);
  }

  const fetchData = () => Promise.all([api('/api/overview'), api(`/api/trend?range=${range}`)]);

  /** Refetches in place, holding the previous render at reduced opacity (no skeleton flash). */
  async function load({ animate = false } = {}) {
    const current = ++request;
    $('#dash-body')?.classList.add('is-loading');
    try {
      const [stats, data] = await fetchData();
      if (current !== request || !$('#dash-body')) return;
      totals = stats;
      trend = data;
      const hero = $('#content .overview-hero');
      hero.outerHTML = heroMarkup(totals);
      wireHero();
      active = null;
      renderAll(animate);
    } finally {
      if (current === request) $('#dash-body')?.classList.remove('is-loading');
    }
  }

  function wireHero() {
    $('#open-records').onclick = () => openRecords();
    $('#open-discoveries').onclick = () => navigate('discoveries');
    const gauge = $('.risk-value');
    if (gauge) {
      const rate = Number(gauge.dataset.rate);
      gauge.style.setProperty('stroke-dashoffset', '100');
      // Next frame so the arc animates from empty to its value.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => gauge.style.setProperty('stroke-dashoffset', String(100 - Math.min(100, rate)))),
      );
    }
  }

  /** Builds the view. `isCurrent` reports whether the user is still waiting for it. */
  async function render(isCurrent) {
    const current = ++request;
    const [stats, data] = await fetchData();
    if (current !== request || !isCurrent()) return;
    totals = stats;
    trend = data;
    active = null;
    $('#content').innerHTML = heroMarkup(stats) + layoutMarkup();
    wireHero();
    $('#view-all-scans').onclick = () => openRecords();
    $('#open-connection').onclick = () => navigate('connection');
    $('#open-model').onclick = () => navigate('model');
    $('#content')
      .querySelectorAll('[data-range]')
      .forEach((button) => {
        button.onclick = () => {
          if (button.dataset.range === range) return;
          range = button.dataset.range;
          storeRange();
          $('#content')
            .querySelectorAll('[data-range]')
            .forEach((item) => item.setAttribute('aria-checked', String(item.dataset.range === range)));
          load({ animate: true }).catch((error) => notice(error.message));
        };
      });
    $('#content')
      .querySelectorAll('[data-view]')
      .forEach((button) => {
        button.onclick = () => {
          view = button.dataset.view;
          $('#content')
            .querySelectorAll('[data-view]')
            .forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.view === view)));
          $('#chart-frame').hidden = view !== 'chart';
          $('#chart-table').hidden = view !== 'table';
          if (view === 'chart') drawChart(false);
        };
      });
    resizeObserver?.disconnect();
    if (typeof ResizeObserver === 'function') {
      let lastWidth = 0;
      let frame = 0;
      resizeObserver = new ResizeObserver(([entry]) => {
        const width = Math.round(entry.contentRect.width);
        if (!trend || width === lastWidth) return;
        lastWidth = width;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (!$('#dash-body')) return resizeObserver.disconnect();
          renderKpis();
          drawChart(false);
        });
      });
      resizeObserver.observe($('#dash-body'));
    }
    renderAll(animateNext);
    animateNext = false;
  }

  return { render, refresh: () => load(), isActive: () => Boolean($('#dash-body')) };
})();
