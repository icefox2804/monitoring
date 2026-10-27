import type {
  AlertRecord,
  ContainerMetricRecord,
  MonitoringSettings,
  ServiceCheckRecord,
  SystemHealthStatus,
  SystemMetricRecord,
} from '../types/monitoring.ts';

export interface HeartbeatEvaluation {
  status: 'healthy' | 'stale' | 'offline' | 'unknown';
  ageSeconds: number | null;
  label: string;
}

/**
 * Evaluates TV Box heartbeat freshness based on last_seen_at UTC timestamp.
 * Explicitly distinguishes healthy, stale (> warn threshold), offline (> critical threshold), and unknown.
 */
export function evaluateHeartbeatStatus(
  lastSeenAtIso: string | null | undefined,
  nowMs: number,
  staleThresholdSeconds = 180,
  offlineThresholdSeconds = 600
): HeartbeatEvaluation {
  if (!lastSeenAtIso) {
    return {
      status: 'unknown',
      ageSeconds: null,
      label: 'No heartbeat recorded',
    };
  }

  const parsedMs = Date.parse(lastSeenAtIso);
  if (Number.isNaN(parsedMs)) {
    return {
      status: 'unknown',
      ageSeconds: null,
      label: 'Invalid timestamp',
    };
  }

  const ageSeconds = Math.max(0, Math.floor((nowMs - parsedMs) / 1000));

  if (ageSeconds >= offlineThresholdSeconds) {
    return {
      status: 'offline',
      ageSeconds,
      label: `Offline (${formatDurationShort(ageSeconds)} ago)`,
    };
  }

  if (ageSeconds >= staleThresholdSeconds) {
    return {
      status: 'stale',
      ageSeconds,
      label: `Stale (${formatDurationShort(ageSeconds)} ago)`,
    };
  }

  return {
    status: 'healthy',
    ageSeconds,
    label: `${ageSeconds}s ago`,
  };
}

/**
 * Formats duration in seconds into human-readable compact form (e.g. "4m 20s", "2d 14h 12m").
 */
export function formatDurationShort(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return 'N/A';
  }
  if (seconds < 0) return '0s';
  if (seconds === 0) return '0s';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Strictly distinguishes numeric 0 from null (Unsupported / N/A) and undefined (Missing).
 * Never substitutes 0 when data is missing or null.
 */
export function formatMetricValue(
  value: number | null | undefined,
  unit = '',
  decimals = 1,
  options?: {
    nullLabel?: string;
    undefinedLabel?: string;
  }
): string {
  if (value === undefined) {
    return options?.undefinedLabel ?? 'Missing';
  }
  if (value === null) {
    return options?.nullLabel ?? 'N/A';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return options?.nullLabel ?? 'N/A';
  }
  const formatted =
    decimals === 0 ? Math.round(num).toString() : num.toFixed(decimals);
  return unit ? `${formatted}${unit}` : formatted;
}

/**
 * Formats byte counts cleanly while preserving exact 0 B vs N/A (null) vs Missing (undefined).
 */
export function formatBytes(
  bytes: number | null | undefined,
  decimals = 1
): string {
  if (bytes === undefined) return 'Missing';
  if (bytes === null) return 'N/A';
  const num = typeof bytes === 'number' ? bytes : Number(bytes);
  if (Number.isNaN(num) || !Number.isFinite(num)) return 'N/A';
  if (num === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(Math.abs(num)) / Math.log(k))
  );
  const val = num / Math.pow(k, i);
  const formatted = i === 0 ? Math.round(val).toString() : val.toFixed(decimals);
  return `${formatted} ${sizes[i]}`;
}

/**
 * Computes Linux memory breakdown accurately.
 * In Linux, cache and buffers are reclaimable by the kernel when applications need memory.
 * `MemAvailable` represents true available memory without swapping.
 */
export function calculateLinuxMemoryBreakdown(params: {
  totalBytes: number | null;
  availableBytes: number | null;
  cachedBytes: number | null;
  buffersBytes: number | null;
}): {
  usedBytes: number | null;
  usedPercent: number | null;
  availablePercent: number | null;
  cacheAndBuffersBytes: number | null;
} {
  const { totalBytes, availableBytes, cachedBytes, buffersBytes } = params;
  if (
    totalBytes === null ||
    availableBytes === null ||
    totalBytes <= 0 ||
    availableBytes < 0
  ) {
    return {
      usedBytes: null,
      usedPercent: null,
      availablePercent: null,
      cacheAndBuffersBytes: null,
    };
  }

  const effectiveUsed = Math.max(0, totalBytes - availableBytes);
  const usedPercent = Number(((effectiveUsed / totalBytes) * 100).toFixed(1));
  const availablePercent = Number(
    ((availableBytes / totalBytes) * 100).toFixed(1)
  );
  const cacheAndBuffersBytes =
    cachedBytes !== null || buffersBytes !== null
      ? (cachedBytes ?? 0) + (buffersBytes ?? 0)
      : null;

  return {
    usedBytes: effectiveUsed,
    usedPercent,
    availablePercent,
    cacheAndBuffersBytes,
  };
}

/**
 * Evaluates overall system status from device heartbeat, system metrics, containers, service checks, and open alerts.
 */
export function evaluateOverallSystemState(params: {
  heartbeat: HeartbeatEvaluation;
  system: SystemMetricRecord | null;
  containers: ContainerMetricRecord[];
  serviceChecks: ServiceCheckRecord[];
  alerts: AlertRecord[];
  settings: MonitoringSettings;
}): {
  status: SystemHealthStatus;
  headline: string;
  subheadline: string;
} {
  const { heartbeat, system, containers, serviceChecks, alerts, settings } =
    params;

  if (heartbeat.status === 'offline') {
    return {
      status: 'offline',
      headline: 'TV Box Unreachable (Offline)',
      subheadline: `No telemetry received from TV Box for ${formatDurationShort(
        heartbeat.ageSeconds
      )}. External probes active.`,
    };
  }

  if (heartbeat.status === 'unknown' || !system) {
    return {
      status: 'unknown',
      headline: 'Telemetry State Unknown',
      subheadline: 'Waiting for initial validated metric payload from TV Box.',
    };
  }

  const openCriticalAlerts = alerts.filter(
    (a) => a.status !== 'resolved' && a.severity === 'critical'
  );
  const criticalContainersDown = containers.filter(
    (c) => c.is_critical_service && c.state !== 'running'
  );
  const criticalServiceDown = serviceChecks.filter(
    (s) => s.status === 'critical'
  );

  if (
    openCriticalAlerts.length > 0 ||
    criticalContainersDown.length > 0 ||
    criticalServiceDown.length > 0
  ) {
    const primaryReason =
      openCriticalAlerts[0]?.title ||
      (criticalContainersDown[0]
        ? `Critical container ${criticalContainersDown[0].container_name} is ${criticalContainersDown[0].state}`
        : `Service ${criticalServiceDown[0]?.display_name} check failed`);
    return {
      status: 'critical',
      headline: 'Critical Incident Active',
      subheadline: primaryReason,
    };
  }

  if (heartbeat.status === 'stale') {
    return {
      status: 'stale',
      headline: 'Telemetry Data Stale',
      subheadline: `Last metric packet arrived ${formatDurationShort(
        heartbeat.ageSeconds
      )} ago (threshold: ${settings.heartbeat_stale_seconds}s). Showing last known state.`,
    };
  }

  const openWarningAlerts = alerts.filter(
    (a) => a.status !== 'resolved' && a.severity === 'warning'
  );
  const memBreakdown = calculateLinuxMemoryBreakdown({
    totalBytes: system.memory_total_bytes,
    availableBytes: system.memory_available_bytes,
    cachedBytes: system.memory_cached_bytes,
    buffersBytes: system.memory_buffers_bytes,
  });

  const ramWarning =
    memBreakdown.availablePercent !== null &&
    memBreakdown.availablePercent < settings.ram_available_warn_percent;
  const tempWarning =
    system.temperature_celsius !== null &&
    system.temperature_celsius >= settings.temp_warn_celsius;
  const cpuWarning =
    system.cpu_percent !== null &&
    system.cpu_percent >= settings.cpu_warn_percent;

  if (
    openWarningAlerts.length > 0 ||
    ramWarning ||
    tempWarning ||
    cpuWarning
  ) {
    const reason =
      openWarningAlerts[0]?.title ||
      (ramWarning
        ? `Available RAM low (${memBreakdown.availablePercent}%)`
        : tempWarning
        ? `SoC temperature elevated (${system.temperature_celsius}°C)`
        : `CPU utilization elevated (${system.cpu_percent}%)`);
    return {
      status: 'warning',
      headline: 'Degraded / Warning Threshold Breached',
      subheadline: reason,
    };
  }

  return {
    status: 'healthy',
    headline: 'All Production Services Nominal',
    subheadline:
      'Website app.example.com, Laravel API, MariaDB, Redis, Cloudflare Tunnel, and TV Box resources operating within safe bounds.',
  };
}

/**
 * Evaluates whether consecutive samples breach a resource threshold (anti-flapping logic)
 * and whether an alert email should be dispatched or suppressed due to cooldown/acknowledgement.
 */
export function evaluateConsecutiveBreachAndCooldown(params: {
  recentValues: (number | null)[];
  threshold: number;
  comparison: 'less_than' | 'greater_or_equal';
  requiredConsecutive: number;
  existingAlertStatus?: 'open' | 'acknowledged' | 'resolved' | null;
  lastNotifiedAtIso?: string | null;
  cooldownMinutes: number;
  nowMs: number;
}): {
  isBreached: boolean;
  consecutiveCount: number;
  shouldSendEmail: boolean;
  suppressionReason: string | null;
} {
  const {
    recentValues,
    threshold,
    comparison,
    requiredConsecutive,
    existingAlertStatus,
    lastNotifiedAtIso,
    cooldownMinutes,
    nowMs,
  } = params;

  let consecutiveCount = 0;
  for (let i = recentValues.length - 1; i >= 0; i--) {
    const val = recentValues[i];
    if (val === null || val === undefined || Number.isNaN(val)) {
      break;
    }
    const matched =
      comparison === 'less_than' ? val < threshold : val >= threshold;
    if (matched) {
      consecutiveCount++;
    } else {
      break;
    }
  }

  const isBreached = consecutiveCount >= Math.max(1, requiredConsecutive);

  if (!isBreached) {
    return {
      isBreached: false,
      consecutiveCount,
      shouldSendEmail: false,
      suppressionReason: 'Threshold not breached across required samples',
    };
  }

  if (existingAlertStatus === 'acknowledged') {
    return {
      isBreached: true,
      consecutiveCount,
      shouldSendEmail: false,
      suppressionReason: 'Alert is already acknowledged by administrator',
    };
  }

  if (lastNotifiedAtIso) {
    const lastMs = Date.parse(lastNotifiedAtIso);
    if (!Number.isNaN(lastMs)) {
      const elapsedMinutes = (nowMs - lastMs) / 60000;
      if (elapsedMinutes < cooldownMinutes) {
        return {
          isBreached: true,
          consecutiveCount,
          shouldSendEmail: false,
          suppressionReason: `Cooldown active (${Math.ceil(
            cooldownMinutes - elapsedMinutes
          )}m remaining)`,
        };
      }
    }
  }

  return {
    isBreached: true,
    consecutiveCount,
    shouldSendEmail: true,
    suppressionReason: null,
  };
}

/**
 * Validates incoming telemetry payload from TV Box agent (mirrors Edge Function schema check).
 */
export function validateIngestPayload(payload: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a JSON object'] };
  }

  const obj = payload as Record<string, unknown>;

  if (
    typeof obj.device_id !== 'string' ||
    obj.device_id.trim().length < 3 ||
    obj.device_id.length > 64
  ) {
    errors.push('Invalid or missing device_id (must be 3-64 chars)');
  }

  if (
    typeof obj.idempotency_key !== 'string' ||
    obj.idempotency_key.trim().length < 5
  ) {
    errors.push('Invalid or missing idempotency_key');
  }

  if (typeof obj.recorded_at !== 'string' || Number.isNaN(Date.parse(obj.recorded_at))) {
    errors.push('Invalid or missing recorded_at ISO timestamp');
  }

  if (obj.cpu_percent !== null && obj.cpu_percent !== undefined) {
    if (
      typeof obj.cpu_percent !== 'number' ||
      obj.cpu_percent < 0 ||
      obj.cpu_percent > 100
    ) {
      errors.push('cpu_percent must be a number between 0 and 100');
    }
  }

  if (obj.memory_total_bytes !== undefined && obj.memory_total_bytes !== null) {
    if (
      typeof obj.memory_total_bytes !== 'number' ||
      obj.memory_total_bytes <= 0
    ) {
      errors.push('memory_total_bytes must be a positive integer');
    }
  }

  if (obj.temperature_celsius !== null && obj.temperature_celsius !== undefined) {
    if (
      typeof obj.temperature_celsius !== 'number' ||
      obj.temperature_celsius < -20 ||
      obj.temperature_celsius > 150
    ) {
      errors.push('temperature_celsius out of realistic hardware bounds (-20 to 150 C)');
    }
  }

  if (!Array.isArray(obj.containers)) {
    errors.push('containers must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface BentoHubSummary {
  thermalHeadroomCelsius: number | null;
  thermalProgressPercent: number | null;
  combinedNetBytesPerSec: number | null;
  expectedContainersCount: number;
  runningContainersCount: number;
  missingExpectedContainers: string[];
  externalProbes: ServiceCheckRecord[];
  localChecks: ServiceCheckRecord[];
}

/**
 * Pure derivation of Bento Telemetry Hub metrics strictly from Supabase schema records.
 * Never fabricates unsupported hardware sensors; preserves null when data is unavailable.
 */
export function computeBentoHubSummary(params: {
  expectedContainers: string[];
  system: SystemMetricRecord | null;
  containers: ContainerMetricRecord[];
  serviceChecks: ServiceCheckRecord[];
  settings: MonitoringSettings;
}): BentoHubSummary {
  const { expectedContainers, system, containers, serviceChecks, settings } =
    params;

  const temp = system?.temperature_celsius ?? null;
  const critTemp = settings.temp_critical_celsius;

  const thermalHeadroomCelsius =
    temp !== null && !Number.isNaN(temp)
      ? Number((critTemp - temp).toFixed(1))
      : null;

  const thermalProgressPercent =
    temp !== null && !Number.isNaN(temp) && critTemp > 0
      ? Math.min(100, Math.max(0, Number(((temp / critTemp) * 100).toFixed(1))))
      : null;

  const rx = system?.net_rx_bytes_per_sec ?? null;
  const tx = system?.net_tx_bytes_per_sec ?? null;
  const combinedNetBytesPerSec =
    rx !== null || tx !== null ? (rx ?? 0) + (tx ?? 0) : null;

  const runningNames = new Set(
    containers.filter((c) => c.state === 'running').map((c) => c.container_name)
  );
  const missingExpectedContainers = expectedContainers.filter(
    (name) => !runningNames.has(name)
  );

  const externalProbes = serviceChecks.filter(
    (c) => c.source === 'external_probe'
  );
  const localChecks = serviceChecks.filter((c) => c.source === 'agent_local');

  return {
    thermalHeadroomCelsius,
    thermalProgressPercent,
    combinedNetBytesPerSec,
    expectedContainersCount:
      expectedContainers.length > 0
        ? expectedContainers.length
        : containers.length,
    runningContainersCount: containers.filter((c) => c.state === 'running')
      .length,
    missingExpectedContainers,
    externalProbes,
    localChecks,
  };
}

/**
 * Filters or slices time-series points according to user-selected chart window ('1h' | '6h' | '24h' | '7d')
 * without fabricating synthetic data points.
 */
export function sliceTimeSeriesByRange<T>(
  series: T[],
  range: '1h' | '6h' | '24h' | '7d'
): T[] {
  if (series.length <= 4) return series;
  if (range === '1h') {
    return series.slice(-Math.max(4, Math.ceil(series.length * 0.4)));
  }
  if (range === '6h') {
    return series.slice(-Math.max(6, Math.ceil(series.length * 0.7)));
  }
  if (range === '24h') {
    return series;
  }
  return series;
}

