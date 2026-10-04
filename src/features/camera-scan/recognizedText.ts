/** One paragraph of text read from a photo, as wrapped on screen (from the native text recognizer). */
export type RecognizedTextBlock = { lines: string[] };

/** Manual Scan's input limit. */
const MAX_CHARACTERS = 12_000;

const STARTS_LINK = /^(?:https?:\/\/|www\.)/i;

/** "http://…", "www.…", or a domain with a path such as "bit.ly/abc". */
function isLink(token: string): boolean {
  return STARTS_LINK.test(token) || /[a-z0-9-]\.[a-z]{2,}\//i.test(token);
}

/**
 * Whether two wrapped lines of one paragraph join without a space. True for a word broken at its
 * hyphen ("I-" + "click", "mag-" + "verify") and for a link split across lines ("bit.ly/" + "abc",
 * "https://gcash-ver" + "ify.xyz"). Kept conservative so an ordinary sentence still gets a space.
 */
function joinsWithoutSpace(line: string, next: string): boolean {
  const last = line.slice(line.lastIndexOf(' ') + 1);
  const first = next.split(' ', 1)[0];
  if (!last || !first) return false;
  // A lone "-" is a dash between words, not a hyphenated word.
  if (last.length > 1 && last.endsWith('-')) return true;
  if (!isLink(last)) return false;
  if (/[/_=?&#%~]$/.test(last)) return true;
  // "www.gcash." + "com.ph/login": a link broken right after a dot, continued in lowercase.
  if (last.endsWith('.')) return /^[a-z0-9]/.test(first);
  // "https://gcash-ver" + "ify.xyz/login": a link broken mid-word, continued by more of an address.
  return STARTS_LINK.test(last) && /^[a-z0-9]\S*[./]\S*$/.test(first);
}

/**
 * Turns the recognizer's blocks into Manual Scan text. Lines inside a block are wrapped pieces of
 * one paragraph, so they join with a space (or nothing, see joinsWithoutSpace); blocks are
 * separated by a blank line.
 */
export function joinRecognizedText(blocks: readonly RecognizedTextBlock[]): string {
  const paragraphs: string[] = [];
  for (const block of blocks) {
    const lines = block.lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (lines.length === 0) continue;
    let paragraph = lines[0];
    for (let index = 1; index < lines.length; index++) {
      paragraph += joinsWithoutSpace(lines[index - 1], lines[index]) ? lines[index] : ` ${lines[index]}`;
    }
    paragraphs.push(paragraph);
  }
  return paragraphs.join('\n\n').slice(0, MAX_CHARACTERS).trim();
}
