import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLinuxMemoryBreakdown,
  computeBentoHubSummary,
  evaluateConsecutiveBreachAndCooldown,
  evaluateHeartbeatStatus,
  formatBytes,
  formatMetricValue,
  sliceTimeSeriesByRange,
  validateIngestPayload,
} from './monitoringLogic.ts';

test('evaluateHeartbeatStatus distinguishes healthy, stale, offline, and unknown', () => {
  const nowMs = Date.parse('2026-10-19T12:00:00Z');

  const healthy = evaluateHeartbeatStatus('2026-10-19T11:59:15Z', nowMs, 180, 600);
  assert.equal(healthy.status, 'healthy');
  assert.equal(healthy.ageSeconds, 45);

  const stale = evaluateHeartbeatStatus('2026-10-19T11:55:30Z', nowMs, 180, 600);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.ageSeconds, 270);

  const offline = evaluateHeartbeatStatus('2026-10-19T11:45:00Z', nowMs, 180, 600);
  assert.equal(offline.status, 'offline');
  assert.equal(offline.ageSeconds, 900);

  const unknown = evaluateHeartbeatStatus(null, nowMs, 180, 600);
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.ageSeconds, null);
});

test('formatMetricValue and formatBytes strictly separate 0 from null (N/A) and undefined (Missing)', () => {
  assert.equal(formatMetricValue(0, '%', 0), '0%');
  assert.equal(formatMetricValue(0, '°C', 1), '0.0°C');
  assert.equal(formatMetricValue(null, '°C', 1, { nullLabel: 'N/A (Unsupported)' }), 'N/A (Unsupported)');
  assert.equal(formatMetricValue(undefined, '%', 1), 'Missing');

  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(null), 'N/A');
  assert.equal(formatBytes(undefined), 'Missing');
  assert.equal(formatBytes(1073741824, 2), '1.00 GB');
});

test('calculateLinuxMemoryBreakdown treats MemAvailable as true headroom and does not lose cache', () => {
  const breakdown = calculateLinuxMemoryBreakdown({
    totalBytes: 2000 * 1024 * 1024, // 2000 MB
    availableBytes: 600 * 1024 * 1024, // 600 MB available (30%)
    cachedBytes: 500 * 1024 * 1024,
    buffersBytes: 100 * 1024 * 1024,
  });

  assert.equal(breakdown.availablePercent, 30);
  assert.equal(breakdown.usedPercent, 70);
  assert.equal(breakdown.cacheAndBuffersBytes, 600 * 1024 * 1024);
});

test('evaluateConsecutiveBreachAndCooldown prevents single-spike false positives and enforces email cooldown', () => {
  const nowMs = Date.parse('2026-10-19T12:00:00Z');

  // Single spike below 15% available RAM (only 1 sample, requires 3) -> should NOT breach
  const singleSpike = evaluateConsecutiveBreachAndCooldown({
    recentValues: [22.5, 19.0, 12.4],
    threshold: 15,
    comparison: 'less_than',
    requiredConsecutive: 3,
    existingAlertStatus: null,
    lastNotifiedAtIso: null,
    cooldownMinutes: 60,
    nowMs,
  });
  assert.equal(singleSpike.isBreached, false);
  assert.equal(singleSpike.consecutiveCount, 1);
  assert.equal(singleSpike.shouldSendEmail, false);

  // 3 consecutive samples below 15% with no prior email -> SHOULD breach and send email
  const confirmedBreach = evaluateConsecutiveBreachAndCooldown({
    recentValues: [21.0, 14.2, 13.8, 11.9],
    threshold: 15,
    comparison: 'less_than',
    requiredConsecutive: 3,
    existingAlertStatus: 'open',
    lastNotifiedAtIso: null,
    cooldownMinutes: 60,
    nowMs,
  });
  assert.equal(confirmedBreach.isBreached, true);
  assert.equal(confirmedBreach.consecutiveCount, 3);
  assert.equal(confirmedBreach.shouldSendEmail, true);

  // Email sent 20 minutes ago (cooldown 60m) -> still breached, but email suppressed
  const inCooldown = evaluateConsecutiveBreachAndCooldown({
    recentValues: [14.2, 13.8, 11.9],
    threshold: 15,
    comparison: 'less_than',
    requiredConsecutive: 3,
    existingAlertStatus: 'open',
    lastNotifiedAtIso: '2026-10-19T11:40:00Z',
    cooldownMinutes: 60,
    nowMs,
  });
  assert.equal(inCooldown.isBreached, true);
  assert.equal(inCooldown.shouldSendEmail, false);
});

test('validateIngestPayload rejects malformed telemetry and accepts valid TV Box payload', () => {
  const invalid = validateIngestPayload({
    device_id: 'ab',
    cpu_percent: 145,
    temperature_celsius: 500,
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length >= 3, true);

  const valid = validateIngestPayload({
    device_id: 'arm64-tvbox-01',
    idempotency_key: 'arm64-tvbox-01:202610191200',
    recorded_at: '2026-10-19T12:00:00Z',
    cpu_percent: 34.2,
    memory_total_bytes: 2040109465,
    temperature_celsius: 58.5,
    containers: [],
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.errors.length, 0);
});

test('computeBentoHubSummary calculates thermal headroom, network throughput, and missing containers accurately from real schema fields', () => {
  const summaryWithSensor = computeBentoHubSummary({
    expectedContainers: ['nginx', 'mariadb', 'redis'],
    system: {
      id: 1,
      device_id: 'arm64-tvbox-01',
      idempotency_key: 'k1',
      recorded_at: '2026-10-19T12:00:00Z',
      uptime_seconds: 86400,
      cpu_percent: 38.4,
      cpu_iowait_percent: 2.1,
      load_1: 0.62,
      load_5: 0.58,
      load_15: 0.49,
      memory_total_bytes: 2147483648,
      memory_used_bytes: 1200000000,
      memory_available_bytes: 947483648,
      memory_cached_bytes: 400000000,
      memory_buffers_bytes: 50000000,
      swap_total_bytes: 1073741824,
      swap_used_bytes: 148897792,
      swap_in_pages: 0,
      swap_out_pages: 0,
      oom_kill_count: 0,
      temperature_celsius: 51.2,
      thermal_zones_json: [{ zone: 'thermal_zone0', type: 'soc_thermal', celsius: 51.2 }],
      root_disk_total_bytes: 16000000000,
      root_disk_used_bytes: 5800000000,
      root_disk_percent: 36.2,
      mounts_json: [],
      net_rx_bytes_per_sec: 102400,
      net_tx_bytes_per_sec: 51200,
      net_errors_count: 0,
    },
    containers: [
      {
        id: 1,
        device_id: 'arm64-tvbox-01',
        recorded_at: '2026-10-19T12:00:00Z',
        container_name: 'nginx',
        container_id_short: 'a1b2c3d4',
        image: 'nginx:alpine',
        role_description: 'Reverse Proxy',
        is_critical_service: true,
        state: 'running',
        status_text: 'Up 2 days',
        cpu_percent: 1.2,
        memory_usage_bytes: 24000000,
        memory_limit_bytes: 2147483648,
        memory_percent: 1.1,
        restart_count: 0,
        oom_killed: false,
        health_status: 'healthy',
        exit_code: 0,
        started_at: '2026-10-17T12:00:00Z',
      },
      {
        id: 2,
        device_id: 'arm64-tvbox-01',
        recorded_at: '2026-10-19T12:00:00Z',
        container_name: 'mariadb',
        container_id_short: 'e5f6g7h8',
        image: 'mariadb:10.11',
        role_description: 'Database',
        is_critical_service: true,
        state: 'exited',
        status_text: 'Exited (137)',
        cpu_percent: 0,
        memory_usage_bytes: 0,
        memory_limit_bytes: 2147483648,
        memory_percent: 0,
        restart_count: 2,
        oom_killed: true,
        health_status: 'unhealthy',
        exit_code: 137,
        started_at: '2026-10-17T12:00:00Z',
      },
    ],
    serviceChecks: [],
    settings: {
      ram_available_warn_percent: 18,
      ram_available_critical_percent: 10,
      swap_used_warn_percent: 50,
      cpu_warn_percent: 80,
      cpu_critical_percent: 92,
      temp_warn_celsius: 75,
      temp_critical_celsius: 85,
      disk_warn_percent: 80,
      disk_critical_percent: 90,
      heartbeat_stale_seconds: 180,
      heartbeat_offline_seconds: 600,
      consecutive_breaches_required: 3,
      alert_cooldown_minutes: 60,
      alert_recipient_emails: ['admin@example.com'],
      email_provider: 'resend_api',
      default_chart_range: '6h',
      raw_retention_days: 30,
      hourly_rollup_retention_days: 365,
    },
  });

  assert.equal(summaryWithSensor.thermalHeadroomCelsius, 33.8);
  assert.equal(summaryWithSensor.combinedNetBytesPerSec, 153600);
  assert.equal(summaryWithSensor.expectedContainersCount, 3);
  assert.equal(summaryWithSensor.runningContainersCount, 1);
  assert.deepEqual(summaryWithSensor.missingExpectedContainers, ['mariadb', 'redis']);

  const points = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(sliceTimeSeriesByRange(points, '1h').length, 4);
  assert.equal(sliceTimeSeriesByRange(points, '6h').length, 7);
  assert.equal(sliceTimeSeriesByRange(points, '24h').length, 10);
});

