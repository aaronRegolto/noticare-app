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
  console.warn(`[NotiCare] ${event}: ${name}`);
}
