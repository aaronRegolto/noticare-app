// Manual fallback for "I've paid, check now" on the paywall — the webhook is
// the source of truth for actually granting Pro (see paymongo-webhook), but
// QRPh codes expire in minutes and webhook delivery can lag, so this lets the
// client force an immediate re-check against PayMongo instead of only waiting.
// If the payment already succeeded, this grants Pro itself so the user doesn't
// have to wait on the webhook at all. The grant_pro_for_payment RPC grants each
// Payment Intent's term only once, so re-checking an old payment (or racing the
// webhook) can't extend Pro again.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, paymongoRequest, requireUserId } from '../_shared/paymongo.ts';

type CheckPaymentBody = { paymentIntentId: string };
type PaymentIntentResponse = {
  data: {
    id: string;
    attributes: {
      status: string;
      metadata?: { user_id?: string; interval?: string };
    };
  };
};

const intervalDays: Record<string, number> = { monthly: 30, annual: 365 };

Deno.serve(async (req) => {
  try {
    const userId = await requireUserId(req);
    const body: CheckPaymentBody = await req.json();
    if (!body.paymentIntentId) return jsonResponse({ error: 'paymentIntentId is required' }, 400);

    const intent = await paymongoRequest<PaymentIntentResponse>('GET', `/payment_intents/${body.paymentIntentId}`);
    const status = intent.data.attributes.status;
    if (status !== 'succeeded' && status !== 'paid') {
      return jsonResponse({ status });
    }

    const metadata = intent.data.attributes.metadata;
    if (metadata?.user_id !== userId) {
      return jsonResponse({ error: 'This payment does not belong to the current user.' }, 403);
    }
    const days = intervalDays[metadata?.interval ?? ''] ?? 30;

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: proExpiresAt, error } = await service.rpc('grant_pro_for_payment', {
      p_payment_intent_id: intent.data.id,
      p_user_id: userId,
      p_term_days: days,
    });
    if (error) throw error;

    return jsonResponse({ status: 'succeeded', proExpiresAt });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});
