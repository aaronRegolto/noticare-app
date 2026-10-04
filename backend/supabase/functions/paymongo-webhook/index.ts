// Receives PayMongo payment events and grants Pro for a fixed term (QRPh has
// no recurring/subscription concept — see paymongo-create-qrph-payment). This
// is the primary path to granting Pro; paymongo-check-payment is a client-side
// fallback for when this is slow to arrive, and does the identical grant.
// Both go through the grant_pro_for_payment RPC, which grants each Payment
// Intent's term only once, so retries and the fallback can't stack.
//
// Signature verification per docs.paymongo.com/docs/developer-tools-webhook-setup-management:
// the `Paymongo-Signature` header is `t=<timestamp>,te=<test-sig>,li=<live-sig>`;
// the expected signature is HMAC-SHA256("<timestamp>.<raw body>") using the
// webhook's own secret_key (from `POST /v1/webhooks`, not the account's API key).
//
// Required secrets: PAYMONGO_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type PaymongoWebhookEvent = {
  data: {
    attributes: {
      type: string;
      data: {
        attributes: {
          payment_intent_id?: string;
          metadata?: { user_id?: string; interval?: string };
        };
      };
    };
  };
};

const intervalDays: Record<string, number> = { monthly: 30, annual: 365 };

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseSignatureHeader(header: string): { timestamp: string; test?: string; live?: string } {
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key.trim(), value?.trim()];
    }),
  );
  return { timestamp: parts.t, test: parts.te, live: parts.li };
}

Deno.serve(async (req) => {
  const webhookSecret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET');
  const signatureHeader = req.headers.get('Paymongo-Signature');
  const rawBody = await req.text();

  if (!webhookSecret || !signatureHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { timestamp, test, live } = parseSignatureHeader(signatureHeader);
  const expected = await hmacSha256Hex(webhookSecret, `${timestamp}.${rawBody}`);
  if (expected !== test && expected !== live) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event: PaymongoWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventType = event.data?.attributes?.type;
  if (eventType !== 'payment.paid') {
    // qrph.expired and payment.failed need no action: an unpaid/expired QR
    // simply never grants Pro, and the paywall lets the user try again.
    return new Response('OK', { status: 200 });
  }

  // PayMongo copies the Payment Intent's metadata onto the Payment, so it sits
  // at data.attributes.data.attributes.metadata (confirmed against a live
  // payment.paid payload on 2026-10-04).
  console.log('paymongo-webhook received:', rawBody);
  const payment = event.data.attributes.data.attributes;
  const paymentIntentId = payment.payment_intent_id;
  const userId = payment.metadata?.user_id;
  const days = intervalDays[payment.metadata?.interval ?? ''];
  if (!paymentIntentId || !userId || !days) return new Response('OK', { status: 200 });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await supabase.rpc('grant_pro_for_payment', {
    p_payment_intent_id: paymentIntentId,
    p_user_id: userId,
    p_term_days: days,
  });

  if (error) {
    console.error('paymongo-webhook: failed to grant Pro', error);
    return new Response('Internal error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
