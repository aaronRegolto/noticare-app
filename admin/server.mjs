import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { datasetCatalog, datasetRows, importDataset } from './datasets.mjs';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const tables = {
  threat_events: 'occurred_at',
  scan_feedback: 'created_at',
  profiles: 'created_at',
  devices: 'last_seen_at',
  community_daily_stats: 'bucket_date',
  community_hourly_stats: 'bucket_start',
  rule_sets: 'published_at',
};
const client = (token) =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: token ? { Authorization: token } : {} },
  });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function signInError(error) {
  const messages = {
    invalid_credentials:
      'Email or password was not recognized. Use an email/password user from this project’s Authentication → Users, not your Supabase website login.',
    email_not_confirmed:
      'Confirm this account’s email before signing in. Check the user in Supabase Authentication → Users.',
    email_provider_disabled: 'Email/password authentication is disabled in this Supabase project.',
    captcha_failed:
      'Supabase requires CAPTCHA verification. This dashboard needs CAPTCHA integration before this account can sign in.',
    user_banned: 'This account is suspended. Contact the project administrator.',
  };
  if (error.status === 429) return fail('Too many sign-in attempts. Wait a few minutes before trying again.', 429);
  if (error.name === 'AuthRetryableFetchError' || error.status >= 500)
    return fail('Supabase authentication is temporarily unavailable. Check connectivity and try again.', 503);
  return fail(
    messages[error.code] || 'Supabase could not sign you in. Check Authentication logs in your project for details.',
    401,
  );
}
/**
 * Pushes newly inserted, non-demo Suspicious/Dangerous threat_events rows to the browser the
 * instant `record_threat_event` commits them, via a per-connection Supabase Realtime subscription
 * authorized as the requesting admin's own JWT — the same RLS ("admins can read all rows") that
 * already governs /api/records applies here too, so this can never surface rows that admin
 * couldn't already read over REST. Requires the `threat_events` table to be added to the
 * `supabase_realtime` publication (see the 20260917000100 migration); if that migration has not
 * been applied yet, the subscription simply never receives events (fails open to "no live
 * updates", not to broader access).
 */
function streamDiscoveries(req, res, accessToken) {
  const realtime = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    accessToken: async () => accessToken,
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  res.write('retry: 5000\n\n');

  const channel = realtime
    .channel(`admin-discoveries-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'threat_events', filter: 'is_demo=eq.false' },
      (payload) => {
        const row = payload.new;
        if (!['suspicious', 'dangerous'].includes(row?.threat_level)) return;
        res.write(`event: discovery\ndata: ${JSON.stringify(row)}\n\n`);
      },
    )
    .subscribe();

  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  const cleanup = () => {
    clearInterval(heartbeat);
    void realtime.removeChannel(channel);
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
}

async function body(req, limit = 8192) {
  const chunks = [];
  let length = 0;
  for await (const part of req) {
    length += part.length;
    if (length > limit) throw fail('Request too large', 413);
    chunks.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw fail('Invalid JSON');
  }
}
export const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  const send = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  try {
    const path = new URL(req.url, 'http://localhost');
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}` &&
      req.headers.origin !== `https://${req.headers.host}`
    )
      throw fail('Origin not allowed', 403);
    if (req.method === 'GET' && ['/', '/app.js', '/styles.css'].includes(path.pathname)) {
      const name = path.pathname === '/' ? 'index.html' : path.pathname.slice(1);
      const content = await readFile(new URL(`./public/${name}`, import.meta.url));
      res.writeHead(200, {
        'Content-Type': name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript',
      });
      return res.end(content);
    }
    if (path.pathname === '/api/model' && req.method === 'GET')
      return send(JSON.parse(await readFile(new URL('../assets/models/model_metadata.json', import.meta.url), 'utf8')));
    if (path.pathname === '/api/config' && req.method === 'GET') return send({ configured: Boolean(url && key) });
    if (!path.pathname.startsWith('/api/')) throw fail('Not found', 404);
    if (!url || !key)
      throw fail('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the root .env, then restart.', 503);
    if (path.pathname === '/api/login' && req.method === 'POST') {
      const { email, password } = await body(req);
      if (typeof email !== 'string' || typeof password !== 'string') throw fail('Email and password are required');
      const { data, error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw signInError(error);
      const db = client(`Bearer ${data.session.access_token}`);
      const access = await db.rpc('is_admin');
      if (access.error || access.data !== true)
        throw fail('Admin access required. Apply the admin migration and add your user ID to admin_users.', 403);
      return send({ token: data.session.access_token, expiresAt: data.session.expires_at, userId: data.user.id });
    }
    if (path.pathname === '/api/stream/discoveries' && req.method === 'GET') {
      // EventSource cannot set an Authorization header, so the token travels as a query
      // parameter instead. It is validated the same way (is_admin) as every other endpoint and
      // is never logged; nothing here differs from the REST access-control model above.
      const streamToken = path.searchParams.get('token');
      if (!streamToken) throw fail('Sign in to continue', 401);
      const db = client(`Bearer ${streamToken}`);
      const access = await db.rpc('is_admin');
      if (access.error || access.data !== true)
        throw fail('Session expired or admin access unavailable. Sign in again.', 403);
      return streamDiscoveries(req, res, streamToken);
    }
    if (!req.headers.authorization?.startsWith('Bearer ')) throw fail('Sign in to continue', 401);
    const db = client(req.headers.authorization);
    const access = await db.rpc('is_admin');
    if (access.error || access.data !== true)
      throw fail('Session expired or admin access unavailable. Sign in again.', 403);
    if (path.pathname === '/api/datasets/import' && req.method === 'POST')
      return send(await importDataset(await body(req, 20 * 1024 * 1024)), 201);
    if (req.method !== 'GET') throw fail('Read-only endpoint', 405);
    if (path.pathname === '/api/datasets') return send(await datasetCatalog());
    if (path.pathname === '/api/dataset-rows') return send(await datasetRows(path.searchParams));
    if (path.pathname === '/api/reported-messages') {
      const page = Number(path.searchParams.get('page') || 0);
      if (!Number.isSafeInteger(page) || page < 0 || page > 1000000) throw fail('Invalid page');
      const search = (path.searchParams.get('q') || '').trim();
      if (search.length > 200) throw fail('Search must be 200 characters or fewer.');
      let query = db
        .from('viral_phishing_reports')
        .select(
          'id,message_text,indicator_codes,rule_version,report_count,viral_score,first_reported_at,last_reported_at',
          { count: 'exact' },
        )
        .order('last_reported_at', { ascending: false })
        .order('id');
      if (search) query = query.ilike('message_text', `%${search.replace(/[\\%_]/g, '\\$&')}%`);
      const { data, count, error } = await query.range(page * 50, page * 50 + 49);
      if (error) throw fail('Could not load reported messages. Apply the admin report-access migration and try again.', 502);
      return send({ rows: data, count, page });
    }
    if (path.pathname === '/api/connection') {
      const checks = await Promise.all(
        ['profiles', 'devices', 'threat_events', 'scan_feedback', 'rule_sets'].map(async (table) => {
          const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
          return { table, status: error ? 'Unavailable' : 'Connected', records: error ? null : count };
        }),
      );
      const latest = await db
        .from('threat_events')
        .select('received_at,source,rule_version')
        .eq('is_demo', false)
        .order('received_at', { ascending: false })
        .limit(1);
      if (latest.error) throw fail('Could not verify latest uploaded event.', 502);
      return send({ project: new URL(url).hostname, checks, latest: latest.data[0] || null });
    }
    if (path.pathname === '/api/overview') {
      const definitions = {
        scans: {},
        safe: { threat_level: 'safe' },
        suspicious: { threat_level: 'suspicious' },
        dangerous: { threat_level: 'dangerous' },
        blocked: { blocked: true },
      };
      const values = await Promise.all(
        Object.entries(definitions).map(async ([name, filters]) => {
          let q = db.from('threat_events').select('id', { count: 'exact', head: true }).eq('is_demo', false);
          for (const [field, value] of Object.entries(filters)) q = q.eq(field, value);
          const { count, error } = await q;
          if (error) throw fail('Could not load overview. Check database migrations and connectivity.', 502);
          return [name, count];
        }),
      );
      return send(Object.fromEntries(values));
    }
    if (path.pathname === '/api/records') {
      const table = path.searchParams.get('table');
      if (!Object.hasOwn(tables, table)) throw fail('Unknown table');
      const page = Number(path.searchParams.get('page') || 0);
      if (!Number.isSafeInteger(page) || page < 0 || page > 1000000) throw fail('Invalid page');
      const discoveries = table === 'threat_events' && path.searchParams.get('discoveries') === 'true';
      const dateColumn = discoveries ? 'received_at' : tables[table];
      let q = db.from(table).select('*', { count: 'exact' }).order(dateColumn, { ascending: false });
      if (discoveries) q = q.in('threat_level', ['suspicious', 'dangerous']).eq('is_demo', false);
      const secondary =
        table === 'profiles'
          ? 'user_id'
          : table === 'rule_sets'
            ? 'version'
            : ['threat_events', 'scan_feedback', 'devices'].includes(table)
              ? 'id'
              : null;
      if (secondary) q = q.order(secondary);
      const level = path.searchParams.get('level');
      if (level && ['threat_events', 'scan_feedback'].includes(table)) {
        if (!['safe', 'suspicious', 'dangerous'].includes(level)) throw fail('Invalid classification');
        q = q.eq(table === 'threat_events' ? 'threat_level' : 'expected_level', level);
      }
      if (table === 'threat_events' && path.searchParams.get('demo') !== 'true') q = q.eq('is_demo', false);
      for (const field of ['from', 'to']) {
        const date = path.searchParams.get(field);
        if (date) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw fail('Invalid date');
          q =
            field === 'from'
              ? q.gte(dateColumn, date)
              : q.lt(dateColumn, new Date(Date.parse(date) + 86400000).toISOString());
        }
      }
      const { data, count, error } = await q.range(page * 50, page * 50 + 49);
      if (error) throw fail('Could not load records. Check database migrations and connectivity.', 502);
      return send({ rows: data, count, page });
    }
    throw fail('Not found', 404);
  } catch (error) {
    send({ error: error.status ? error.message : 'The server could not complete the request.' }, error.status || 500);
  }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || process.env.ADMIN_PORT || 4173);
  // Local dev stays loopback-only by default; set ADMIN_HOST=0.0.0.0 to accept
  // connections from outside the machine (required behind a PaaS/proxy).
  const host = process.env.ADMIN_HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`NotiCare Admin: http://${host}:${port}`));
}
