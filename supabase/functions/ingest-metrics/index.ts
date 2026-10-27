/**
 * Supabase Edge Function: ingest-metrics
 *
 * Receives push telemetry every 60s from the ARM64 Linux TV Box Agent (`agent/collector.sh`).
 * - Verifies Bearer token either via `MONITOR_INGEST_SECRET` env or SHA-256 lookup in `public.device_secrets`
 * - Upserts `public.devices` heartbeat (`last_seen_at`)
 * - Inserts idempotent row into `public.system_metrics`
 * - Inserts container states into `public.container_metrics`
 * - Inserts local service checks into `public.service_checks`
 * - Evaluates thresholds from `public.monitoring_settings` and manages `public.alerts` + `public.alert_events`
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id',
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!bearerToken) {
      return new Response(JSON.stringify({ error: 'Missing Bearer token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const payload = await req.json();
    const deviceId = String(payload.device_id || '').trim();
    const idempotencyKey = String(payload.idempotency_key || '').trim();
    const recordedAt = payload.recorded_at || new Date().toISOString();

    if (!deviceId || !idempotencyKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: device_id, idempotency_key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Authenticate token against MONITOR_INGEST_SECRET env var OR public.device_secrets (SHA-256)
    const envSecret = Deno.env.get('MONITOR_INGEST_SECRET');
    let tokenAuthorized = Boolean(envSecret && bearerToken === envSecret);

    if (!tokenAuthorized) {
      const tokenHash = await sha256Hex(bearerToken);
      const { data: secretRow } = await supabase
        .from('device_secrets')
        .select('device_id, token_sha256')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (secretRow && secretRow.token_sha256 === tokenHash) {
        tokenAuthorized = true;
      }
    }

    if (!tokenAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Upsert device heartbeat in public.devices
    const deviceMeta = payload.device || {};
    const { error: devErr } = await supabase.from('devices').upsert(
      {
        id: deviceId,
        name: deviceMeta.name || deviceId,
        hostname: deviceMeta.hostname || 'arm64-tvbox',
        kernel_version: deviceMeta.kernel_version || 'unknown',
        architecture: deviceMeta.architecture || 'aarch64',
        cpu_model: deviceMeta.cpu_model ?? null,
        cpu_cores: Number(deviceMeta.cpu_cores ?? 4),
        agent_version: deviceMeta.agent_version || '1.0.0',
        enabled: true,
        last_seen_at: recordedAt,
      },
      { onConflict: 'id' }
    );
    if (devErr) throw new Error(`devices upsert failed: ${devErr.message}`);

    // 3. Insert system_metrics row (idempotent on idempotency_key)
    const sys = payload.system || payload;
    const { error: sysErr } = await supabase.from('system_metrics').upsert(
      {
        device_id: deviceId,
        idempotency_key: idempotencyKey,
        recorded_at: recordedAt,
        uptime_seconds: sys.uptime_seconds ?? null,
        cpu_percent: sys.cpu_percent ?? null,
        cpu_iowait_percent: sys.cpu_iowait_percent ?? null,
        load_1: sys.load_1 ?? null,
        load_5: sys.load_5 ?? null,
        load_15: sys.load_15 ?? null,
        memory_total_bytes: sys.memory_total_bytes ?? null,
        memory_used_bytes: sys.memory_used_bytes ?? null,
        memory_available_bytes: sys.memory_available_bytes ?? null,
        memory_cached_bytes: sys.memory_cached_bytes ?? null,
        memory_buffers_bytes: sys.memory_buffers_bytes ?? null,
        swap_total_bytes: sys.swap_total_bytes ?? null,
        swap_used_bytes: sys.swap_used_bytes ?? null,
        swap_in_pages: sys.swap_in_pages ?? null,
        swap_out_pages: sys.swap_out_pages ?? null,
        oom_kill_count: sys.oom_kill_count ?? 0,
        temperature_celsius: sys.temperature_celsius ?? null,
        thermal_zones_json: sys.thermal_zones_json ?? null,
        root_disk_total_bytes: sys.root_disk_total_bytes ?? null,
        root_disk_used_bytes: sys.root_disk_used_bytes ?? null,
        root_disk_percent: sys.root_disk_percent ?? null,
        mounts_json: sys.mounts_json ?? null,
        net_rx_bytes_per_sec: sys.net_rx_bytes_per_sec ?? null,
        net_tx_bytes_per_sec: sys.net_tx_bytes_per_sec ?? null,
        net_errors_count: sys.net_errors_count ?? 0,
      },
      { onConflict: 'idempotency_key' }
    );
    if (sysErr) throw new Error(`system_metrics insert failed: ${sysErr.message}`);

    // 4. Insert container_metrics rows
    const containers = Array.isArray(payload.containers) ? payload.containers : [];
    if (containers.length > 0) {
      const containerRows = containers.map((c: Record<string, unknown>) => ({
        device_id: deviceId,
        recorded_at: recordedAt,
        container_name: String(c.container_name || c.name || 'unknown'),
        container_id_short: c.container_id_short ? String(c.container_id_short) : null,
        image: String(c.image || 'unknown'),
        role_description: String(c.role_description || ''),
        is_critical_service: Boolean(c.is_critical_service ?? true),
        state: String(c.state || 'unknown'),
        status_text: String(c.status_text || c.state || ''),
        cpu_percent: typeof c.cpu_percent === 'number' ? c.cpu_percent : null,
        memory_usage_bytes:
          typeof c.memory_usage_bytes === 'number' ? c.memory_usage_bytes : null,
        memory_limit_bytes:
          typeof c.memory_limit_bytes === 'number' ? c.memory_limit_bytes : null,
        memory_percent: typeof c.memory_percent === 'number' ? c.memory_percent : null,
        restart_count: Number(c.restart_count ?? 0),
        oom_killed: Boolean(c.oom_killed ?? false),
        health_status: String(c.health_status || 'none'),
        exit_code: typeof c.exit_code === 'number' ? c.exit_code : null,
        started_at: typeof c.started_at === 'string' ? c.started_at : null,
      }));

      const { error: contErr } = await supabase
        .from('container_metrics')
        .insert(containerRows);
      if (contErr) throw new Error(`container_metrics insert failed: ${contErr.message}`);
    }

    // 5. Insert local service_checks if provided by agent
    const serviceChecks = Array.isArray(payload.service_checks)
      ? payload.service_checks
      : [];
    if (serviceChecks.length > 0) {
      const checkRows = serviceChecks.map((sc: Record<string, unknown>) => ({
        device_id: deviceId,
        source: 'agent_local',
        target_name: String(sc.target_name || 'unknown'),
        display_name: String(sc.display_name || sc.target_name || 'Service'),
        endpoint_or_target: String(sc.endpoint_or_target || 'localhost'),
        checked_at: recordedAt,
        status: String(sc.status || 'healthy'),
        container_running:
          typeof sc.container_running === 'boolean' ? sc.container_running : null,
        app_responding:
          typeof sc.app_responding === 'boolean' ? sc.app_responding : null,
        dependency_healthy:
          typeof sc.dependency_healthy === 'boolean' ? sc.dependency_healthy : null,
        public_reachable:
          typeof sc.public_reachable === 'boolean' ? sc.public_reachable : null,
        http_status: typeof sc.http_status === 'number' ? sc.http_status : null,
        response_time_ms:
          typeof sc.response_time_ms === 'number' ? sc.response_time_ms : null,
        error_code: String(sc.error_code || 'NONE'),
        error_summary: sc.error_summary ? String(sc.error_summary) : null,
        verification_method: String(
          sc.verification_method || 'Agent Local Socket / HTTP Probe'
        ),
      }));

      await supabase.from('service_checks').insert(checkRows);
    }

    // 6. Threshold & Alert evaluation against public.monitoring_settings
    const { data: settings } = await supabase
      .from('monitoring_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    const tempWarn = settings?.temp_warn_celsius ?? 75;
    const tempCrit = settings?.temp_critical_celsius ?? 85;
    const ramCritPct = settings?.ram_available_critical_percent ?? 8;

    const tempC = typeof sys.temperature_celsius === 'number' ? sys.temperature_celsius : null;
    if (tempC !== null && tempC >= tempWarn) {
      const severity = tempC >= tempCrit ? 'critical' : 'warning';
      const { data: existingAlert } = await supabase
        .from('alerts')
        .select('id')
        .eq('device_id', deviceId)
        .eq('rule_key', 'soc_temperature_high')
        .neq('status', 'resolved')
        .maybeSingle();

      if (existingAlert) {
        await supabase
          .from('alerts')
          .update({
            severity,
            last_seen_at: recordedAt,
            observation: `SoC temperature reached ${tempC.toFixed(1)}°C`,
          })
          .eq('id', existingAlert.id);
      } else {
        const { data: createdAlert } = await supabase
          .from('alerts')
          .insert({
            device_id: deviceId,
            rule_key: 'soc_temperature_high',
            source: 'agent_metrics',
            severity,
            status: 'open',
            title: `High SoC Temperature (${tempC.toFixed(1)}°C)`,
            observation: `ARM64 SoC thermal sensor reported ${tempC.toFixed(1)}°C (threshold: ${tempWarn}°C).`,
            probable_cause: 'Sustained CPU load or restricted passive airflow around TV Box.',
            recommended_check: 'Check container CPU usage and physical heatsink ventilation.',
            first_seen_at: recordedAt,
            last_seen_at: recordedAt,
          })
          .select('id')
          .single();

        if (createdAlert?.id) {
          await supabase.from('alert_events').insert({
            alert_id: createdAlert.id,
            event_type: 'opened',
            actor: 'ingest-metrics',
            summary: `Alert opened automatically at ${tempC.toFixed(1)}°C.`,
          });
        }
      }
    }

    if (
      typeof sys.memory_total_bytes === 'number' &&
      sys.memory_total_bytes > 0 &&
      typeof sys.memory_available_bytes === 'number'
    ) {
      const availPct = (sys.memory_available_bytes / sys.memory_total_bytes) * 100;
      if (availPct <= ramCritPct) {
        const { data: existingRamAlert } = await supabase
          .from('alerts')
          .select('id')
          .eq('device_id', deviceId)
          .eq('rule_key', 'ram_available_low')
          .neq('status', 'resolved')
          .maybeSingle();

        if (!existingRamAlert) {
          const { data: createdAlert } = await supabase
            .from('alerts')
            .insert({
              device_id: deviceId,
              rule_key: 'ram_available_low',
              source: 'agent_metrics',
              severity: 'critical',
              status: 'open',
              title: `Critical Low Available Memory (${availPct.toFixed(1)}%)`,
              observation: `MemAvailable dropped to ${availPct.toFixed(1)}% of total RAM.`,
              probable_cause: 'Container memory pressure or PHP-FPM / Next.js worker growth.',
              recommended_check: 'Inspect container_metrics memory_usage_bytes and swap activity.',
              first_seen_at: recordedAt,
              last_seen_at: recordedAt,
            })
            .select('id')
            .single();

          if (createdAlert?.id) {
            await supabase.from('alert_events').insert({
              alert_id: createdAlert.id,
              event_type: 'opened',
              actor: 'ingest-metrics',
              summary: `Low RAM alert opened (${availPct.toFixed(1)}% available).`,
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        device_id: deviceId,
        idempotency_key: idempotencyKey,
        recorded_at: recordedAt,
        containers_ingested: containers.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
