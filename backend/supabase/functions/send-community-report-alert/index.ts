import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type OutboxRow = {
  event_id: string;
  reporter_id: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempt_count: number;
  updated_at: string;
};

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

const expoPushEndpoint = 'https://exp.host/--/api/v2/push/send';
const pushBatchSize = 100;
const staleClaimMs = 5 * 60 * 1000;
const maxReportsPerHour = 20;

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userResult, error: authError } = await userClient.auth.getUser();
  if (authError || !userResult.user) return new Response('Unauthorized', { status: 401 });

  let eventId: string;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('eventId' in body) || typeof body.eventId !== 'string') {
      return new Response('Invalid event id', { status: 400 });
    }
    eventId = body.eventId;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    return new Response('Invalid event id', { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: outbox, error: outboxError } = await admin
    .from('community_notification_outbox')
    .select('event_id, reporter_id, status, attempt_count, updated_at')
    .eq('event_id', eventId)
    .maybeSingle<OutboxRow>();
  if (outboxError) {
    console.error('community alert lookup failed', outboxError);
    return new Response('Unable to load community alert', { status: 500 });
  }
  if (!outbox || outbox.reporter_id !== userResult.user.id) return new Response('Not found', { status: 404 });
  if (outbox.status === 'sent') return Response.json({ sent: true, duplicate: true });

  const sentSince = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentAlerts, error: rateLimitError } = await admin
    .from('community_notification_outbox')
    .select('event_id', { count: 'exact', head: true })
    .eq('reporter_id', userResult.user.id)
    .eq('status', 'sent')
    .gte('sent_at', sentSince);
  if (rateLimitError) {
    console.error('community alert rate-limit check failed', rateLimitError);
    return new Response('Unable to verify community alert limit', { status: 500 });
  }
  if ((recentAlerts ?? 0) >= maxReportsPerHour) {
    return new Response('Community alert limit reached; it can be retried later.', { status: 429 });
  }

  const staleBefore = new Date(Date.now() - staleClaimMs).toISOString();
  const canRetrySending =
    outbox.status === 'sending' && new Date(outbox.updated_at).getTime() < Date.now() - staleClaimMs;
  if (outbox.status === 'sending' && !canRetrySending) {
    return new Response('Alert is already being sent', { status: 202 });
  }

  const claimUpdate = {
    status: 'sending',
    attempt_count: outbox.attempt_count + 1,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const claimResult = canRetrySending
    ? await admin
        .from('community_notification_outbox')
        .update(claimUpdate)
        .eq('event_id', eventId)
        .eq('reporter_id', userResult.user.id)
        .eq('status', 'sending')
        .lt('updated_at', staleBefore)
        .select('event_id')
        .maybeSingle()
    : await admin
        .from('community_notification_outbox')
        .update(claimUpdate)
        .eq('event_id', eventId)
        .eq('reporter_id', userResult.user.id)
        .in('status', ['pending', 'failed'])
        .select('event_id')
        .maybeSingle();
  const { data: claimed, error: claimError } = claimResult;

  if (claimError) {
    console.error('community alert claim failed', claimError);
    return new Response('Unable to claim community alert', { status: 500 });
  }
  if (!claimed) {
    return new Response('Alert is already being sent', { status: 202 });
  }

  try {
    const tokens: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin
        .from('community_push_tokens')
        .select('expo_push_token')
        .neq('user_id', userResult.user.id)
        .order('expo_push_token')
        .range(offset, offset + 999);
      if (error) throw new Error('Unable to load notification recipients.');
      tokens.push(...(data ?? []).map((row) => row.expo_push_token));
      if (!data || data.length < 1000) break;
    }

    for (let offset = 0; offset < tokens.length; offset += pushBatchSize) {
      const batch = tokens.slice(offset, offset + pushBatchSize);
      const messages = batch.map((token) => ({
        to: token,
        title: 'New community report',
        body: 'A suspicious message was reported. Tap to view the anonymous sender and received time.',
        sound: 'default',
        channelId: 'community-reports',
        data: { screen: 'community', reportEventId: eventId },
      }));
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const response = await fetch(expoPushEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });
      if (!response.ok) throw new Error(`Expo Push Service returned ${response.status}.`);

      const result: { data?: ExpoTicket[] } = await response.json();
      if (!Array.isArray(result.data) || result.data.length !== batch.length) {
        throw new Error('Expo Push Service returned an invalid ticket response.');
      }
      for (const [index, ticket] of result.data.entries()) {
        if (ticket.status !== 'error') continue;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const { error: deleteError } = await admin
            .from('community_push_tokens')
            .delete()
            .eq('expo_push_token', batch[index]);
          if (deleteError) throw new Error('Unable to remove an expired notification token.');
        } else {
          throw new Error(`Expo rejected a community alert (${ticket.details?.error ?? 'unknown error'}).`);
        }
      }
    }

    const { error: completeError } = await admin
      .from('community_notification_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('event_id', eventId);
    if (completeError) throw new Error('Unable to complete community alert delivery.');
    return Response.json({ sent: true, recipientCount: tokens.length });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 160) : 'Community alert delivery failed.';
    const { error: updateError } = await admin
      .from('community_notification_outbox')
      .update({ status: 'failed', last_error: errorCode, updated_at: new Date().toISOString() })
      .eq('event_id', eventId);
    if (updateError) console.error('community alert failure status update failed', updateError);
    console.error('community alert delivery failed', error);
    return new Response('Community alert delivery failed', { status: 502 });
  }
});
