#!/usr/bin/env node

/**
 * Simulates many app users hitting Supabase at once, to check whether the
 * real backend (not just the admin dashboard) holds up under a usage spike.
 *
 * What it does:
 *   1. Creates N synthetic auth users (service role, so no email confirmation
 *      needed) and signs each one in to get a real access token.
 *   2. Registers a device per user via register_device (the same RPC the app
 *      calls on launch).
 *   3. Fires concurrent record_threat_event + submit_scan_feedback calls per
 *      user, all tagged is_demo=true so they never touch real aggregates or
 *      the admin dashboard's Overview counts.
 *   4. Prints latency and error-rate stats.
 *   5. With --cleanup, deletes every synthetic user afterward. Deleting the
 *      auth user cascades through profiles -> devices -> threat_events /
 *      scan_feedback (all declared ON DELETE CASCADE), so this fully removes
 *      every row this script created.
 *
 * Requires environment variables (never commit these, never share the
 * service role key):
 *   SUPABASE_URL                - e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   - from Supabase dashboard -> Project Settings -> API
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/load-test-concurrent-users.js --users=50 --eventsPerUser=5 --cleanup
 */

const { createClient } = require('@supabase/supabase-js');

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? 'true'];
    }),
  );
  return {
    users: Number(args.users || 20),
    eventsPerUser: Number(args.eventsPerUser || 5),
    concurrency: Number(args.concurrency || 20),
    cleanup: args.cleanup === 'true',
  };
}

async function withConcurrency(items, limit, worker) {
  const results = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = { ok: true, value: await worker(items[current], current) };
      } catch (error) {
        results[current] = { ok: false, error: error?.message || String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function summarize(label, results, durations) {
  const failed = results.filter((r) => !r.ok);
  const sorted = [...durations].sort((a, b) => a - b);
  const pct = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
  console.log(`\n--- ${label} ---`);
  console.log(`  total: ${results.length}, ok: ${results.length - failed.length}, failed: ${failed.length}`);
  if (durations.length) {
    console.log(`  latency ms -> min: ${sorted[0]}, p50: ${pct(50)}, p95: ${pct(95)}, max: ${sorted[sorted.length - 1]}`);
  }
  if (failed.length) {
    const counts = {};
    for (const f of failed) counts[f.error] = (counts[f.error] || 0) + 1;
    console.log('  error breakdown:');
    for (const [msg, count] of Object.entries(counts)) console.log(`    (${count}x) ${msg}`);
  }
}

async function main() {
  const { users, eventsPerUser, concurrency, cleanup } = parseArgs();
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.');
    process.exit(1);
  }
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.error('Set SUPABASE_ANON_KEY (or EXPO_PUBLIC_SUPABASE_ANON_KEY) too, for the sign-in step.');
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();

  console.log(`Creating ${users} synthetic users...`);
  const created = await withConcurrency(
    Array.from({ length: users }, (_, i) => i),
    Math.min(concurrency, 10),
    async (i) => {
      const email = `loadtest-${runId}-${i}@noticare.test`;
      const password = `LoadTest!${runId}${i}`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      return { email, password, userId: data.user.id };
    },
  );
  const accounts = created.filter((r) => r.ok).map((r) => r.value);
  console.log(`Created ${accounts.length}/${users} users.`);
  summarize('user creation', created, []);

  console.log('Signing in and registering devices...');
  const sessions = await withConcurrency(accounts, concurrency, async (account) => {
    const client = createClient(url, anonKey);
    const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
    if (error) throw error;
    const deviceInstallId = crypto.randomUUID();
    const { data: device, error: deviceError } = await client.rpc('register_device', {
      p_installation_id: deviceInstallId,
      p_app_version: 'load-test',
      p_rule_version: '2026.09.10',
    });
    if (deviceError) throw deviceError;
    return { client, userId: account.userId, deviceId: device.id };
  });
  const ready = sessions.filter((r) => r.ok).map((r) => r.value);
  console.log(`Ready: ${ready.length}/${accounts.length} sessions with a registered device.`);
  summarize('sign-in + device registration', sessions, []);

  console.log(`Firing ${eventsPerUser} events per user (${ready.length * eventsPerUser} total, concurrency=${concurrency})...`);
  const jobs = [];
  for (const session of ready) {
    for (let i = 0; i < eventsPerUser; i++) jobs.push(session);
  }
  const durations = [];
  const eventResults = await withConcurrency(jobs, concurrency, async (session) => {
    const started = Date.now();
    const level = ['safe', 'suspicious', 'dangerous'][Math.floor(Math.random() * 3)];
    const { error } = await session.client.rpc('record_threat_event', {
      p_client_event_id: crypto.randomUUID(),
      p_device_id: session.deviceId,
      p_source: 'manual',
      p_threat_level: level,
      p_score_bucket: level === 'dangerous' ? 9 : level === 'suspicious' ? 4 : 1,
      p_blocked: false,
      p_indicator_codes: ['urgency-pressure'],
      p_url_count: 0,
      p_rule_version: '2026.09.10',
      p_occurred_at: new Date().toISOString(),
      p_is_demo: true,
    });
    durations.push(Date.now() - started);
    if (error) throw error;
  });
  summarize('record_threat_event load', eventResults, durations);

  if (cleanup) {
    console.log('\nCleaning up synthetic users (cascades to profiles/devices/threat_events)...');
    const cleanupResults = await withConcurrency(accounts, Math.min(concurrency, 10), async (account) => {
      const { error } = await admin.auth.admin.deleteUser(account.userId);
      if (error) throw error;
    });
    summarize('cleanup', cleanupResults, []);
  } else {
    console.log(`\nSkipped cleanup. Re-run with --cleanup, or delete manually later with:`);
    console.log(`  delete from public.threat_events where is_demo = true;`);
    console.log(`  (and delete the ${accounts.length} loadtest-${runId}-* auth users from Supabase Auth if you want them gone too)`);
  }
}

main().catch((error) => {
  console.error('Load test failed:', error);
  process.exit(1);
});
