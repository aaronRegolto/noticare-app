export const AUTH_SERVER_FAILURE_MESSAGE =
  "We couldn't send or check the code right now. Please try again in a few minutes.";

/**
 * True when the sign-in service itself failed (a 5xx, e.g. the SMS hook rejected the request),
 * as opposed to a problem with what the user typed. supabase-js sometimes reports these with the
 * raw response serialized as the message, which must never be shown on screen.
 */
export function isAuthServerFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 500) return true;
  return error.message.trimStart().startsWith('{');
}
