import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/src/services/supabase';

export const isPaymongoConfigured = true;

export type BillingInterval = 'monthly' | 'annual';

export type QrphPayment = { paymentIntentId: string; qrImageUrl: string };

/**
 * supabase-js's `invoke` only ever throws a generic "Edge Function returned a
 * non-2xx status code" — the actual `{ error: "..." }` body our functions
 * return on failure is on the error's `context` (the raw Response) and has to
 * be read separately, or every failure looks identical to the user.
 */
async function describeFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Response body wasn't JSON — fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

/** Creates a one-time QRPh payment for the given billing interval. Returns a QR image to display. */
export async function createQrphPayment(interval: BillingInterval): Promise<QrphPayment> {
  const { data, error } = await supabase.functions.invoke<QrphPayment & { error?: string }>(
    'paymongo-create-qrph-payment',
    { body: { interval } },
  );
  if (error) throw new Error(await describeFunctionError(error));
  if (data?.error) throw new Error(data.error);
  if (!data?.qrImageUrl) throw new Error('PayMongo did not return a QR code.');
  return data;
}

export type CheckPaymentResult = { status: string; proExpiresAt?: string };

/** Manual "I've paid" fallback — forces an immediate re-check instead of only waiting on the webhook. */
export async function checkPayment(paymentIntentId: string): Promise<CheckPaymentResult> {
  const { data, error } = await supabase.functions.invoke<CheckPaymentResult & { error?: string }>(
    'paymongo-check-payment',
    { body: { paymentIntentId } },
  );
  if (error) throw new Error(await describeFunctionError(error));
  if (data?.error) throw new Error(data.error);
  if (!data) throw new Error('No response checking the payment.');
  return data;
}
