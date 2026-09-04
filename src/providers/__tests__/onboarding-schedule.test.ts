import { isTutorialDue, TUTORIAL_REPEAT_INTERVAL_MS } from '../onboarding-schedule';

describe('tutorial schedule', () => {
  const now = 1_800_000_000_000;

  it('is due when it has never been completed', () => {
    expect(isTutorialDue(null, now)).toBe(true);
  });

  it('stays hidden until 20 hours have passed', () => {
    const nextTutorialAt = String(now + TUTORIAL_REPEAT_INTERVAL_MS);

    expect(isTutorialDue(nextTutorialAt, now)).toBe(false);
    expect(isTutorialDue(nextTutorialAt, now + TUTORIAL_REPEAT_INTERVAL_MS - 1)).toBe(false);
    expect(isTutorialDue(nextTutorialAt, now + TUTORIAL_REPEAT_INTERVAL_MS)).toBe(true);
  });

  it('is due when stored schedule data is invalid', () => {
    expect(isTutorialDue('not-a-date', now)).toBe(true);
  });
});
