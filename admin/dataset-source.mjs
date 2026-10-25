import { parseCsv } from './datasets.mjs';

export const PH_SMS_SOURCE = 'Local_PH_SMS_spam';
const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 10_000;
const MAX_MESSAGE_LENGTH = 20_000;
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });

export function parseSourceRows(csv) {
  if (typeof csv !== 'string') throw invalid('CSV content is required.');
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) throw invalid('CSV exceeds the 10 MB upload limit.', 413);

  const parsed = parseCsv(csv);
  if (!parsed.length) throw invalid('CSV must contain a header and at least one data row.');
  if (parsed.length > MAX_ROWS) throw invalid(`CSV may contain at most ${MAX_ROWS.toLocaleString()} rows.`);
  if (Object.keys(parsed[0]).sort().join(',') !== 'label,text')
    throw invalid('CSV must contain exactly these columns: text,label.');

  return parsed.map((row, index) => {
    const text = row.text;
    const label = row.label.trim();
    if (text.length > MAX_MESSAGE_LENGTH)
      throw invalid(`CSV row ${index + 2} exceeds the ${MAX_MESSAGE_LENGTH.toLocaleString()}-character message limit.`);
    if (label !== '0' && label !== '1') throw invalid(`CSV row ${index + 2} has an unsupported label. Use 0 or 1.`);
    return {
      source: PH_SMS_SOURCE,
      row_index: index + 1,
      message_text: text,
      label,
    };
  });
}
