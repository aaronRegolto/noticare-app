// Shared helpers for the paymongo-* Edge Functions.

const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1';

function secretAuthHeader(): string {
  const secretKey = Deno.env.get('PAYMONGO_SECRET_KEY');
  if (!secretKey) throw new Error('PAYMONGO_SECRET_KEY is not configured');
  return `Basic ${btoa(`${secretKey}:`)}`;
}

export async function paymongoRequest<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${PAYMONGO_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: secretAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify({ data: { attributes: body } }) : undefined,
  });
  const json = await response.json();
  if (!response.ok) {
    const message = json?.errors?.[0]?.detail ?? `PayMongo request failed (${response.status})`;
    throw new Error(message);
  }
  return json as T;
}

/**
 * Resolves the calling user's id from the client's forwarded Supabase session
 * JWT (supabase.functions.invoke automatically sends the caller's Authorization
 * header). Uses the anon key against Supabase's auth endpoint rather than
 * trusting an unverified token.
 */
export async function requireUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer /i, '');
  if (!token) throw new Error('authentication required');

  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    },
  });
  if (!response.ok) throw new Error('authentication required');
  const user = await response.json();
  if (!user?.id) throw new Error('authentication required');
  return user.id as string;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
