import { joinTranslatedSegments, planTranslation, splitForTranslation } from '../messageTranslation';

describe('splitForTranslation', () => {
  it('keeps links exactly as received and translates the words around them', () => {
    expect(splitForTranslation('Verify now at http://gcash-verify.xyz/login or lose access.')).toEqual([
      { text: 'Verify now at ', translate: true },
      { text: 'http://gcash-verify.xyz/login', translate: false },
      { text: ' or lose access.', translate: true },
    ]);
  });

  it('keeps bare domains, short links, and emails', () => {
    const kept = (text: string) =>
      splitForTranslation(text)
        .filter((segment) => !segment.translate)
        .map((segment) => segment.text);
    expect(kept('I-click ang bit.ly/claim-ayuda ngayon')).toEqual(['bit.ly/claim-ayuda']);
    expect(kept('Visit www.gcash.com.ph today')).toEqual(['www.gcash.com.ph']);
    expect(kept('Email support@bdo-secure.xyz now')).toEqual(['support@bdo-secure.xyz']);
    expect(kept('Go to bdo-secure-online.xyz.')).toEqual(['bdo-secure-online.xyz']);
  });

  it('leaves ordinary text, amounts, and abbreviations as one translatable segment', () => {
    expect(splitForTranslation('Pay P5,000.00 today, e.g. at the mall.')).toEqual([
      { text: 'Pay P5,000.00 today, e.g. at the mall.', translate: true },
    ]);
    expect(splitForTranslation('')).toEqual([]);
  });

  it('round-trips the original text when nothing is translated', () => {
    const message = 'Claim at https://x.top/a?id=1, or text 09171234567 (support@x.ph).';
    const segments = splitForTranslation(message);
    const untouched = segments.filter((segment) => segment.translate).map((segment) => segment.text);
    expect(joinTranslatedSegments(segments, untouched)).toBe(message);
  });
});

describe('planTranslation', () => {
  it('never translates in Default', () => {
    expect(planTranslation('en', 'default')).toBeNull();
    expect(planTranslation('fil', 'default')).toBeNull();
  });

  it('skips messages already in the chosen language, including ML Kit\'s "fil" for Tagalog', () => {
    expect(planTranslation('en', 'en')).toBeNull();
    expect(planTranslation('fil', 'tl')).toBeNull();
    expect(planTranslation('tl', 'tl')).toBeNull();
  });

  it('skips messages whose language is undetermined', () => {
    expect(planTranslation('und', 'tl')).toBeNull();
  });

  it('translates from the other language, including Taglish detected as something else', () => {
    expect(planTranslation('en', 'tl')).toEqual({ source: 'en', target: 'tl' });
    expect(planTranslation('fil', 'en')).toEqual({ source: 'tl', target: 'en' });
    expect(planTranslation('id', 'en')).toEqual({ source: 'tl', target: 'en' });
    expect(planTranslation('id', 'tl')).toEqual({ source: 'en', target: 'tl' });
  });
});

describe('joinTranslatedSegments', () => {
  it('puts translations back around the kept link with the original spacing', () => {
    const segments = splitForTranslation('Verify now at http://gcash-verify.xyz/login or lose access.');
    expect(joinTranslatedSegments(segments, ['I-verify ngayon sa', 'o mawawalan ng access.'])).toBe(
      'I-verify ngayon sa http://gcash-verify.xyz/login o mawawalan ng access.',
    );
  });

  it('falls back to the original wording for a missing translation', () => {
    const segments = splitForTranslation('Hello http://x.top bye');
    expect(joinTranslatedSegments(segments, ['Kumusta'])).toBe('Kumusta http://x.top bye');
  });
});
