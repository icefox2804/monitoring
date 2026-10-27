import type {
  MonitoringSettings,
  MonitoringSnapshot,
  SimulationScenarioId,
  TimeSeriesPoint,
} from '../types/monitoring';

export const DEFAULT_MONITORING_SETTINGS: MonitoringSettings = {
  ram_available_warn_percent: 15,
  ram_available_critical_percent: 8,
  swap_used_warn_percent: 50,
  cpu_warn_percent: 85,
  cpu_critical_percent: 95,
  temp_warn_celsius: 75,
  temp_critical_celsius: 83,
  disk_warn_percent: 80,
  disk_critical_percent: 90,
  heartbeat_stale_seconds: 180,
  heartbeat_offline_seconds: 600,
  consecutive_breaches_required: 3,
  alert_cooldown_minutes: 60,
  alert_recipient_emails: ['admin@example.com', 'ops@example.com'],
  email_provider: 'resend_api',
  default_chart_range: '1h',
  raw_retention_days: 14,
  hourly_rollup_retention_days: 90,
};

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

function buildTimeSeries(
  nowMs: number,
  scenario: SimulationScenarioId,
  pointsCount = 24
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  for (let i = pointsCount - 1; i >= 0; i--) {
    const tMs = nowMs - i * 60_000 * 2.5; // 2.5 min steps (~1h window)
    const d = new Date(tMs);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const wave = Math.sin(i * 0.45);
    const secondary = Math.cos(i * 0.3);

    let cpu = Number((32 + wave * 8 + secondary * 4).toFixed(1));
    let memUsedPct = Number((70.5 + wave * 2.2).toFixed(1));
    let memAvailMb = Math.round(1992 * (1 - memUsedPct / 100));
    let swapUsedMb = Math.round(310 + secondary * 18);
    let temp: number | null = Number((58.2 + wave * 2.1).toFixed(1));
    let load1 = Number((0.72 + wave * 0.18).toFixed(2));
    let webMs: number | null = Math.round(182 + wave * 24);
    let apiMs: number | null = Math.round(235 + secondary * 35);
    let netRx = Math.round(420 + wave * 110);
    let netTx = Math.round(380 + secondary * 95);

    if (scenario === 'warning' && i < 6) {
      cpu = Number((87.4 + (5 - i) * 1.1).toFixed(1));
      memUsedPct = Number((88.2 + (5 - i) * 0.6).toFixed(1));
      memAvailMb = Math.round(1992 * (1 - memUsedPct / 100));
      swapUsedMb = Math.round(1120 + (5 - i) * 65);
      temp = Number((76.2 + (5 - i) * 0.5).toFixed(1));
      load1 = Number((2.85 + (5 - i) * 0.15).toFixed(2));
      apiMs = Math.round(890 + (5 - i) * 90);
    } else if (scenario === 'critical' && i < 4) {
      cpu = Number((94.1 + (3 - i) * 1.2).toFixed(1));
      memUsedPct = 95.8;
      memAvailMb = 84;
      swapUsedMb = 1690;
      temp = 83.4;
      load1 = 4.65;
      apiMs = null; // API timed out / 502
      webMs = 1420;
    } else if (scenario === 'sensor_na') {
      temp = null;
      swapUsedMb = 0;
    }

    points.push({
      timestamp: d.toISOString(),
      label: `${hh}:${mm}`,
      cpu_percent: cpu,
      memory_used_percent: memUsedPct,
      memory_available_mb: memAvailMb,
      swap_used_mb: swapUsedMb,
      temperature_celsius: temp,
      load_1: load1,
      web_response_ms: webMs,
      api_response_ms: apiMs,
      net_rx_kbps: netRx,
      net_tx_kbps: netTx,
    });
  }
  return points;
}

export function generateMockSnapshot(
  scenario: SimulationScenarioId,
  nowMs: number,
  customSettings?: MonitoringSettings
): MonitoringSnapshot {
  const settings = customSettings ?? DEFAULT_MONITORING_SETTINGS;

  const lastSeenOffsetSec =
    scenario === 'stale'
      ? 275 // 4m 35s ago (> 180s stale threshold)
      : scenario === 'offline'
      ? 1090 // 18m 10s ago (> 600s offline threshold)
      : 22; // 22s ago (fresh)

  const recordedAtIso = new Date(nowMs - lastSeenOffsetSec * 1000).toISOString();
  const fetchedAtIso = new Date(nowMs).toISOString();

  const totalRamBytes = 1992 * MB; // ~1.95 GB usable on 2GB ARM64 SoC (GPU reserved ~56MB)
  const swapTotalBytes = scenario === 'sensor_na' ? 0 : 2048 * MB;

  const availableRamBytes =
    scenario === 'warning'
      ? 238 * MB // 11.9% (< 15% warning threshold)
      : scenario === 'critical'
      ? 92 * MB // 4.6% (OOM territory)
      : 584 * MB; // 29.3% healthy headroom

  const cachedBytes =
    scenario === 'critical'
      ? 110 * MB
      : scenario === 'warning'
      ? 210 * MB
      : 468 * MB;
  const buffersBytes = 64 * MB;
  const usedRamBytes = totalRamBytes - availableRamBytes;

  const swapUsedBytes =
    scenario === 'sensor_na'
      ? 0
      : scenario === 'critical'
      ? 1680 * MB
      : scenario === 'warning'
      ? 1240 * MB
      : 312 * MB;

  const tempCelsius =
    scenario === 'sensor_na'
      ? null
      : scenario === 'critical'
      ? 83.6
      : scenario === 'warning'
      ? 76.8
      : 58.4;

  const scenarioDescriptions: Record<
    SimulationScenarioId,
    { label: string; desc: string }
  > = {
    nominal: {
      label: 'Healthy (Nominal Production)',
      desc: 'All 8 Docker containers running, RAM available 29.3% (584 MB), SoC temp 58.4°C, Public Website & Laravel API responding under 250ms.',
    },
    warning: {
      label: 'Warning (RAM Pressure & Thermal)',
      desc: 'Available RAM dropped to 11.9% (238 MB) across 4 consecutive checks; Swap climbed to 1.21 GB; SoC temperature at 76.8°C.',
    },
    critical: {
      label: 'Critical (OOM Kill & API 502)',
      desc: 'Container app-backend terminated by Linux OOM Killer (exit code 137); Public API returning HTTP 502 Bad Gateway via Cloudflare.',
    },
    stale: {
      label: 'Stale Data (Heartbeat > 4m ago)',
      desc: 'TV Box has not delivered metrics for 4m 35s. Dashboard flags telemetry as Stale instead of assuming system is healthy.',
    },
    offline: {
      label: 'Offline (TV Box Unreachable > 18m)',
      desc: 'No heartbeat for 18m 10s. External probe reports HTTP 530 Origin Unreachable on app.example.com.',
    },
    sensor_na: {
      label: 'Sensor N/A & Zero vs Null Proof',
      desc: 'Simulates SoC without thermal sysfs exposure (Temperature = N/A Unsupported) alongside Swap = 0 B and 0 container restarts.',
    },
  };

  return {
    is_mock_data: true,
    scenario_id: scenario,
    scenario_label: scenarioDescriptions[scenario].label,
    scenario_description: scenarioDescriptions[scenario].desc,
    fetched_at: fetchedAtIso,
    device: {
      id: 'arm64-tvbox-01',
      name: 'Tanix TX3 Mini (Production Host)',
      hostname: 'arm64-tvbox-host',
      kernel_version: 'Linux 6.1.78-meson64',
      architecture: 'aarch64 (ARM64)',
      cpu_model: 'Amlogic S905W Quad-Core Cortex-A53 @ 1.20GHz',
      cpu_cores: 4,
      agent_version: '1.2.0-py3-stdlib',
      enabled: true,
      last_seen_at: recordedAtIso,
      created_at: '2026-09-01T08:00:00Z',
      expected_containers: [
        'app-nginx',
        'app-backend',
        'app-worker',
        'app-mysql',
        'app-redis',
        'app-nextjs',
        'app-phpmyadmin',
        'cloudflare-tunnel',
      ],
    },
    latest_system: {
      id: 48291,
      device_id: 'arm64-tvbox-01',
      idempotency_key: `arm64-tvbox-01:${Math.floor(nowMs / 60000)}`,
      recorded_at: recordedAtIso,
      uptime_seconds: 1_248_920, // 14d 10h 55m
      cpu_percent:
        scenario === 'critical'
          ? 94.8
          : scenario === 'warning'
          ? 88.4
          : 34.2,
      cpu_iowait_percent:
        scenario === 'critical'
          ? 28.4
          : scenario === 'warning'
          ? 16.2
          : 2.1,
      load_1:
        scenario === 'critical'
          ? 4.82
          : scenario === 'warning'
          ? 3.15
          : 0.78,
      load_5:
        scenario === 'critical'
          ? 3.95
          : scenario === 'warning'
          ? 2.74
          : 0.84,
      load_15:
        scenario === 'critical'
          ? 2.88
          : scenario === 'warning'
          ? 2.12
          : 0.79,
      memory_total_bytes: totalRamBytes,
      memory_used_bytes: usedRamBytes,
      memory_available_bytes: availableRamBytes,
      memory_cached_bytes: cachedBytes,
      memory_buffers_bytes: buffersBytes,
      swap_total_bytes: swapTotalBytes,
      swap_used_bytes: swapUsedBytes,
      swap_in_pages:
        scenario === 'critical' ? 14820 : scenario === 'warning' ? 4210 : 12,
      swap_out_pages:
        scenario === 'critical' ? 19340 : scenario === 'warning' ? 5890 : 28,
      oom_kill_count: scenario === 'critical' ? 2 : 0,
      temperature_celsius: tempCelsius,
      thermal_zones_json:
        scenario === 'sensor_na'
          ? null
          : [
              {
                zone: 'thermal_zone0',
                type: 'soc_thermal',
                celsius: tempCelsius,
              },
              {
                zone: 'thermal_zone1',
                type: 'ddr_thermal',
                celsius:
                  tempCelsius !== null
                    ? Number((tempCelsius - 4.2).toFixed(1))
                    : null,
              },
            ],
      root_disk_total_bytes: Math.round(14.8 * GB),
      root_disk_used_bytes:
        scenario === 'warning'
          ? Math.round(12.2 * GB)
          : Math.round(8.4 * GB),
      root_disk_percent: scenario === 'warning' ? 82.4 : 56.8,
      mounts_json: [
        {
          mount_point: '/',
          device: '/dev/mmcblk1p2',
          fs_type: 'ext4',
          total_bytes: Math.round(14.8 * GB),
          used_bytes:
            scenario === 'warning'
              ? Math.round(12.2 * GB)
              : Math.round(8.4 * GB),
          available_bytes:
            scenario === 'warning'
              ? Math.round(2.6 * GB)
              : Math.round(6.4 * GB),
          used_percent: scenario === 'warning' ? 82.4 : 56.8,
          read_only: false,
          category: 'root',
        },
        {
          mount_point: '/var/lib/docker',
          device: '/dev/mmcblk1p2',
          fs_type: 'ext4',
          total_bytes: Math.round(14.8 * GB),
          used_bytes: Math.round(5.1 * GB),
          available_bytes: Math.round(6.4 * GB),
          used_percent: 34.5,
          read_only: false,
          category: 'docker',
        },
        {
          mount_point: '/mnt/sdcard-backup',
          device: '/dev/mmcblk0p1',
          fs_type: 'ext4',
          total_bytes: Math.round(29.2 * GB),
          used_bytes: Math.round(11.6 * GB),
          available_bytes: Math.round(17.6 * GB),
          used_percent: 39.7,
          read_only: false,
          category: 'sd_card',
        },
      ],
      net_rx_bytes_per_sec: scenario === 'offline' ? null : 438_200,
      net_tx_bytes_per_sec: scenario === 'offline' ? null : 392_100,
      net_errors_count: 0,
    },
    containers: [
      {
        id: 1,
        device_id: 'arm64-tvbox-01',
        recorded_at: recordedAtIso,
        container_name: 'app-nextjs',
        container_id_short: 'a94f21c8e10b',
        image: 'org/frontend-nextjs:prod',
        role_description: 'Next.js 15 Production Frontend (SSR/ISR)',
        is_critical_service: true,
        state: 'running',
        status_text: 'Up 14 days',
        cpu_percent:
          scenario === 'warning'
            ? 42.6
            : scenario === 'critical'
            ? 51.2
            : 11.4,
        memory_usage_bytes:
          scenario === 'critical'
            ? 1310 * MB
            : scenario === 'warning'
            ? 1190 * MB
            : 598 * MB,
        memory_limit_bytes: 1536 * MB,
        memory_percent:
          scenario === 'critical'
            ? 85.3
            : scenario === 'warning'
            ? 77.5
            : 38.9,
        restart_count: scenario === 'critical' ? 2 : 0,
        oom_killed: false,
        health_status: 'healthy',
        exit_code: 0,
        started_at: '2026-10-05T01:12:00Z',
      },
      {
        id: 2,
        device_id: 'arm64-tvbox-01',
        recorded_at: recordedAtIso,
        container_name: 'app-backend',
        container_id_short: 'c83d19b47f22',
        image: 'org/laravel-api:8.2-fpm',
        role_description: 'Laravel / PHP-FPM Production API Backend',
        is_critical_service: true,
        state: scenario === 'critical' ? 'exited' : 'running',
        status_text:
          scenario === 'critical'
            ? 'Exited (137) 2 minutes ago (OOMKilled)'
            : 'Up 14 days',
        cpu_percent: scenario === 'critical' ? 0 : 8.7,
        memory_usage_bytes: scenario === 'critical' ? 0 : 218 * MB,
        memory_limit_bytes: 512 * MB,
        memory_percent: scenario === 'critical' ? 0 : 42.6,
        restart_count: scenario === 'critical' ? 4 : 0,
        oom_killed: scenario === 'critical',
        health_status: scenario === 'critical' ? 'unhealthy' : 'healthy',
        exit_code: scenario === 'critical' ? 137 : 0,
        started_at: '2026-10-05T01:11:45Z',
      },
      {
        id: 3,
        device_id: 'arm64-tvbox-01',
        recorded_at: recordedAtIso,
        container_name: 'app-mysql',
        container_id_short: '71e80b3a91d4',
        image: 'mariadb:10.6-jammy',
        role_description: 'MariaDB 10.6 Primary Production Database',
        is_critical_service: true,
        state: 'running',
        status_text: 'Up 14 days (healthy)',
        cpu_percent: scenario === 'warning' ? 24.1 : 6.8,
        memory_usage_bytes: scenario === 'warning' ? 392 * MB : 342 * MB,
        memory_limit_bytes: 640 * MB,
        memory_percent: scenario === 'warning' ? 61.3 : 53.4,
        restart_count: 0,
        oom_killed: false,
        health_status: 'healthy',
        exit_code: 0,
        started_at: '2026-10-05T01:11:10Z',
      },
      {
        id: 4,
        device_id: 'arm64-tvbox-01',
        recorded_at: recordedAtIso,
        container_name: 'app-nginx',
        container_id_short: 'f02a44d19c01',
        image: 'nginx:1.25-alpine',
        role_description: 'Nginx Reverse Proxy & Static Asset Gateway',
        is_critical_service: true,
        state: 'running',
        status_text: 'Up 14 days',
        cpu_percent: 2.4,
        memory_usage_bytes: 28 * MB,
        memory_limit_bytes: 128 * MB,
        memory_percent: 21.9,
        restart_count: 0,
        oom_killed: false,
        health_status: 'healthy',
        exit_code: 0,
        started_at: '2026-10-05T01:12:15Z',
      },
      {
        id: 5,
        device_id: 'arm64-tvbox-01',
        recorded_at: recordedAtIso,
        container_name: 'cloudflare-tunnel',
        container_id_short: '99b4e1120a7c',
        image: 'cloudflare/cloudflared:latest',
        role_description: 'Cloudflare Zero-Trust Outbound Tunnel Daemon',
        is_critical_service: true,
        state: 'running',
        status_text: 'Up 14 days',
        cpu_percent: 3.1,
        memory_usage_bytes: 46 * MB,
        memory_limit_bytes: 128 * MB,
        memory_percent: 35.9,
        restart_count: 0,
        oom_killed: false,
        health_status: 'healthy',
        exit_code: 0,
        started_at: '2026-10-05T01:12:20Z',
      },
      {
        id: 6,
        device_id: 'arm64-tvbox-01',
        recorded_at: recordedAtIso,
        container_name: 'app-worker',
        container_id_short: '44c910ef82a3',
        image: 'org/laravel-api:8.2-fpm',
        role_description: 'Laravel Queue Worker (Notifications & Jobs)',
        is_critical_service: true,
        state: scenario === 'critical' ? 'restarting' : 'running',
        status_text:
          scenario === 'critical'
            ? 'Restarting (1) Less than a second ago'
            : 'Up 14 days',
        cpu_percent: scenario === 'critical' ? 0.5 : 1.9,
        memory_usage_bytes: scenario === 'critical' ? 14 * MB : 86 * MB,
        memory_limit_bytes: 256 * MB,
        memory_percent: scenario === 'critical' ? 5.5 : 33.6,
        restart_count: scenario === 'critical' ? 3 : 0,
        oom_killed: false,
        health_status: scenario === 'critical' ? 'unhealthy' : 'none',
        exit_code: scenario === 'critical' ? 1 : 0,
        started_at: '2026-10-05T01:11:55Z',
      },
      {
        id: 7,
        device_id: 'arm64-tvbox-01',
        recorded_at: recordedAtIso,
        container_name: 'app-redis',
        container_id_short: 'e1209ab83d11',
        image: 'redis:7-alpine',
        role_description: 'Redis 7 Cache & Queue Broker',
        is_critical_service: true,
        state: 'running',
        status_text: 'Up 14 days (healthy)',
        cpu_percent: 1.2,
        memory_usage_bytes: 34 * MB,
        memory_limit_bytes: 128 * MB,
        memory_percent: 26.6,
        restart_count: 0,
        oom_killed: false,
        health_status: 'healthy',
        exit_code: 0,
        started_at: '2026-10-05T01:11:15Z',
      },
      {
        id: 8,
        device_id: 'arm64-tvbox-01',
        recorded_at: recordedAtIso,
        container_name: 'app-phpmyadmin',
        container_id_short: '58d190fa22c9',
        image: 'phpmyadmin:5-fpm-alpine',
        role_description: 'Internal Database Administration UI',
        is_critical_service: false,
        state: 'running',
        status_text: 'Up 14 days',
        cpu_percent: 0.1,
        memory_usage_bytes: 24 * MB,
        memory_limit_bytes: 128 * MB,
        memory_percent: 18.8,
        restart_count: 0,
        oom_killed: false,
        health_status: 'none',
        exit_code: 0,
        started_at: '2026-10-05T01:12:30Z',
      },
    ],
    service_checks: [
      {
        id: 101,
        device_id: null,
        source: 'external_probe',
        target_name: 'public_website',
        display_name: 'Public Website (app.example.com)',
        endpoint_or_target: 'https://app.example.com',
        checked_at: fetchedAtIso,
        status:
          scenario === 'offline'
            ? 'critical'
            : scenario === 'critical'
            ? 'warning'
            : 'healthy',
        container_running: scenario === 'offline' ? null : true,
        app_responding: scenario !== 'offline',
        dependency_healthy: scenario !== 'critical' && scenario !== 'offline',
        public_reachable: scenario !== 'offline',
        http_status: scenario === 'offline' ? 530 : 200,
        response_time_ms:
          scenario === 'offline'
            ? null
            : scenario === 'critical'
            ? 1420
            : 184,
        error_code: scenario === 'offline' ? 'HTTP_5XX' : 'NONE',
        error_summary:
          scenario === 'offline'
            ? 'Cloudflare Error 530: Origin DNS / Tunnel unreachable'
            : null,
        verification_method:
          'External HTTPS GET via cron-job.org -> external-probe Edge Function',
      },
      {
        id: 102,
        device_id: null,
        source: 'external_probe',
        target_name: 'public_api',
        display_name: 'Public Laravel API Gateway',
        endpoint_or_target: 'https://app.example.com/api/v1/health-ping',
        checked_at: fetchedAtIso,
        status:
          scenario === 'offline' || scenario === 'critical'
            ? 'critical'
            : scenario === 'warning'
            ? 'warning'
            : 'healthy',
        container_running:
          scenario === 'offline' ? null : scenario !== 'critical',
        app_responding:
          scenario !== 'offline' && scenario !== 'critical',
        dependency_healthy:
          scenario !== 'offline' && scenario !== 'critical',
        public_reachable:
          scenario !== 'offline' && scenario !== 'critical',
        http_status:
          scenario === 'offline'
            ? 530
            : scenario === 'critical'
            ? 502
            : 200,
        response_time_ms:
          scenario === 'offline' || scenario === 'critical'
            ? null
            : scenario === 'warning'
            ? 940
            : 228,
        error_code:
          scenario === 'offline' || scenario === 'critical'
            ? 'HTTP_5XX'
            : 'NONE',
        error_summary:
          scenario === 'critical'
            ? 'HTTP 502 Bad Gateway: app-nginx upstream fastcgi://app-backend:9000 connection refused'
            : scenario === 'offline'
            ? 'Cloudflare Tunnel origin disconnected'
            : null,
        verification_method:
          'External HTTPS GET validating JSON status & DB/Redis ping',
      },
      {
        id: 103,
        device_id: 'arm64-tvbox-01',
        source: 'agent_local',
        target_name: 'nginx',
        display_name: 'Nginx Reverse Proxy (app-nginx)',
        endpoint_or_target: 'http://127.0.0.1:80/nginx_status',
        checked_at: recordedAtIso,
        status: scenario === 'offline' ? 'unknown' : 'healthy',
        container_running: true,
        app_responding: true,
        dependency_healthy: scenario !== 'critical',
        public_reachable: scenario !== 'offline',
        http_status: 200,
        response_time_ms: 4,
        error_code: 'NONE',
        error_summary: null,
        verification_method: 'Docker socket state + local loopback HTTP check',
      },
      {
        id: 104,
        device_id: 'arm64-tvbox-01',
        source: 'agent_local',
        target_name: 'laravel_backend',
        display_name: 'Laravel Backend (app-backend)',
        endpoint_or_target: 'fastcgi://app-backend:9000',
        checked_at: recordedAtIso,
        status:
          scenario === 'critical'
            ? 'critical'
            : scenario === 'warning'
            ? 'warning'
            : 'healthy',
        container_running: scenario !== 'critical',
        app_responding: scenario !== 'critical',
        dependency_healthy: true,
        public_reachable: scenario !== 'critical' && scenario !== 'offline',
        http_status: scenario === 'critical' ? 502 : 200,
        response_time_ms:
          scenario === 'critical' ? null : scenario === 'warning' ? 680 : 42,
        error_code:
          scenario === 'critical' ? 'OOM_TERMINATED' : 'NONE',
        error_summary:
          scenario === 'critical'
            ? 'Container exited with code 137 (SIGKILL — Linux OOM Killer)'
            : null,
        verification_method:
          'Docker inspect State.OOMKilled + PHP-FPM socket response',
      },
      {
        id: 105,
        device_id: 'arm64-tvbox-01',
        source: 'agent_local',
        target_name: 'mariadb',
        display_name: 'MariaDB 10.6 (app-mysql)',
        endpoint_or_target: 'tcp://app-mysql:3306 (mysqladmin ping)',
        checked_at: recordedAtIso,
        status: scenario === 'warning' ? 'warning' : 'healthy',
        container_running: true,
        app_responding: true,
        dependency_healthy: true,
        public_reachable: null,
        http_status: null,
        response_time_ms: scenario === 'warning' ? 68 : 7,
        error_code: 'NONE',
        error_summary: null,
        verification_method:
          'Container native healthcheck + lightweight TCP handshake (no production data queried)',
      },
      {
        id: 106,
        device_id: 'arm64-tvbox-01',
        source: 'agent_local',
        target_name: 'redis',
        display_name: 'Redis 7 Cache & Queue (app-redis)',
        endpoint_or_target: 'tcp://app-redis:6379 (PING -> PONG)',
        checked_at: recordedAtIso,
        status: 'healthy',
        container_running: true,
        app_responding: true,
        dependency_healthy: true,
        public_reachable: null,
        http_status: null,
        response_time_ms: 2,
        error_code: 'NONE',
        error_summary: null,
        verification_method: 'Docker native healthcheck (redis-cli ping)',
      },
      {
        id: 107,
        device_id: 'arm64-tvbox-01',
        source: 'agent_local',
        target_name: 'nextjs',
        display_name: 'Next.js Frontend (app-nextjs)',
        endpoint_or_target: 'http://127.0.0.1:3000',
        checked_at: recordedAtIso,
        status:
          scenario === 'warning' || scenario === 'critical'
            ? 'warning'
            : 'healthy',
        container_running: true,
        app_responding: true,
        dependency_healthy: scenario !== 'critical',
        public_reachable: scenario !== 'offline',
        http_status: 200,
        response_time_ms: scenario === 'warning' ? 390 : 38,
        error_code: 'NONE',
        error_summary:
          scenario === 'warning' || scenario === 'critical'
            ? 'High RSS memory utilization (>1.19 GB of 1536 MB limit)'
            : null,
        verification_method: 'Local HTTP HEAD + cgroup memory usage vs limit',
      },
      {
        id: 108,
        device_id: 'arm64-tvbox-01',
        source: 'agent_local',
        target_name: 'queue_worker',
        display_name: 'Laravel Queue Worker (app-worker)',
        endpoint_or_target: 'container://app-worker',
        checked_at: recordedAtIso,
        status: scenario === 'critical' ? 'critical' : 'healthy',
        container_running: scenario !== 'critical',
        app_responding: scenario !== 'critical',
        dependency_healthy: scenario !== 'critical',
        public_reachable: null,
        http_status: null,
        response_time_ms: null,
        error_code:
          scenario === 'critical' ? 'CONTAINER_STOPPED' : 'NONE',
        error_summary:
          scenario === 'critical'
            ? 'Container restarting (RestartCount=3) due to backend dependency loss'
            : null,
        verification_method: 'Docker process state & restart counter delta',
      },
      {
        id: 109,
        device_id: 'arm64-tvbox-01',
        source: 'agent_local',
        target_name: 'cloudflare_tunnel',
        display_name: 'Cloudflare Tunnel (cloudflare-tunnel)',
        endpoint_or_target: 'container://cloudflare-tunnel',
        checked_at: recordedAtIso,
        status: scenario === 'offline' ? 'critical' : 'healthy',
        container_running: scenario !== 'offline',
        app_responding: scenario !== 'offline',
        dependency_healthy: scenario !== 'offline',
        public_reachable: scenario !== 'offline',
        http_status: scenario === 'offline' ? 530 : 200,
        response_time_ms: scenario === 'offline' ? null : 19,
        error_code: scenario === 'offline' ? 'NETWORK_ERROR' : 'NONE',
        error_summary:
          scenario === 'offline'
            ? 'Tunnel edge connection lost; TV Box host unreachable'
            : null,
        verification_method: 'Cloudflared container state + external edge verification',
      },
      {
        id: 110,
        device_id: null,
        source: 'external_probe',
        target_name: 'ingestion_endpoint',
        display_name: 'Supabase Ingestion API (ingest-metrics)',
        endpoint_or_target:
          'https://your-project-ref.supabase.co/functions/v1/ingest-metrics',
        checked_at: fetchedAtIso,
        status: 'healthy',
        container_running: true,
        app_responding: true,
        dependency_healthy: true,
        public_reachable: true,
        http_status: 200,
        response_time_ms: 86,
        error_code: 'NONE',
        error_summary: null,
        verification_method: 'Edge Function health status & PostgreSQL write latency',
      },
    ],
    alerts: [
      ...(scenario === 'critical'
        ? [
            {
              id: 'alt-crit-001',
              device_id: 'arm64-tvbox-01',
              rule_key: 'container_oom_exit',
              source: 'docker_engine' as const,
              severity: 'critical' as const,
              status: 'open' as const,
              title: 'Critical Container app-backend Exited (Code 137 / OOMKilled)',
              observation:
                'Docker inspect reports container app-backend in state "exited" with ExitCode=137 and OOMKilled=true. Kernel /proc/vmstat oom_kill counter increased by 2. Public API endpoint returns HTTP 502.',
              probable_cause:
                'Combined memory footprint of app-nextjs (1.31 GB / 1.50 GB limit), app-mysql (392 MB), and PHP-FPM workers exhausted physical 2 GB RAM and triggered the Linux kernel Out-Of-Memory killer.',
              recommended_check:
                'Inspect `dmesg -T | grep -i -E "killed process|oom"` on TV Box via SSH and review PHP-FPM `pm.max_children` alongside Next.js memory usage before manually restarting.',
              first_seen_at: new Date(nowMs - 4 * 60_000).toISOString(),
              last_seen_at: recordedAtIso,
              acknowledged_at: null,
              acknowledged_by: null,
              resolved_at: null,
              last_notified_at: new Date(nowMs - 4 * 60_000).toISOString(),
              notification_count: 1,
              cooldown_minutes: 60,
              events: [
                {
                  id: 'evt-1',
                  alert_id: 'alt-crit-001',
                  event_type: 'opened' as const,
                  created_at: new Date(nowMs - 4 * 60_000).toISOString(),
                  actor: 'ingest-metrics (Alert Engine)',
                  summary:
                    'Opened CRITICAL alert: app-backend exited with code 137 (OOMKilled=true).',
                },
                {
                  id: 'evt-2',
                  alert_id: 'alt-crit-001',
                  event_type: 'email_sent' as const,
                  created_at: new Date(nowMs - 4 * 60_000 + 2000).toISOString(),
                  actor: 'Resend Notification Service',
                  summary:
                    'Dispatched alert email to admin@example.com (60m cooldown started).',
                },
                {
                  id: 'evt-3',
                  alert_id: 'alt-crit-001',
                  event_type: 'email_suppressed_cooldown' as const,
                  created_at: recordedAtIso,
                  actor: 'ingest-metrics (Alert Engine)',
                  summary:
                    'Condition still active; duplicate email suppressed by 60-minute cooldown policy.',
                },
              ],
            },
          ]
        : []),
      ...(scenario === 'warning' || scenario === 'critical'
        ? [
            {
              id: 'alt-warn-002',
              device_id: 'arm64-tvbox-01',
              rule_key: 'ram_available_low',
              source: 'agent_metrics' as const,
              severity: 'warning' as const,
              status: 'open' as const,
              title: 'Available RAM Below 15% Across 4 Consecutive Checks',
              observation:
                'Linux MemAvailable measured at 238 MB (11.9% of 1.95 GB total RAM) across 4 consecutive 60s intervals. Swap usage increased to 1.21 GB with active pswpin/pswpout.',
              probable_cause:
                'Next.js container RSS grew to 1.19 GB while MariaDB buffer pool holds 392 MB, forcing kernel to page anonymous memory out to eMMC swap.',
              recommended_check:
                'Monitor swap I/O wait (cpu_iowait_percent = 16.2%) and check whether Next.js ISR cache or concurrent build/crawl requests are inflating Node.js heap.',
              first_seen_at: new Date(nowMs - 6 * 60_000).toISOString(),
              last_seen_at: recordedAtIso,
              acknowledged_at: null,
              acknowledged_by: null,
              resolved_at: null,
              last_notified_at: new Date(nowMs - 6 * 60_000).toISOString(),
              notification_count: 1,
              cooldown_minutes: 60,
              events: [
                {
                  id: 'evt-w1',
                  alert_id: 'alt-warn-002',
                  event_type: 'opened' as const,
                  created_at: new Date(nowMs - 6 * 60_000).toISOString(),
                  actor: 'ingest-metrics (Alert Engine)',
                  summary:
                    'Confirmed 3 consecutive samples with MemAvailable < 15%. Opened WARNING alert.',
                },
                {
                  id: 'evt-w2',
                  alert_id: 'alt-warn-002',
                  event_type: 'email_sent' as const,
                  created_at: new Date(nowMs - 6 * 60_000 + 1500).toISOString(),
                  actor: 'Resend Notification Service',
                  summary: 'Sent warning notification email to ops recipients.',
                },
              ],
            },
            {
              id: 'alt-warn-003',
              device_id: 'arm64-tvbox-01',
              rule_key: 'soc_temp_high',
              source: 'agent_metrics' as const,
              severity: 'warning' as const,
              status: 'open' as const,
              title: 'ARM64 SoC Thermal Sensor Exceeded 75.0°C Threshold',
              observation:
                'sysfs /sys/class/thermal/thermal_zone0/temp reported 76.8°C (threshold: 75.0°C) for 3 consecutive checks.',
              probable_cause:
                'Sustained CPU load (>88%) and eMMC swap I/O inside enclosed TV Box chassis with passive heatsink.',
              recommended_check:
                'Verify physical airflow around Tanix TX3 Mini and check for runaway CPU processes.',
              first_seen_at: new Date(nowMs - 5 * 60_000).toISOString(),
              last_seen_at: recordedAtIso,
              acknowledged_at: null,
              acknowledged_by: null,
              resolved_at: null,
              last_notified_at: new Date(nowMs - 5 * 60_000).toISOString(),
              notification_count: 1,
              cooldown_minutes: 60,
              events: [],
            },
          ]
        : []),
      ...(scenario === 'stale'
        ? [
            {
              id: 'alt-stale-001',
              device_id: 'arm64-tvbox-01',
              rule_key: 'heartbeat_stale',
              source: 'heartbeat_monitor' as const,
              severity: 'warning' as const,
              status: 'open' as const,
              title: 'TV Box Heartbeat Delayed (> 3 Minutes)',
              observation:
                'Last metric ingestion from arm64-tvbox-01 was recorded 4m 35s ago. External website check still returns HTTP 200 (184ms).',
              probable_cause:
                'Temporary outbound network packet loss, cron/timer delay due to high I/O wait on TV Box, or monitoring agent paused.',
              recommended_check:
                'Wait for next 60s cycle or check `systemctl status server-monitor.timer` on TV Box.',
              first_seen_at: new Date(nowMs - 95_000).toISOString(),
              last_seen_at: fetchedAtIso,
              acknowledged_at: null,
              acknowledged_by: null,
              resolved_at: null,
              last_notified_at: new Date(nowMs - 95_000).toISOString(),
              notification_count: 1,
              cooldown_minutes: 60,
              events: [],
            },
          ]
        : []),
      ...(scenario === 'offline'
        ? [
            {
              id: 'alt-off-001',
              device_id: 'arm64-tvbox-01',
              rule_key: 'heartbeat_offline',
              source: 'heartbeat_monitor' as const,
              severity: 'critical' as const,
              status: 'open' as const,
              title: 'TV Box Unreachable > 15 Minutes & Public Site HTTP 530',
              observation:
                'No metrics received from arm64-tvbox-01 for 18m 10s. External probe to https://app.example.com failed with HTTP 530 (Cloudflare Tunnel Origin Unreachable).',
              probable_cause:
                'ISP internet outage at server location, power loss to Tanix TX3 Mini, or whole-system kernel hang from severe swap thrashing.',
              recommended_check:
                'Check local power and router link at server premises; inspect `/var/log/syslog` after host recovers.',
              first_seen_at: new Date(nowMs - 15 * 60_000).toISOString(),
              last_seen_at: fetchedAtIso,
              acknowledged_at: null,
              acknowledged_by: null,
              resolved_at: null,
              last_notified_at: new Date(nowMs - 15 * 60_000).toISOString(),
              notification_count: 1,
              cooldown_minutes: 60,
              events: [],
            },
          ]
        : []),
      {
        id: 'alt-hist-101',
        device_id: 'arm64-tvbox-01',
        rule_key: 'external_api_latency',
        source: 'external_uptime',
        severity: 'warning',
        status: 'resolved',
        title: 'Public API Response Time Exceeded 800ms (Resolved)',
        observation:
          '3 consecutive external probes to https://app.example.com/api/v1/health-ping recorded response times between 840ms and 1,120ms.',
        probable_cause:
          'Scheduled database backup and transient Cloudflare edge rerouting.',
        recommended_check: 'No action needed — latency returned to 220ms baseline.',
        first_seen_at: '2026-10-18T19:10:00Z',
        last_seen_at: '2026-10-18T19:22:00Z',
        acknowledged_at: '2026-10-18T19:15:00Z',
        acknowledged_by: 'admin@example.com',
        resolved_at: '2026-10-18T19:24:00Z',
        last_notified_at: '2026-10-18T19:10:05Z',
        notification_count: 2,
        cooldown_minutes: 60,
        events: [
          {
            id: 'evt-h1',
            alert_id: 'alt-hist-101',
            event_type: 'opened',
            created_at: '2026-10-18T19:10:00Z',
            actor: 'external-probe',
            summary: 'Opened warning alert after 3 slow API responses.',
          },
          {
            id: 'evt-h2',
            alert_id: 'alt-hist-101',
            event_type: 'acknowledged',
            created_at: '2026-10-18T19:15:00Z',
            actor: 'admin@example.com',
            summary: 'Acknowledged from Admin Dashboard.',
          },
          {
            id: 'evt-h3',
            alert_id: 'alt-hist-101',
            event_type: 'resolved',
            created_at: '2026-10-18T19:24:00Z',
            actor: 'external-probe',
            summary: 'Auto-resolved after 2 healthy probes (215ms).',
          },
        ],
      },
    ],
    time_series: buildTimeSeries(nowMs, scenario),
    settings,
  };
}
