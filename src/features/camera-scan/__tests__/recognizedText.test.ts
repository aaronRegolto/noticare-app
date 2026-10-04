import { evaluateThreat } from '@/src/features/detection';

import { joinRecognizedText } from '../recognizedText';

const join = (...blocks: string[][]) => joinRecognizedText(blocks.map((lines) => ({ lines })));

describe('joinRecognizedText', () => {
  it('joins the wrapped lines of one paragraph with a space', () => {
    expect(join(['Your GCash account is', 'suspended. Verify now', 'to avoid losing access.'])).toBe(
      'Your GCash account is suspended. Verify now to avoid losing access.',
    );
  });

  it('separates blocks with a blank line and skips empty ones', () => {
    expect(join(['GCash'], [], ['  '], ['Your account is', 'locked.'])).toBe('GCash\n\nYour account is locked.');
  });

  it('collapses whitespace inside lines', () => {
    expect(join(['Claim   your\tprize ', '  now'])).toBe('Claim your prize now');
  });

  it('returns an empty string when nothing was read', () => {
    expect(join()).toBe('');
    expect(join([], ['', '   '])).toBe('');
  });

  it('keeps a space after an ordinary sentence ending with a dot', () => {
    expect(join(['Salamat po.', 'Ingat kayo.'])).toBe('Salamat po. Ingat kayo.');
    expect(join(['Pay P5,000.00.', 'thank you'])).toBe('Pay P5,000.00. thank you');
    expect(join(['See the notes, e.g.', 'this one'])).toBe('See the notes, e.g. this one');
  });

  it('rejoins a word broken at its hyphen, including Tagalog prefixes', () => {
    expect(join(['Paki i-', 'click ang link para ma-', 'verify ang account mo'])).toBe(
      'Paki i-click ang link para ma-verify ang account mo',
    );
    expect(join(['a well-', 'known brand'])).toBe('a well-known brand');
  });

  it('keeps a lone dash between words', () => {
    expect(join(['GCash -', 'Account notice'])).toBe('GCash - Account notice');
  });

  it('rejoins a link split after a slash, hyphen, or query character', () => {
    expect(join(['Verify at https://gcash-', 'verify.xyz/login now'])).toBe(
      'Verify at https://gcash-verify.xyz/login now',
    );
    expect(join(['Claim: bit.ly/', 'claim-ayuda'])).toBe('Claim: bit.ly/claim-ayuda');
    expect(join(['Open http://x.top/a?id=', '42&ref=sms today'])).toBe('Open http://x.top/a?id=42&ref=sms today');
  });

  it('rejoins a link split right after a dot', () => {
    expect(join(['Go to www.gcash.', 'com.ph/login'])).toBe('Go to www.gcash.com.ph/login');
  });

  it('rejoins a link split mid-word', () => {
    expect(join(['Verify at https://gcash-ver', 'ify.xyz/login'])).toBe('Verify at https://gcash-verify.xyz/login');
  });

  it('does not glue the next word onto a complete link', () => {
    expect(join(['Click https://bit.ly/abc', 'now to claim'])).toBe('Click https://bit.ly/abc now to claim');
    expect(join(['Visit www.gcash.com.ph.', 'Thank you'])).toBe('Visit www.gcash.com.ph. Thank you');
  });

  it('caps the result at the Manual Scan input limit', () => {
    expect(join(['x'.repeat(8_000)], ['y'.repeat(8_000)])).toHaveLength(12_000);
  });

  it('gives the scanner the same result as the typed message when a link was split', () => {
    const typed = 'Your GCash account is suspended. Verify now at http://gcash-verify.xyz/login or lose access today.';
    const fromPhoto = join([
      'Your GCash account is suspended.',
      'Verify now at http://gcash-',
      'verify.xyz/login or lose access',
      'today.',
    ]);
    expect(fromPhoto).toBe(typed);
    expect(evaluateThreat(fromPhoto)).toEqual(evaluateThreat(typed));
  });
});
