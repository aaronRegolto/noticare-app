// Supabase Auth "Send SMS" hook: delivers sign-in and phone-change codes through
// Semaphore (semaphore.co), a Philippine SMS provider that Supabase's built-in
// provider list does not include.
//
// Supabase generates the code itself and posts it here; this function only
// delivers it. Hook requests are signed per the Standard Webhooks spec
// (webhook-id / webhook-timestamp / webhook-signature headers, HMAC-SHA256
// with the hook secret), and anything unsigned is rejected, so this endpoint
// cannot be used to send arbitrary texts on NotiCare's Semaphore credit.
//
// Deploy with JWT verification off (the hook authenticates with its signature,
// not a user JWT):
//   npx supabase functions deploy send-sms-semaphore --no-verify-jwt --workdir backend
//
// Required secrets:
//   SEND_SMS_HOOK_SECRET  the hook secret from Authentication > Hooks (v1,whsec_...)
//   SEMAPHORE_API_KEY     from the Semaphore dashboard
// Optional:
//   SEMAPHORE_SENDER_NAME an approved Semaphore sender name, e.g. NOTICARE

type SendSmsPayload = {
  user: { phone?: string };
  sms: { otp: string };
};

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const SEMAPHORE_OTP_URL = 'https://api.semaphore.co/api/v4/otp';
// Semaphore replaces {otp} with the `code` parameter. The warning matters on an anti-scam app:
// scammers routinely ask people to read these codes back to them.
const MESSAGE = 'Your NotiCare code is {otp}. It expires in 5 minutes. Never share this code with anyone.';

function hookError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// The return type is inferred on purpose: newer TypeScript types this as Uint8Array<ArrayBuffer>,
// which crypto.subtle.importKey requires, and a plain `: Uint8Array` annotation widens it away.
function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(secret.replace(/^v1,whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = bytesToBase64(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );
  // The header can carry several space-separated "v1,<signature>" entries (during secret rotation).
  return signatures
    .split(' ')
    .map((entry) => entry.split(',')[1] ?? '')
    .some((signature) => constantTimeEqual(signature, expected));
}

/** Semaphore only delivers to Philippine mobile numbers: 639XXXXXXXXX. */
function philippineMobile(phone: string | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return /^639\d{9}$/.test(digits) ? digits : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return hookError(405, 'Method not allowed');

  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const apiKey = Deno.env.get('SEMAPHORE_API_KEY');
  if (!hookSecret || !apiKey) {
    console.error('send-sms-semaphore: SEND_SMS_HOOK_SECRET or SEMAPHORE_API_KEY is not set');
    return hookError(500, 'SMS delivery is not configured.');
  }

  const body = await req.text();
  if (!(await verifySignature(hookSecret, req.headers, body))) return hookError(401, 'Invalid signature');

  let payload: SendSmsPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return hookError(400, 'Invalid JSON');
  }

  const number = philippineMobile(payload.user?.phone);
  if (!number) return hookError(400, 'NotiCare can only send codes to Philippine mobile numbers.');
  if (!/^\d{4,10}$/.test(payload.sms?.otp ?? '')) return hookError(400, 'Invalid code');

  const form = new URLSearchParams({ apikey: apiKey, number, message: MESSAGE, code: payload.sms.otp });
  const senderName = Deno.env.get('SEMAPHORE_SENDER_NAME');
  if (senderName) form.set('sendername', senderName);

  let response: Response;
  try {
    response = await fetch(SEMAPHORE_OTP_URL, { method: 'POST', body: form });
  } catch (error) {
    console.error('send-sms-semaphore: Semaphore unreachable', error);
    return hookError(502, 'Could not reach the SMS provider. Try again.');
  }

  // Success is a JSON array with one entry per message; errors come back as an object or string.
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result) || result.length === 0) {
    // Logged without the API key or the code.
    console.error('send-sms-semaphore: Semaphore rejected the message', response.status, JSON.stringify(result));
    return hookError(502, 'The SMS provider could not send the code. Try again.');
  }

  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
});
