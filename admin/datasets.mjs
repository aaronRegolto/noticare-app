import { readdir, readFile, lstat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../datasets/', import.meta.url));
const metadataFile = new URL('../assets/models/model_metadata.json', import.meta.url);
const invalid = (message) => Object.assign(new Error(message), { status: 400 });

export async function importDataset({ filename, csv }) {
  if (
    typeof filename !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}\.csv$/.test(filename) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(filename)
  )
    throw invalid('Use a CSV filename containing letters, numbers, hyphens, and underscores only.');
  if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > 10 * 1024 * 1024)
    throw invalid('Choose a UTF-8 CSV file no larger than 10 MB.');
  if (/^PK(?:\u0003\u0004|\u0005\u0006|\u0007\u0008)/.test(csv))
    throw invalid('This file appears to be an Excel workbook or ZIP archive. Save it as "CSV UTF-8" and import again.');

  const rows = parseCsv(csv);
  if (!rows.length) throw invalid('The CSV contains no data rows.');
  try {
    await writeFile(join(directory, filename), csv, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST')
      throw invalid('This filename already exists. Use a different name to keep both datasets.');
    throw error;
  }
  return { file: filename, count: rows.length };
}

// CSV supports quoted commas, escaped quotes, CRLF and multiline messages.
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const records = [];
  let row = [],
    field = '',
    quoted = false,
    closed = false;
  const push = () => {
    row.push(field);
    field = '';
    closed = false;
  };
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
      push();
      if (char !== ',') {
        if (row.some((value) => value !== '')) records.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (char === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || char === '"') throw invalid('Invalid CSV quoting. Use a standard UTF-8 CSV export.');
      field += char;
    }
  }
  if (quoted) throw invalid('CSV contains an unfinished quoted field.');
  push();
  if (row.some((value) => value !== '')) records.push(row);
  const headers = records.shift()?.map((value) => value.trim());
  if (!headers?.length || headers.some((value) => !value) || new Set(headers).size !== headers.length)
    throw invalid('CSV needs a header row with unique, non-empty column names.');
  if (headers.length > 50) throw invalid('CSV may contain at most 50 columns.');
  return records.map((values, index) => {
    if (values.length !== headers.length)
      throw invalid(`CSV record ${index + 2} has a different number of columns than the header.`);
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
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
    file: names.find((name) => name.slice(0, -4) === source) || null,
  }));
  for (const name of names)
    if (!catalog.some((item) => item.file === name))
      catalog.push({ source: name.slice(0, -4), provenance_count: null, file: name });
  return Promise.all(
    catalog.map(async (item) => ({
      ...item,
      status: item.file ? 'Available to browse' : 'File not provided',
      modified_at: item.file ? (await lstat(join(directory, item.file))).mtime.toISOString() : null,
      training_use:
        item.provenance_count === null ? 'Not established by model metadata' : 'Source listed in model metadata',
    })),
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
  const all = parseCsv(await readFile(file, 'utf8'));
  const matches = query
    ? all.filter((row) => Object.values(row).some((value) => value.toLowerCase().includes(query)))
    : all;
  return { rows: matches.slice(page * 50, page * 50 + 50), count: matches.length, total: all.length, page };
}
