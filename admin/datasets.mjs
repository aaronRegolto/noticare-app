import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../datasets/', import.meta.url));
const metadataFile = new URL('../assets/models/model_metadata.json', import.meta.url);
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
const sourceFiles = {
  Local_PH_SMS_spam: 'datasets-page-1.csv',
};
/** Rows per page in every admin table; the browser reads it from each response. */
export const PAGE_SIZE = 20;

// Supports quoted commas, escaped quotes, CRLF and multiline messages. Yields one row object at a
// time instead of building the full array up front: parsing NCSU_SMS_Phishing.csv (68,029 rows)
// into one big array of row objects measured at ~300MB of heap, which alone is enough to crash a
// memory-constrained host. A generator lets a caller (datasetRows below) keep only the handful of
// rows it actually needs for the requested page resident at once.
function* csvRows(text) {
  text = text.replace(/^\uFEFF/, '');
  let row = [],
    field = '',
    quoted = false,
    closed = false,
    headers = null;
  const pushField = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  function* finishRow() {
    if (row.some((value) => value !== '')) {
      if (headers === null) {
        headers = row.map((value) => value.trim());
        if (!headers.length || headers.some((value) => !value) || new Set(headers).size !== headers.length)
          throw invalid('CSV needs a header row with unique, non-empty column names.');
        if (headers.length > 50) throw invalid('CSV may contain at most 50 columns.');
      } else {
        if (row.length !== headers.length)
          throw invalid('A CSV record has a different number of columns than the header.');
        yield Object.fromEntries(headers.map((key, i) => [key, row[i]]));
      }
    }
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      pushField();
      if (char !== ',') {
        yield* finishRow();
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (char === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || char === '"') throw invalid('Invalid CSV quoting. Use a standard UTF-8 CSV export.');
      field += char;
    }
  }
  if (quoted) throw invalid('CSV contains an unfinished quoted field.');
  pushField();
  yield* finishRow();
  if (headers === null) throw invalid('CSV needs a header row with unique, non-empty column names.');
}

/** Array-returning wrapper for callers (import validation, tests) that need the whole small file at once. */
export function parseCsv(text) {
  return [...csvRows(text)];
}

async function files() {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.csv$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export async function datasetCatalog() {
  const [names, model] = await Promise.all([files(), readFile(metadataFile, 'utf8').then(JSON.parse)]);
  const sources = model.model_provenance.dataset_provenance_counts;
  const catalog = Object.entries(sources).map(([source, count]) => ({
    source,
    provenance_count: count,
    file:
      names.find((name) => name.slice(0, -4) === source) ||
      (names.includes(sourceFiles[source]) ? sourceFiles[source] : null),
  }));
  for (const name of names)
    if (!catalog.some((item) => item.file === name))
      catalog.push({ source: name.slice(0, -4), provenance_count: null, file: name });
  return Promise.all(
    catalog.map(async (item) => {
      const row_count =
        item.file && item.source === 'Local_PH_SMS_spam'
          ? [...csvRows(await readFile(join(directory, item.file), 'utf8'))].length
          : null;
      return {
        ...item,
        row_count,
        status: item.file
          ? 'Available to browse'
          : item.provenance_count === null
            ? 'Additional dataset'
            : 'Training provenance only',
        modified_at: item.file ? (await lstat(join(directory, item.file))).mtime.toISOString() : null,
        training_use:
          item.provenance_count === null ? 'Not established by model metadata' : 'Source listed in model metadata',
      };
    }),
  );
}

export async function datasetRows(params) {
  const name = params.get('file');
  if (!(await files()).includes(name)) throw invalid('Choose an available dataset CSV.');
  const file = join(directory, name);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw invalid('Dataset must be a regular CSV file.');
  if (info.size > 25 * 1024 * 1024)
    throw invalid('Dataset exceeds the 25 MB browsing limit. Split it into smaller CSV files.');
  const page = Number(params.get('page') || 0);
  if (!Number.isSafeInteger(page) || page < 0) throw invalid('Invalid page');
  const query = (params.get('q') || '').trim().toLowerCase();
  if (query.length > 200) throw invalid('Search must be 200 characters or fewer.');

  // Streams through csvRows and keeps only the current page's rows (at most PAGE_SIZE) resident,
  // rather than materializing every matching row (or the whole file) as one array — see csvRows
  // above for why that mattered here. Costs one full pass per request instead of an in-memory cache,
  // which is an acceptable trade: a bounded, small, predictable memory footprint over an unbounded one.
  const text = await readFile(file, 'utf8');
  const start = page * PAGE_SIZE,
    end = start + PAGE_SIZE;
  const pageRows = [];
  let total = 0,
    matchCount = 0;
  for (const row of csvRows(text)) {
    total++;
    if (query && !Object.values(row).some((value) => value.toLowerCase().includes(query))) continue;
    if (matchCount >= start && matchCount < end) pageRows.push(row);
    matchCount++;
  }
  return { rows: pageRows, count: matchCount, total, page, pageSize: PAGE_SIZE };
}
