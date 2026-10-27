import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AlertRecord,
  ContainerMetricRecord,
  DeviceInfo,
  MonitoringSettings,
  MonitoringSnapshot,
  ServiceCheckRecord,
  SystemMetricRecord,
  TimeSeriesPoint,
} from '../types/monitoring';
import { DEFAULT_MONITORING_SETTINGS } from '../data/mockScenarios';

const STORAGE_URL_KEY = 'server_monitoring_supabase_url';
const STORAGE_ANON_KEY = 'server_monitoring_supabase_anon_key';

export interface SupabaseConnectionConfig {
  url: string;
  anonKey: string;
  source: 'env' | 'runtime' | 'unconfigured';
}

/**
 * Checks whether a JWT token is accidentally a Supabase service_role secret key.
 * Browser clients MUST NEVER use service_role keys.
 */
export function isServiceRoleKey(key: string): boolean {
  try {
    const parts = key.trim().split('.');
    if (parts.length !== 3) return false;
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): SupabaseConnectionConfig {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

  const isPlaceholder = (val: string) =>
    !val ||
    val.includes('your-project-ref') ||
    val.includes('your-public-anon-key-here') ||
    val === 'MY_SUPABASE_URL';

  const runtimeUrl =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(STORAGE_URL_KEY)?.trim() || ''
      : '';
  const runtimeKey =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(STORAGE_ANON_KEY)?.trim() || ''
      : '';

  const resolvedUrl = !isPlaceholder(envUrl)
    ? envUrl
    : !isPlaceholder(runtimeUrl)
    ? runtimeUrl
    : '';
  const resolvedKey = !isPlaceholder(envKey)
    ? envKey
    : !isPlaceholder(runtimeKey)
    ? runtimeKey
    : '';

  if (resolvedUrl && resolvedKey) {
    const source =
      !isPlaceholder(envUrl) && !isPlaceholder(envKey) ? 'env' : 'runtime';
    return { url: resolvedUrl, anonKey: resolvedKey, source };
  }

  return { url: resolvedUrl, anonKey: resolvedKey, source: 'unconfigured' };
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): {
  ok: boolean;
  error?: string;
} {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = anonKey.trim();

  if (!cleanUrl.startsWith('https://') || !cleanUrl.includes('.supabase.co')) {
    return {
      ok: false,
      error: 'Supabase URL must be a valid https://<project-ref>.supabase.co endpoint.',
    };
  }

  if (isServiceRoleKey(cleanKey)) {
    return {
      ok: false,
      error:
        'SECURITY BLOCK: You pasted a service_role secret key. The browser dashboard only accepts the public anon/publishable key.',
    };
  }

  if (cleanKey.length < 20) {
    return {
      ok: false,
      error: 'Invalid Supabase anon/publishable key format.',
    };
  }

  window.localStorage.setItem(STORAGE_URL_KEY, cleanUrl);
  window.localStorage.setItem(STORAGE_ANON_KEY, cleanKey);
  cachedClient = null;
  cachedUrl = '';
  return { ok: true };
}

export function clearRuntimeSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_URL_KEY);
    window.localStorage.removeItem(STORAGE_ANON_KEY);
  }
  cachedClient = null;
  cachedUrl = '';
}

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (cfg.source === 'unconfigured' || !cfg.url || !cfg.anonKey) {
    return null;
  }
  if (isServiceRoleKey(cfg.anonKey)) {
    return null;
  }
  if (cachedClient && cachedUrl === cfg.url) {
    return cachedClient;
  }
  cachedUrl = cfg.url;
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cachedClient;
}

/**
 * Verifies both authentication AND explicit membership in `public.admin_users`.
 * Rejects normal authenticated users who are not authorized administrators.
 */
export async function verifyAdminSession(client: SupabaseClient): Promise<{
  authenticated: boolean;
  isAdmin: boolean;
  email: string | null;
  error: string | null;
}> {
  const { data: sessionData, error: sessionErr } = await client.auth.getSession();
  if (sessionErr || !sessionData.session?.user) {
    return {
      authenticated: false,
      isAdmin: false,
      email: null,
      error: sessionErr?.message ?? null,
    };
  }

  const user = sessionData.session.user;
  const { data: adminRow, error: adminErr } = await client
    .from('admin_users')
    .select('user_id, email, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminErr) {
    return {
      authenticated: true,
      isAdmin: false,
      email: user.email ?? null,
      error: `RLS / Admin verification error: ${adminErr.message}`,
    };
  }

  if (!adminRow) {
    return {
      authenticated: true,
      isAdmin: false,
      email: user.email ?? null,
      error:
        'Account authenticated, but your user_id is not listed in public.admin_users. Access denied by least-privilege policy.',
    };
  }

  return {
    authenticated: true,
    isAdmin: true,
    email: user.email ?? adminRow.email,
    error: null,
  };
}

/**
 * Fetches live monitoring snapshot from Supabase PostgreSQL via RLS.
 */
export async function fetchLiveMonitoringSnapshot(
  client: SupabaseClient,
  deviceId = (() => {
    const v = (import.meta.env.VITE_MONITOR_DEVICE_ID as string | undefined)?.trim();
    return v && v !== 'your-device-id-01' ? v : 'arm64-tvbox-01';
  })()
): Promise<MonitoringSnapshot> {
  const nowIso = new Date().toISOString();

  const [
    deviceRes,
    sysRes,
    containersRes,
    checksRes,
    alertsRes,
    settingsRes,
  ] = await Promise.all([
    client.from('devices').select('*').eq('id', deviceId).maybeSingle(),
    client
      .from('system_metrics')
      .select('*')
      .eq('device_id', deviceId)
      .order('recorded_at', { ascending: false })
      .limit(30),
    client
      .from('container_metrics')
      .select('*')
      .eq('device_id', deviceId)
      .order('recorded_at', { ascending: false })
      .limit(16),
    client
      .from('service_checks')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(60),
    client
      .from('alerts')
      .select('*, alert_events(*)')
      .order('last_seen_at', { ascending: false })
      .limit(50),
    client.from('monitoring_settings').select('*').limit(1).maybeSingle(),
  ]);

  if (deviceRes.error) throw new Error(`devices query failed: ${deviceRes.error.message}`);
  if (sysRes.error) throw new Error(`system_metrics query failed: ${sysRes.error.message}`);

  const rawDevice = deviceRes.data;
  const device: DeviceInfo = {
    id: rawDevice?.id ?? deviceId,
    name: rawDevice?.name ?? 'ARM64 Server TV Box',
    hostname: rawDevice?.hostname ?? 'unknown',
    kernel_version: rawDevice?.kernel_version ?? 'unknown',
    architecture: rawDevice?.architecture ?? 'aarch64',
    cpu_model: rawDevice?.cpu_model ?? null,
    cpu_cores: Number(rawDevice?.cpu_cores ?? 4),
    agent_version: rawDevice?.agent_version ?? 'unknown',
    enabled: rawDevice?.enabled ?? true,
    last_seen_at: rawDevice?.last_seen_at ?? null,
    created_at: rawDevice?.created_at ?? nowIso,
    expected_containers: Array.isArray(rawDevice?.expected_containers)
      ? rawDevice.expected_containers
      : [
          'app-nginx',
          'app-backend',
          'app-worker',
          'app-mysql',
          'app-redis',
          'app-nextjs',
          'app-phpmyadmin',
          'cloudflare-tunnel',
        ],
  };

  const sysRows: SystemMetricRecord[] = ((sysRes.data ?? []) as any[]).map(
    (row) => ({
      ...row,
      mounts_json: Array.isArray(row.mounts_json)
        ? row.mounts_json.map((m: any) => {
            const totalB = Number(m?.total_bytes ?? 0);
            const usedB = Number(m?.used_bytes ?? 0);
            const availB = Number(
              m?.available_bytes ?? Math.max(0, totalB - usedB)
            );
            const pct =
              typeof m?.used_percent === 'number'
                ? m.used_percent
                : typeof m?.percent === 'number'
                ? m.percent
                : totalB > 0
                ? Number(((usedB / totalB) * 100).toFixed(1))
                : 0;
            return {
              mount_point: m?.mount_point ?? '/',
              device: m?.device ?? '/dev/root',
              fs_type: m?.fs_type ?? 'ext4',
              total_bytes: totalB,
              used_bytes: usedB,
              available_bytes: availB,
              used_percent: Number(pct) || 0,
              read_only: Boolean(m?.read_only ?? false),
              category: m?.category ?? 'root',
            };
          })
        : [],
      thermal_zones_json: Array.isArray(row.thermal_zones_json)
        ? row.thermal_zones_json.map((tz: any, idx: number) => ({
            zone: tz?.zone ?? `thermal_zone${idx}`,
            type: tz?.type ?? 'soc-thermal',
            celsius:
              typeof tz === 'number'
                ? tz
                : Number(
                    tz?.celsius ?? tz?.temp_c ?? tz?.temperature_celsius ?? 0
                  ),
          }))
        : null,
    })
  );
  const latestSystem = sysRows[0] ?? null;

  // Deduplicate latest container record per container_name
  const seenContainers = new Set<string>();
  const latestContainers: ContainerMetricRecord[] = [];
  for (const row of (containersRes.data ?? []) as any[]) {
    const cname = String(row.container_name ?? 'unknown');
    if (!seenContainers.has(cname)) {
      seenContainers.add(cname);
      latestContainers.push({
        ...row,
        container_name: cname,
        image: String(row.image ?? 'unknown'),
        role_description: String(row.role_description ?? ''),
        status_text: String(row.status_text ?? row.state ?? ''),
        restart_count: Number(row.restart_count ?? 0),
        oom_killed: Boolean(row.oom_killed ?? false),
        health_status: row.health_status ?? 'none',
      });
    }
  }

  // Normalize target_name aliases from service_checks table
  const normalizeTargetName = (rawTarget: string, endpoint = ''): string => {
    const t = (rawTarget || '').toLowerCase().trim();
    const ep = (endpoint || '').toLowerCase().trim();
    if (
      t === 'public_website' ||
      t === 'website' ||
      t === 'web' ||
      t === 'homepage' ||
      (ep.startsWith('http') && !ep.includes('127.0.0.1') && !ep.includes('localhost') && !ep.includes('/api') && !ep.includes('/functions/v1'))
    ) {
      return 'public_website';
    }
    if (
      t === 'public_api' ||
      t === 'api' ||
      t === 'api_health' ||
      ep.includes('/api')
    ) {
      return 'public_api';
    }
    if (t === 'cloudflare-tunnel' || t === 'cloudflare_tunnel' || t === 'tunnel') {
      return 'cloudflare_tunnel';
    }
    if (t.endsWith('-nginx') || t === 'nginx') return 'nginx';
    if (t.endsWith('-backend') || t.endsWith('_backend') || t === 'laravel_backend' || t === 'backend') {
      return 'laravel_backend';
    }
    if (t.endsWith('-mysql') || t === 'mariadb' || t === 'mysql') return 'mariadb';
    if (t.endsWith('-redis') || t === 'redis') return 'redis';
    if (t.endsWith('-nextjs') || t === 'nextjs') return 'nextjs';
    if (t.endsWith('-worker') || t.endsWith('_worker') || t === 'queue_worker' || t === 'worker') {
      return 'queue_worker';
    }
    return rawTarget;
  };

  const allRawChecks = ((checksRes.data ?? []) as any[]).map((row) => ({
    ...row,
    target_name: normalizeTargetName(
      String(row.target_name ?? ''),
      String(row.endpoint_or_target ?? '')
    ),
  })) as ServiceCheckRecord[];

  // Deduplicate latest service check per normalized target_name
  const seenTargets = new Set<string>();
  const latestChecks: ServiceCheckRecord[] = [];
  for (const row of allRawChecks) {
    if (!seenTargets.has(row.target_name)) {
      seenTargets.add(row.target_name);
      latestChecks.push(row);
    }
  }

  // Synthesize fallback service checks from live container_metrics when service_checks rows are absent
  const containerByName = new Map<string, ContainerMetricRecord>();
  for (const c of latestContainers) {
    containerByName.set(c.container_name, c);
  }
  const checkedAtFallback = latestSystem?.recorded_at ?? device.last_seen_at ?? nowIso;

  const findContainerByRole = (suffixes: string[]): ContainerMetricRecord | undefined => {
    for (const s of suffixes) {
      const exact = containerByName.get(s);
      if (exact) return exact;
    }
    return latestContainers.find((c) =>
      suffixes.some((s) => c.container_name.toLowerCase().endsWith(s))
    );
  };

  const containerBackedTargets: {
    targetName: ServiceCheckRecord['target_name'];
    displayName: string;
    matchSuffixes: string[];
    defaultContainerName: string;
    publicReachable: boolean | null;
  }[] = [
    {
      targetName: 'cloudflare_tunnel',
      displayName: 'Cloudflare Tunnel (cloudflare-tunnel)',
      matchSuffixes: ['cloudflare-tunnel', 'tunnel'],
      defaultContainerName: 'cloudflare-tunnel',
      publicReachable: true,
    },
    {
      targetName: 'nginx',
      displayName: 'Nginx Reverse Proxy (app-nginx)',
      matchSuffixes: ['app-nginx', '-nginx', 'nginx'],
      defaultContainerName: 'app-nginx',
      publicReachable: null,
    },
    {
      targetName: 'laravel_backend',
      displayName: 'Laravel Backend (app-backend)',
      matchSuffixes: ['app-backend', '_backend', '-backend'],
      defaultContainerName: 'app-backend',
      publicReachable: null,
    },
    {
      targetName: 'mariadb',
      displayName: 'MariaDB 10.6 (app-mysql)',
      matchSuffixes: ['app-mysql', '-mysql', 'mariadb'],
      defaultContainerName: 'app-mysql',
      publicReachable: null,
    },
    {
      targetName: 'redis',
      displayName: 'Redis 7 Cache & Queue (app-redis)',
      matchSuffixes: ['app-redis', '-redis', 'redis'],
      defaultContainerName: 'app-redis',
      publicReachable: null,
    },
    {
      targetName: 'nextjs',
      displayName: 'Next.js Frontend (app-nextjs)',
      matchSuffixes: ['app-nextjs', '-nextjs', 'nextjs'],
      defaultContainerName: 'app-nextjs',
      publicReachable: null,
    },
    {
      targetName: 'queue_worker',
      displayName: 'Laravel Queue Worker (app-worker)',
      matchSuffixes: ['app-worker', '_worker', '-worker'],
      defaultContainerName: 'app-worker',
      publicReachable: null,
    },
  ];

  for (const item of containerBackedTargets) {
    if (!seenTargets.has(item.targetName)) {
      const c = findContainerByRole(item.matchSuffixes);
      if (c) {
        const isRunning = c.state === 'running';
        const isHealthy =
          isRunning && c.health_status !== 'unhealthy' && !c.oom_killed;
        seenTargets.add(item.targetName);
        latestChecks.push({
          id: `derived-${item.targetName}`,
          device_id: device.id,
          source: 'agent_local',
          target_name: item.targetName,
          display_name: item.displayName,
          endpoint_or_target: `container://${c.container_name}`,
          checked_at: c.recorded_at ?? checkedAtFallback,
          status: isHealthy ? 'healthy' : isRunning ? 'warning' : 'critical',
          container_running: isRunning,
          app_responding: isHealthy,
          dependency_healthy: isHealthy,
          public_reachable: item.publicReachable ? isHealthy : null,
          http_status: null,
          response_time_ms: null,
          error_code: isHealthy
            ? 'NONE'
            : c.oom_killed
            ? 'OOM_TERMINATED'
            : 'CONTAINER_STOPPED',
          error_summary: isHealthy
            ? null
            : `Container state=${c.state}, health=${c.health_status}`,
          verification_method: 'Docker Engine Socket (Live Container State)',
        });
      }
    }
  }

  // If external-probe hasn't inserted public_website / public_api rows into service_checks yet,
  // derive their status from the live container stack so the dashboard accurately reflects reality
  const tunnelCont = findContainerByRole(['cloudflare-tunnel', 'tunnel']);
  const nginxCont = findContainerByRole(['app-nginx', '-nginx', 'nginx']);
  const nextCont = findContainerByRole(['app-nextjs', '-nextjs', 'nextjs']);
  const backendCont = findContainerByRole(['app-backend', '_backend', '-backend']);
  const dbCont = findContainerByRole(['app-mysql', '-mysql', 'mariadb']);

  if (!seenTargets.has('public_website') && latestContainers.length > 0) {
    const webStackUp =
      (!tunnelCont || tunnelCont.state === 'running') &&
      (!nginxCont || nginxCont.state === 'running') &&
      (!nextCont || nextCont.state === 'running');
    seenTargets.add('public_website');
    latestChecks.unshift({
      id: 'derived-public-website',
      device_id: device.id,
      source: 'agent_local',
      target_name: 'public_website',
      display_name: 'Public Website (app.example.com)',
      endpoint_or_target: 'https://app.example.com',
      checked_at: checkedAtFallback,
      status: webStackUp ? 'healthy' : 'critical',
      container_running: webStackUp,
      app_responding: webStackUp,
      dependency_healthy: webStackUp,
      public_reachable: webStackUp,
      http_status: webStackUp ? 200 : 502,
      response_time_ms: null,
      error_code: webStackUp ? 'NONE' : 'CONTAINER_STOPPED',
      error_summary: webStackUp
        ? null
        : 'One or more web upstream containers (cloudflare-tunnel / app-nginx / app-nextjs) are not running.',
      verification_method: 'Container Stack Verification (Tunnel + Nginx + Next.js)',
    });
  }

  if (!seenTargets.has('public_api') && latestContainers.length > 0) {
    const apiStackUp =
      (!nginxCont || nginxCont.state === 'running') &&
      (!backendCont || backendCont.state === 'running') &&
      (!dbCont || dbCont.state === 'running');
    const localBackendCheck = latestChecks.find(
      (c) => c.target_name === 'laravel_backend'
    );
    seenTargets.add('public_api');
    latestChecks.push({
      id: 'derived-public-api',
      device_id: device.id,
      source: 'agent_local',
      target_name: 'public_api',
      display_name: 'Public Laravel API (/api/health)',
      endpoint_or_target: 'https://app.example.com/api/v1/health-ping',
      checked_at: checkedAtFallback,
      status: apiStackUp ? 'healthy' : 'critical',
      container_running: apiStackUp,
      app_responding: apiStackUp,
      dependency_healthy: apiStackUp,
      public_reachable: apiStackUp,
      http_status: localBackendCheck?.http_status ?? (apiStackUp ? 200 : 502),
      response_time_ms: localBackendCheck?.response_time_ms ?? null,
      error_code: apiStackUp ? 'NONE' : 'CONTAINER_STOPPED',
      error_summary: apiStackUp
        ? null
        : 'Backend API stack (app-nginx / app-backend / app-mysql) is not running.',
      verification_method: 'Container Stack Verification (Nginx + PHP-FPM + MariaDB)',
    });
  }

  const webHistory = allRawChecks
    .filter((c) => c.target_name === 'public_website' && c.response_time_ms !== null)
    .reverse();
  const apiHistory = allRawChecks
    .filter((c) => c.target_name === 'public_api' && c.response_time_ms !== null)
    .reverse();

  const rawSeriesRows =
    sysRows.length === 1
      ? [
          {
            ...sysRows[0],
            recorded_at: new Date(
              new Date(sysRows[0].recorded_at).getTime() - 60_000
            ).toISOString(),
          },
          sysRows[0],
        ]
      : [...sysRows].reverse();

  const timeSeries: TimeSeriesPoint[] = rawSeriesRows.map((m, idx) => {
    const d = new Date(m.recorded_at);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const usedPct =
      m.memory_total_bytes && m.memory_available_bytes !== null
        ? Number(
            (
              ((m.memory_total_bytes - m.memory_available_bytes) /
                m.memory_total_bytes) *
              100
            ).toFixed(1)
          )
        : null;
    const webPt = webHistory[idx] ?? webHistory[webHistory.length - 1];
    const apiPt = apiHistory[idx] ?? apiHistory[apiHistory.length - 1];
    return {
      timestamp: m.recorded_at,
      label: `${hh}:${mm}`,
      cpu_percent: m.cpu_percent,
      memory_used_percent: usedPct,
      memory_available_mb:
        m.memory_available_bytes !== null
          ? Math.round(m.memory_available_bytes / (1024 * 1024))
          : null,
      swap_used_mb:
        m.swap_used_bytes !== null
          ? Math.round(m.swap_used_bytes / (1024 * 1024))
          : null,
      temperature_celsius: m.temperature_celsius,
      load_1: m.load_1,
      web_response_ms: webPt?.response_time_ms ?? null,
      api_response_ms: apiPt?.response_time_ms ?? null,
      net_rx_kbps:
        m.net_rx_bytes_per_sec !== null
          ? Math.round(m.net_rx_bytes_per_sec / 1024)
          : null,
      net_tx_kbps:
        m.net_tx_bytes_per_sec !== null
          ? Math.round(m.net_tx_bytes_per_sec / 1024)
          : null,
    };
  });

  const alerts: AlertRecord[] = ((alertsRes.data ?? []) as any[]).map((a) => ({
    ...a,
    events: a.alert_events ?? [],
  }));

  return {
    is_mock_data: false,
    scenario_id: 'nominal',
    scenario_label: 'Live Supabase Telemetry',
    scenario_description: `Connected to Supabase PostgreSQL (${getSupabaseConfig().url}) with RLS verification.`,
    fetched_at: nowIso,
    device,
    latest_system: latestSystem,
    containers: latestContainers,
    service_checks: latestChecks,
    alerts,
    time_series: timeSeries,
    settings: (settingsRes.data as MonitoringSettings | null) ?? DEFAULT_MONITORING_SETTINGS,
  };
}
