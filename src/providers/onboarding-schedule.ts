export const TUTORIAL_REPEAT_INTERVAL_MS = 20 * 60 * 60 * 1000;

export function isTutorialDue(nextTutorialAt: string | null, now = Date.now()) {
  if (!nextTutorialAt) return true;

  const timestamp = Number(nextTutorialAt);
  return !Number.isFinite(timestamp) || timestamp <= now;
}
