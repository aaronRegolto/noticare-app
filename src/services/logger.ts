/**
 * Small privacy-safe logger. Never pass SMS text, sender details, URLs, OTPs,
 * tokens, or native notification payloads into this module.
 */
export function logDiagnostic(event: string, detail?: Record<string, string | number | boolean | null | undefined>) {
  if (!__DEV__) return;
  const safeDetail = detail
    ? Object.fromEntries(
        Object.entries(detail).filter(([key]) => !/(message|text|sender|url|token|otp|phone)/i.test(key)),
      )
    : undefined;
  console.info(`[NotiCare] ${event}`, safeDetail ?? '');
}

export function logError(event: string, error: unknown) {
  if (!__DEV__) return;
  const name = error instanceof Error ? error.name : 'UnknownError';
  // Supabase/PostgREST errors are plain objects with a code and a server-written message; both
  // describe the failure, not the user's data, and are what make a failed sync diagnosable.
  const detail = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : {};
  const code = typeof detail.code === 'string' ? ` code=${detail.code}` : '';
  const message = typeof detail.message === 'string' ? ` ${detail.message.slice(0, 160)}` : '';
  console.warn(`[NotiCare] ${event}: ${name}${code}${message}`);
}
