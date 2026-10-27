/**
 * Supabase Edge Function: external-probe
 *
 * Performs external HTTP/HTTPS availability & latency checks from Supabase Edge
 * to the public Website and public API endpoints (e.g., via Cloudflare Tunnel).
 * - Writes probe results to `public.service_checks`
 * - Updates consecutive failure state in `public.monitor_alert_state`
 * - Queues notifications in `public.monitor_alert_outbox` and `public.alerts` when down
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

interface ProbeTarget {
  target_name: 'public_website' | 'public_api';
  display_name: string;
  endpoint_or_target: string;
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const deviceId = Deno.env.get('MONITOR_DEVICE_ID') || 'your-device-id-01';

  const targets: ProbeTarget[] = [
    {
      target_name: 'public_website',
      display_name: 'Public Website',
      endpoint_or_target: Deno.env.get('PROBE_WEBSITE_URL') || 'https://example.com',
    },
    {
      target_name: 'public_api',
      display_name: 'Public Laravel API (/api/health)',
      endpoint_or_target:
        Deno.env.get('PROBE_API_HEALTH_URL') || 'https://example.com/api/v1/health-ping',
    },
  ];

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const checkedAt = new Date().toISOString();
  const results = [];

  for (const target of targets) {
    const startMs = performance.now();
    let httpStatus: number | null = null;
    let status: 'healthy' | 'warning' | 'critical' = 'critical';
    let errorCode = 'NONE';
    let errorSummary: string | null = null;
    let publicReachable = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(target.endpoint_or_target, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Supabase-External-Probe/1.0' },
      });
      clearTimeout(timeout);

      httpStatus = response.status;
      const elapsedMs = Math.round(performance.now() - startMs);

      if (response.ok) {
        publicReachable = true;
        status = elapsedMs > 2500 ? 'warning' : 'healthy';
        errorCode = 'NONE';
      } else {
        publicReachable = false;
        status = 'critical';
        errorCode = response.status >= 500 ? 'HTTP_5XX' : 'HTTP_4XX';
        errorSummary = `HTTP ${response.status} ${response.statusText}`;
      }

      results.push({
        device_id: deviceId,
        source: 'external_probe',
        target_name: target.target_name,
        display_name: target.display_name,
        endpoint_or_target: target.endpoint_or_target,
        checked_at: checkedAt,
        status,
        container_running: null,
        app_responding: response.ok,
        dependency_healthy: response.ok,
        public_reachable: publicReachable,
        http_status: httpStatus,
        response_time_ms: elapsedMs,
        error_code: errorCode,
        error_summary: errorSummary,
        verification_method: 'Supabase Edge HTTPS GET Probe',
      });
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - startMs);
      errorSummary = err instanceof Error ? err.message : 'Connection timeout or DNS error';
      errorCode = errorSummary.toLowerCase().includes('abort') ? 'TIMEOUT' : 'NETWORK_ERROR';

      results.push({
        device_id: deviceId,
        source: 'external_probe',
        target_name: target.target_name,
        display_name: target.display_name,
        endpoint_or_target: target.endpoint_or_target,
        checked_at: checkedAt,
        status: 'critical',
        container_running: null,
        app_responding: false,
        dependency_healthy: false,
        public_reachable: false,
        http_status: httpStatus,
        response_time_ms: elapsedMs,
        error_code: errorCode,
        error_summary: errorSummary,
        verification_method: 'Supabase Edge HTTPS GET Probe',
      });
    }
  }

  // 1. Insert probe records into public.service_checks
  await supabase.from('service_checks').insert(results);

  // 2. Update public.monitor_alert_state and public.monitor_alert_outbox
  for (const res of results) {
    const { data: prevState } = await supabase
      .from('monitor_alert_state')
      .select('*')
      .eq('target_name', res.target_name)
      .maybeSingle();

    const isDown = res.status === 'critical';
    const consecutiveFailures = isDown ? (prevState?.consecutive_failures ?? 0) + 1 : 0;
    const shouldAlert = isDown && consecutiveFailures >= 2;

    await supabase.from('monitor_alert_state').upsert(
      {
        target_name: res.target_name,
        is_alerting: shouldAlert,
        consecutive_failures: consecutiveFailures,
        last_status: res.status,
        last_http_status: res.http_status,
        last_error: res.error_summary,
        last_notified_at: shouldAlert ? checkedAt : prevState?.last_notified_at ?? null,
        updated_at: checkedAt,
      },
      { onConflict: 'target_name' }
    );

    if (shouldAlert && !prevState?.is_alerting) {
      await supabase.from('monitor_alert_outbox').insert({
        target_name: res.target_name,
        event_type: 'endpoint_down',
        message: `${res.display_name} (${res.endpoint_or_target}) failed ${consecutiveFailures} consecutive checks: ${res.error_summary || res.error_code}`,
        status: 'pending',
        attempts: 0,
        next_attempt_at: checkedAt,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, checked_at: checkedAt, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
