// Creates a one-time QRPh payment for the chosen billing interval. QRPh has no
// PayMongo Subscription/recurring concept (confirmed against their docs) — the
// user scans the returned QR in their banking/e-wallet app, and a successful
// payment.paid webhook (see paymongo-webhook) grants Pro for that interval's
// length. There's no PayMongo Customer or Plan object involved in this flow;
// the amount is looked up from this function's own secrets (never trusted from
// the client) and the user id + interval travel via the Payment Intent's
// metadata so the webhook knows what to grant to whom.
//
// Required secrets: PAYMONGO_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
// PRICE_MONTHLY_CENTAVOS, PRICE_ANNUAL_CENTAVOS.

import { jsonResponse, paymongoRequest, requireUserId } from '../_shared/paymongo.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type CreateQrphPaymentBody = { interval: 'monthly' | 'annual' };
type PaymentIntentResponse = { data: { id: string } };
type AttachedPaymentIntentResponse = {
  data: {
    attributes: {
      status: string;
      next_action?: { code?: { image_url?: string } };
    };
  };
};

Deno.serve(async (req) => {
  try {
    const userId = await requireUserId(req);
    const body: CreateQrphPaymentBody = await req.json();
    if (body.interval !== 'monthly' && body.interval !== 'annual') {
      return jsonResponse({ error: 'interval must be "monthly" or "annual"' }, 400);
    }

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const reservationId = crypto.randomUUID();
    const { data: amountRows, error: reservationError } = await service.rpc('reserve_launch_subscription', {
      p_reservation_id: reservationId,
      p_user_id: userId,
      p_interval: body.interval,
    });
    if (reservationError) throw reservationError;
    const amount = typeof amountRows === 'number' ? amountRows : Number(amountRows);
    if (!amount || amount < 100) throw new Error('Unable to determine the subscription price.');

    const intent = await paymongoRequest<PaymentIntentResponse>('POST', '/payment_intents', {
      amount,
      currency: 'PHP',
      payment_method_allowed: ['qrph'],
      capture_type: 'automatic',
      description: `NotiCare Pro (${body.interval})`,
      metadata: { user_id: userId, interval: body.interval, launch_reservation_id: reservationId },
    });

    const paymentMethod = await paymongoRequest<{ data: { id: string } }>('POST', '/payment_methods', {
      type: 'qrph',
    });

    const attached = await paymongoRequest<AttachedPaymentIntentResponse>(
      'POST',
      `/payment_intents/${intent.data.id}/attach`,
      { payment_method: paymentMethod.data.id },
    );

    const qrImageUrl = attached.data.attributes.next_action?.code?.image_url;
    if (!qrImageUrl) {
      return jsonResponse({ error: 'PayMongo did not return a QR code for this payment.' }, 502);
    }

    return jsonResponse({ paymentIntentId: intent.data.id, qrImageUrl });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});
