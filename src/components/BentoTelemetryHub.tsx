import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Search,
  X,
} from 'lucide-react';
import type {
  ContainerMetricRecord,
  MonitoringSnapshot,
  SystemHealthStatus,
} from '../types/monitoring';
import {
  calculateLinuxMemoryBreakdown,
  computeBentoHubSummary,
  evaluateHeartbeatStatus,
  evaluateOverallSystemState,
  formatBytes,
  formatDurationShort,
  formatMetricValue,
  sliceTimeSeriesByRange,
} from '../utils/monitoringLogic';
import {
  ContainerStateIndicator,
  SeverityIndicator,
  StatusIndicator,
  TelemetryLineChart,
} from './StatusIndicator';
import { useLanguage } from '../i18n/LanguageContext';

interface BentoTelemetryHubProps {
  snapshot: MonitoringSnapshot;
  nowMs: number;
  onNavigateTab: (tab: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
}

function getContainerMonogram(name: string): {
  code: string;
  accentClass: string;
} {
  const lower = name.toLowerCase();
  if (lower.includes('next') || lower.includes('web')) {
    return {
      code: 'JS',
      accentClass:
        'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
    };
  }
  if (lower.includes('laravel') || lower.includes('api') || lower.includes('php')) {
    return {
      code: 'PHP',
      accentClass:
        'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
    };
  }
  if (lower.includes('maria') || lower.includes('mysql') || lower.includes('db')) {
    return {
      code: 'SQL',
      accentClass:
        'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    };
  }
  if (lower.includes('redis') || lower.includes('cache')) {
    return {
      code: 'RED',
      accentClass:
        'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    };
  }
  if (lower.includes('cloudflared') || lower.includes('tunnel')) {
    return {
      code: 'CF',
      accentClass:
        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    };
  }
  if (lower.includes('nginx') || lower.includes('proxy')) {
    return {
      code: 'NGX',
      accentClass:
        'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30',
    };
  }
  if (lower.includes('worker') || lower.includes('queue')) {
    return {
      code: 'WRK',
      accentClass:
        'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    };
  }
  return {
    code: name.slice(0, 3).toUpperCase(),
    accentClass:
      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  };
}

function getProgressBarColor(status: SystemHealthStatus): string {
  if (status === 'critical' || status === 'offline')
    return 'bg-red-500 shadow-[0_1px_6px_rgba(239,68,68,0.35)]';
  if (status === 'warning' || status === 'stale')
    return 'bg-amber-500 shadow-[0_1px_6px_rgba(245,158,11,0.35)]';
  if (status === 'unknown') return 'bg-slate-400 dark:bg-slate-600';
  return 'bg-emerald-500 shadow-[0_1px_6px_rgba(16,185,129,0.35)]';
}

const BENTO_CARD_CLASS =
  'rounded-[24px] border border-slate-200/80 dark:border-slate-800/90 bg-white dark:bg-slate-900/85 p-5 sm:p-6 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.065),0_4px_14px_-3px_rgba(15,23,42,0.04)] dark:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.55),0_4px_14px_-4px_rgba(0,0,0,0.35)] transition-shadow duration-200 hover:shadow-[0_18px_44px_-6px_rgba(15,23,42,0.095),0_6px_18px_-4px_rgba(15,23,42,0.05)] dark:hover:shadow-[0_20px_48px_-8px_rgba(0,0,0,0.68)]';

const BENTO_INNER_ROW_CLASS =
  'rounded-2xl bg-slate-50/90 dark:bg-slate-950/75 border border-slate-200/70 dark:border-slate-800/85 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.035)] dark:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3)]';

export const BentoTelemetryHub: React.FC<BentoTelemetryHubProps> = ({
  snapshot,
  nowMs,
  onNavigateTab,
  onAcknowledgeAlert,
}) => {
  const { t } = useLanguage();
  const {
    device,
    latest_system: sys,
    containers,
    service_checks: checks,
    alerts,
    time_series,
    settings,
  } = snapshot;

  const [chartRange, setChartRange] = useState<'1h' | '6h' | '24h' | '7d'>(
    settings.default_chart_range || '6h'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  const heartbeat = evaluateHeartbeatStatus(
    device.last_seen_at,
    nowMs,
    settings.heartbeat_stale_seconds,
    settings.heartbeat_offline_seconds
  );

  const overall = evaluateOverallSystemState({
    heartbeat,
    system: sys,
    containers,
    serviceChecks: checks,
    alerts,
    settings,
  });

  const isStaleOrOffline =
    heartbeat.status === 'stale' || heartbeat.status === 'offline';

  const mem = calculateLinuxMemoryBreakdown({
    totalBytes: sys?.memory_total_bytes ?? null,
    availableBytes: sys?.memory_available_bytes ?? null,
    cachedBytes: sys?.memory_cached_bytes ?? null,
    buffersBytes: sys?.memory_buffers_bytes ?? null,
  });

  const bento = useMemo(
    () =>
      computeBentoHubSummary({
        expectedContainers: device.expected_containers,
        system: sys,
        containers,
        serviceChecks: checks,
        settings,
      }),
    [device.expected_containers, sys, containers, checks, settings]
  );

  const swapPct =
    sys &&
    sys.swap_total_bytes &&
    sys.swap_total_bytes > 0 &&
    sys.swap_used_bytes !== null
      ? Number(((sys.swap_used_bytes / sys.swap_total_bytes) * 100).toFixed(1))
      : sys?.swap_total_bytes === 0
      ? 0
      : null;

  const webCheck = checks.find((c) => c.target_name === 'public_website');
  const apiCheck = checks.find((c) => c.target_name === 'public_api');
  const tunnelCheck = checks.find((c) => c.target_name === 'cloudflare_tunnel');

  const cpuStatus: SystemHealthStatus = isStaleOrOffline
    ? heartbeat.status
    : (sys?.cpu_percent ?? 0) >= settings.cpu_critical_percent
    ? 'critical'
    : (sys?.cpu_percent ?? 0) >= settings.cpu_warn_percent
    ? 'warning'
    : 'healthy';

  const ramStatus: SystemHealthStatus = isStaleOrOffline
    ? heartbeat.status
    : mem.availablePercent !== null &&
      mem.availablePercent < settings.ram_available_critical_percent
    ? 'critical'
    : mem.availablePercent !== null &&
      mem.availablePercent < settings.ram_available_warn_percent
    ? 'warning'
    : 'healthy';

  const diskStatus: SystemHealthStatus = isStaleOrOffline
    ? heartbeat.status
    : (sys?.root_disk_percent ?? 0) >= settings.disk_critical_percent
    ? 'critical'
    : (sys?.root_disk_percent ?? 0) >= settings.disk_warn_percent
    ? 'warning'
    : 'healthy';

  const gatewayLatencyMs =
    apiCheck?.response_time_ms ?? webCheck?.response_time_ms ?? null;

  const gatewayStatus: SystemHealthStatus =
    apiCheck?.status === 'critical' ||
    webCheck?.status === 'critical' ||
    tunnelCheck?.status === 'critical'
      ? 'critical'
      : apiCheck?.status === 'warning' ||
        webCheck?.status === 'warning' ||
        (gatewayLatencyMs !== null && gatewayLatencyMs >= 800)
      ? 'warning'
      : tunnelCheck?.status ?? webCheck?.status ?? 'unknown';

  const rootFreeBytes =
    sys?.root_disk_total_bytes !== null &&
    sys?.root_disk_total_bytes !== undefined &&
    sys?.root_disk_used_bytes !== null &&
    sys?.root_disk_used_bytes !== undefined
      ? Math.max(0, sys.root_disk_total_bytes - sys.root_disk_used_bytes)
      : null;

  const rootMount = sys?.mounts_json?.find((m) => m.mount_point === '/') ?? null;

  const openAlerts = alerts.filter((a) => a.status !== 'resolved');

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredContainers = useMemo(() => {
    if (!normalizedSearch) return containers;
    return containers.filter(
      (c) =>
        c.container_name.toLowerCase().includes(normalizedSearch) ||
        c.image.toLowerCase().includes(normalizedSearch) ||
        c.role_description.toLowerCase().includes(normalizedSearch) ||
        c.state.toLowerCase().includes(normalizedSearch)
    );
  }, [containers, normalizedSearch]);

  const filteredProbes = useMemo(() => {
    if (!normalizedSearch) return checks;
    return checks.filter(
      (c) =>
        c.display_name.toLowerCase().includes(normalizedSearch) ||
        c.endpoint_or_target.toLowerCase().includes(normalizedSearch) ||
        c.target_name.toLowerCase().includes(normalizedSearch) ||
        c.status.toLowerCase().includes(normalizedSearch)
    );
  }, [checks, normalizedSearch]);

  const slicedSeries = useMemo(
    () => sliceTimeSeriesByRange(time_series, chartRange),
    [time_series, chartRange]
  );

  const dualSeriesData = useMemo(
    () =>
      slicedSeries.map((pt) => ({
        label: pt.label,
        value: pt.cpu_percent,
        secondaryValue: pt.temperature_celsius,
      })),
    [slicedSeries]
  );

  const recordedTimeLabel = sys?.recorded_at
    ? new Date(sys.recorded_at).toISOString().slice(11, 19) + ' UTC'
    : 'N/A';

  // Core / Load state rows derived strictly from real Supabase fields:
  // thermal_zones_json, load_1/5/15, cpu_iowait_percent, swap_in/out_pages
  const thermalZones = sys?.thermal_zones_json ?? [];

  const loadNormalized1m =
    sys?.load_1 !== null && sys?.load_1 !== undefined && device.cpu_cores > 0
      ? Math.min(100, Math.round((sys.load_1 / device.cpu_cores) * 100))
      : null;
  const loadNormalized15m =
    sys?.load_15 !== null && sys?.load_15 !== undefined && device.cpu_cores > 0
      ? Math.min(100, Math.round((sys.load_15 / device.cpu_cores) * 100))
      : null;

  return (
    <div className="space-y-6" data-testid="bento-telemetry-hub">
      {/* 1. Bento Hub Header & Search Bar */}
      <section className={BENTO_CARD_CLASS}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <StatusIndicator status={overall.status} size="sm" />
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-700 dark:text-slate-200 font-medium">
                {device.hostname} ({device.id})
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {device.cpu_model ?? 'ARM64 SoC'} ({device.cpu_cores} Cores)
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {t('Uptime:', 'Uptime:')} {formatDurationShort(sys?.uptime_seconds)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                CF Tunnel:{' '}
                <strong
                  className={
                    tunnelCheck?.status === 'healthy'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500 dark:text-red-400'
                  }
                >
                  {tunnelCheck?.status === 'healthy'
                    ? t('Connected', 'Đã kết nối')
                    : t('Disconnected', 'Mất kết nối')}
                </strong>
              </span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('Cluster Telemetry Hub', 'Trung tâm Telemetry Cụm ARM64')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                '100% bound to live Supabase PostgreSQL telemetry tables (`devices`, `system_metrics`, `container_metrics`, `service_checks`, `alerts`).',
                'Đồng bộ 100% từ các bảng dữ liệu thực trên Supabase PostgreSQL (`devices`, `system_metrics`, `container_metrics`, `service_checks`, `alerts`).'
              )}
            </p>
          </div>

          {/* Live Filter Search Input */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t(
                  'Filter telemetry, containers, or endpoints',
                  'Lọc container, tiến trình hoặc endpoint'
                )}
                placeholder={t(
                  'Filter containers, probes...',
                  'Lọc container, endpoint...'
                )}
                className="w-full sm:w-64 pl-9 pr-8 py-2 rounded-2xl border border-slate-200/90 dark:border-slate-700/90 bg-slate-50/90 dark:bg-slate-950/90 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] focus:outline-none focus:border-emerald-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Full-Width System Health & Kernel Strip (100% Real Supabase Columns) */}
        <div
          className={`mt-4 p-3.5 ${BENTO_INNER_ROW_CLASS} flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-slate-900 dark:text-white">
              {bento.runningContainersCount === bento.expectedContainersCount
                ? t(
                    `All ${bento.runningContainersCount} Expected Container Services Healthy.`,
                    `Toàn bộ ${bento.runningContainersCount}/${bento.expectedContainersCount} Container Dịch vụ Hoạt động Tốt.`
                  )
                : t(
                    `${bento.runningContainersCount} of ${bento.expectedContainersCount} Containers Running (${bento.missingExpectedContainers.length} degraded/stopped).`,
                    `${bento.runningContainersCount}/${bento.expectedContainersCount} Container đang chạy (${bento.missingExpectedContainers.length} dừng/lỗi).`
                  )}
            </span>
            <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {t('Root Disk Used:', 'Ổ đĩa Root đã dùng:')}{' '}
              {formatMetricValue(sys?.root_disk_percent, '%', 1)}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              ·
            </span>
            <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {t('Kernel OOM Kills:', 'Sự kiện OOM Kill:')}{' '}
              <strong
                className={
                  (sys?.oom_kill_count ?? 0) > 0
                    ? 'text-red-500 font-bold'
                    : 'text-slate-700 dark:text-slate-300'
                }
              >
                {formatMetricValue(sys?.oom_kill_count, '', 0)}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            <span>Kernel {device.kernel_version}</span>
            <span aria-hidden="true">·</span>
            <span>Arch: {device.architecture}</span>
            <span aria-hidden="true">·</span>
            <span>Agent v{device.agent_version}</span>
            <span aria-hidden="true">·</span>
            <span>Sample: {recordedTimeLabel}</span>
          </div>
        </div>
      </section>

      {/* Stale / Offline explicit warning notice */}
      {isStaleOrOffline && (
        <div
          role="alert"
          className="border border-amber-500/40 bg-amber-950/30 rounded-[20px] p-4 flex items-start gap-3 text-xs text-amber-200 shadow-md"
        >
          <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">
              {t(
                `Telemetry Freshness Warning (${heartbeat.status.toUpperCase()}):`,
                `Cảnh báo độ tươi dữ liệu Telemetry (${heartbeat.status.toUpperCase()}):`
              )}
            </span>{' '}
            {t(
              'Last packet from TV Box arrived',
              'Gói tin gần nhất từ TV Box nhận được cách đây'
            )}{' '}
            <span className="font-mono font-semibold">
              {formatDurationShort(heartbeat.ageSeconds)}
            </span>
            .{' '}
            {t(
              `Values below reflect the last verified reading at ${recordedTimeLabel} without fake zero substitution.`,
              `Các chỉ số bên dưới phản ánh lần đo xác thực cuối cùng lúc ${recordedTimeLabel}, không thay bằng số 0 giả định.`
            )}
          </div>
        </div>
      )}

      {/* 2. Row 1: 4 Primary Bento Telemetry Cards (CPU, Memory & Swap, Flash Storage, Edge Gateway) */}
      <section
        aria-label="Primary Hardware & Edge Telemetry Cards"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
      >
        {/* Card 1: CPU Compute */}
        <div className={`${BENTO_CARD_CLASS} flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                {t('CPU Compute', 'Tải CPU ARM64')}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {device.cpu_cores} Cores
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2 my-1">
              <div className="text-2xl xl:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                {formatMetricValue(sys?.cpu_percent, '%', 1)}
              </div>
              <div className="text-right font-mono tabular-nums shrink-0">
                <div className="text-[11px] text-slate-400 whitespace-nowrap">
                  {t('SoC Temp', 'Nhiệt độ SoC')}
                </div>
                <div
                  className={`text-xs font-bold whitespace-nowrap ${
                    sys?.temperature_celsius === null ||
                    sys?.temperature_celsius === undefined
                      ? 'text-slate-400'
                      : sys.temperature_celsius >= settings.temp_critical_celsius
                      ? 'text-red-500'
                      : sys.temperature_celsius >= settings.temp_warn_celsius
                      ? 'text-amber-500'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatMetricValue(sys?.temperature_celsius, '°C', 1, {
                    nullLabel: 'N/A',
                  })}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800/90 overflow-hidden my-3.5">
              <div
                className={`h-full rounded-full transition-opacity ${getProgressBarColor(
                  cpuStatus
                )}`}
                style={{
                  width: `${
                    sys?.cpu_percent !== null && sys?.cpu_percent !== undefined
                      ? Math.min(100, Math.max(0, sys.cpu_percent))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span className="truncate">
              Load: {formatMetricValue(sys?.load_1, '', 2)} /{' '}
              {formatMetricValue(sys?.load_5, '', 2)}
            </span>
            <span className="whitespace-nowrap shrink-0">
              IOWait: {formatMetricValue(sys?.cpu_iowait_percent, '%', 1)}
            </span>
          </div>
        </div>

        {/* Card 2: Memory & Swap */}
        <div className={`${BENTO_CARD_CLASS} flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                {t('Memory & Swap', 'Bộ nhớ RAM & Swap')}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {formatBytes(sys?.memory_total_bytes, 1)} Total
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2 my-1">
              <div className="text-2xl xl:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                {formatBytes(mem.usedBytes, 2)}
              </div>
              <div className="text-right font-mono tabular-nums shrink-0">
                <div className="text-[11px] text-slate-400 whitespace-nowrap">
                  {t('Swap Used', 'Swap đang dùng')}
                </div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {sys?.swap_total_bytes === 0
                    ? '0 B'
                    : `${formatBytes(sys?.swap_used_bytes, 0)} (${formatMetricValue(
                        swapPct,
                        '%',
                        0
                      )})`}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800/90 overflow-hidden my-3.5">
              <div
                className={`h-full rounded-full ${getProgressBarColor(ramStatus)}`}
                style={{
                  width: `${
                    mem.usedPercent !== null
                      ? Math.min(100, Math.max(0, mem.usedPercent))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span className="truncate">
              Cache: {formatBytes(mem.cacheAndBuffersBytes, 0)}
            </span>
            <span className="whitespace-nowrap shrink-0">
              Avail: {formatBytes(sys?.memory_available_bytes, 0)}
            </span>
          </div>
        </div>

        {/* Card 3: Flash Storage & Mounts */}
        <div className={`${BENTO_CARD_CLASS} flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                {t('Flash Storage', 'Lưu trữ Root (/)')}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {formatBytes(sys?.root_disk_total_bytes, 1)}{' '}
                {rootMount?.fs_type ?? 'eMMC'}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2 my-1">
              <div className="text-2xl xl:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                {formatBytes(sys?.root_disk_used_bytes, 1)}
              </div>
              <div className="text-right font-mono tabular-nums shrink-0">
                <div className="text-[11px] text-slate-400 whitespace-nowrap">
                  {t('Mount Mode', 'Chế độ Mount')}
                </div>
                <div
                  className={`text-xs font-bold whitespace-nowrap ${
                    rootMount?.read_only
                      ? 'text-red-500'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {rootMount ? (rootMount.read_only ? 'RO (Fault)' : 'rw · OK') : 'rw'}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800/90 overflow-hidden my-3.5">
              <div
                className={`h-full rounded-full ${getProgressBarColor(diskStatus)}`}
                style={{
                  width: `${
                    sys?.root_disk_percent !== null &&
                    sys?.root_disk_percent !== undefined
                      ? Math.min(100, Math.max(0, sys.root_disk_percent))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span className="truncate">
              Used: {formatMetricValue(sys?.root_disk_percent, '%', 1)} (/)
            </span>
            <span className="whitespace-nowrap shrink-0">
              {formatBytes(rootFreeBytes, 1)} Free
            </span>
          </div>
        </div>

        {/* Card 4: Edge Gateway & Network */}
        <div className={`${BENTO_CARD_CLASS} flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                {t('Edge Gateway', 'Cổng Edge & Mạng')}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {tunnelCheck?.status === 'healthy' ? 'CF Tunnel OK' : 'Tunnel Check'}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2 my-1">
              <div className="text-2xl xl:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                {gatewayLatencyMs !== null
                  ? `${Math.round(gatewayLatencyMs)} ms`
                  : apiCheck?.status === 'healthy'
                  ? '< 50 ms'
                  : 'N/A'}
              </div>
              <div className="text-right font-mono tabular-nums shrink-0">
                <div className="text-[11px] text-slate-400 whitespace-nowrap">
                  {t('Net Throughput', 'Băng thông RX+TX')}
                </div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {bento.combinedNetBytesPerSec !== null
                    ? `${formatBytes(bento.combinedNetBytesPerSec, 1)}/s`
                    : 'N/A'}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800/90 overflow-hidden my-3.5">
              <div
                className={`h-full rounded-full ${getProgressBarColor(gatewayStatus)}`}
                style={{
                  width: `${
                    gatewayLatencyMs !== null
                      ? Math.min(100, Math.max(8, (gatewayLatencyMs / 1000) * 100))
                      : tunnelCheck?.status === 'healthy'
                      ? 25
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span className="truncate">
              RX: {formatBytes(sys?.net_rx_bytes_per_sec, 0)}/s · TX:{' '}
              {formatBytes(sys?.net_tx_bytes_per_sec, 0)}/s
            </span>
            <span className="whitespace-nowrap shrink-0">
              Err: {formatMetricValue(sys?.net_errors_count, '', 0)}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Row 2: Compute & Thermal Dynamics (8 cols) + ARM64 SoC & Thermal State (4 cols) */}
      <section
        aria-label="Compute Dynamics and ARM64 Thermal State"
        className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch"
      >
        {/* Left 8 Cols: Synchronous CPU % vs SoC Temperature Time-Series */}
        <div
          className={`lg:col-span-8 ${BENTO_CARD_CLASS} flex flex-col justify-between`}
        >
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t(
                    'Compute & Thermal Dynamics',
                    'Động lực học Tải CPU & Nhiệt độ SoC'
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    `Synchronous time-series of ${device.cpu_cores}-core utilization (%) vs SoC thermal sensor (°C)`,
                    `Chuỗi thời gian đồng bộ giữa hiệu suất ${device.cpu_cores} nhân CPU (%) và cảm biến nhiệt SoC (°C)`
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
                <div className="flex items-center gap-3 text-xs font-mono whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>CPU %</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400 whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                    <span>Temp °C</span>
                  </span>
                </div>

                {/* Interactive Range Selector */}
                <div
                  role="group"
                  aria-label="Select telemetry chart time window"
                  className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100/90 dark:bg-slate-950/90 border border-slate-200/80 dark:border-slate-800"
                >
                  {(['1h', '6h', '24h', '7d'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setChartRange(r)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        chartRange === r
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <TelemetryLineChart
              variant="bento"
              title={t(
                `CPU Utilization (%) & SoC Temperature (°C) — Window: ${chartRange}`,
                `Tải CPU (%) & Nhiệt độ SoC (°C) — Khung thời gian: ${chartRange}`
              )}
              subtitle={t(
                `CPU Warn >= ${settings.cpu_warn_percent}% · Temp Warn >= ${settings.temp_warn_celsius}°C`,
                `Cảnh báo CPU >= ${settings.cpu_warn_percent}% · Cảnh báo Nhiệt >= ${settings.temp_warn_celsius}°C`
              )}
              data={dualSeriesData}
              unit="%"
              maxDomain={100}
              warnThreshold={settings.cpu_warn_percent}
              criticalThreshold={settings.cpu_critical_percent}
              colorHex="#10b981"
              secondaryColorHex="#38bdf8"
              secondaryLabel="Temp"
              isStale={isStaleOrOffline}
            />
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span>
              {t('Sampling Interval:', 'Chu kỳ lấy mẫu:')} 60s (systemd timer)
            </span>
            <span>
              {t('Current CPU / Temp:', 'Hiện tại CPU / Nhiệt:')}{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {formatMetricValue(sys?.cpu_percent, '%', 1)}
              </strong>{' '}
              /{' '}
              <strong className="text-sky-600 dark:text-sky-400">
                {formatMetricValue(sys?.temperature_celsius, '°C', 1, {
                  nullLabel: 'N/A',
                })}
              </strong>
            </span>
          </div>
        </div>

        {/* Right 4 Cols: ARM64 SoC & Thermal State (100% Real Supabase Fields) */}
        <div
          className={`lg:col-span-4 ${BENTO_CARD_CLASS} flex flex-col justify-between`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                {t('ARM64 SoC & Thermal', 'Trạng thái SoC & Nhiệt')}
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {device.architecture.split(' ')[0]}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 truncate">
              {device.cpu_model ?? t('Quad-Core ARM64 Processor', 'Vi xử lý 4 nhân ARM64')}
            </p>

            <div className="space-y-2.5">
              {/* Real Thermal Zones from system_metrics.thermal_zones_json */}
              {thermalZones.length > 0 ? (
                thermalZones.slice(0, 2).map((tz) => {
                  const pct =
                    tz.celsius !== null && settings.temp_critical_celsius > 0
                      ? Math.min(
                          100,
                          Math.max(
                            0,
                            Math.round(
                              (tz.celsius / settings.temp_critical_celsius) * 100
                            )
                          )
                        )
                      : 0;
                  const barCls =
                    tz.celsius === null
                      ? 'bg-slate-400'
                      : tz.celsius >= settings.temp_critical_celsius
                      ? 'bg-red-500'
                      : tz.celsius >= settings.temp_warn_celsius
                      ? 'bg-amber-500'
                      : 'bg-emerald-500';
                  return (
                    <div
                      key={tz.zone}
                      className={`p-3 ${BENTO_INNER_ROW_CLASS} flex items-center justify-between gap-3`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {tz.zone} ({tz.type})
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          /sys/class/thermal/{tz.zone}
                        </div>
                      </div>
                      <div className="text-right shrink-0 w-20">
                        <div className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {formatMetricValue(tz.celsius, '°C', 1, {
                            nullLabel: 'N/A',
                          })}
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden mt-1.5">
                          <div
                            className={`h-full rounded-full ${barCls}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    'Thermal sensor: N/A (No /sys/class/thermal exposed; value kept null, never faked as 0°C).',
                    'Cảm biến nhiệt: N/A (Kernel không xuất /sys/class/thermal; giữ nguyên null, không giả lập 0°C).'
                  )}
                </div>
              )}

              {/* Real Kernel Load Queue & I/O Wait Rows from system_metrics */}
              {[
                {
                  label: t('Kernel Load 1m / 5m', 'Tải Kernel TB 1p / 5p'),
                  sub: `${formatMetricValue(sys?.load_1, '', 2)} · ${formatMetricValue(
                    sys?.load_5,
                    '',
                    2
                  )} (${device.cpu_cores} cores)`,
                  pct: loadNormalized1m,
                },
                {
                  label: t('Kernel Load 15m Avg', 'Tải Kernel trung bình 15 phút'),
                  sub: `${formatMetricValue(sys?.load_15, '', 2)} / ${
                    device.cpu_cores
                  }.00 cores`,
                  pct: loadNormalized15m,
                },
                {
                  label: t('CPU Disk I/O Wait', 'Độ trễ CPU chờ I/O (iowait)'),
                  sub: `Swap In/Out: ${formatMetricValue(
                    sys?.swap_in_pages,
                    '',
                    0
                  )}/${formatMetricValue(sys?.swap_out_pages, '', 0)} pages`,
                  pct:
                    sys?.cpu_iowait_percent !== null &&
                    sys?.cpu_iowait_percent !== undefined
                      ? Math.min(100, Math.round(sys.cpu_iowait_percent))
                      : null,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className={`p-3 ${BENTO_INNER_ROW_CLASS} flex items-center justify-between gap-3`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {row.label}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {row.sub}
                    </div>
                  </div>
                  <div className="text-right shrink-0 w-20">
                    <div className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {row.pct !== null ? `${row.pct}%` : 'N/A'}
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden mt-1.5">
                      <div
                        className={`h-full rounded-full ${
                          (row.pct ?? 0) >= 85
                            ? 'bg-red-500'
                            : (row.pct ?? 0) >= 65
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${row.pct ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
            <span className="text-slate-500 dark:text-slate-400">
              {t('Thermal Limit:', 'Ngưỡng nhiệt:')} {settings.temp_critical_celsius}°C
            </span>
            <span
              className={`font-semibold ${
                bento.thermalHeadroomCelsius === null
                  ? 'text-slate-400'
                  : bento.thermalHeadroomCelsius <= 10
                  ? 'text-red-500'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {t('Headroom:', 'Biên an toàn:')}{' '}
              {bento.thermalHeadroomCelsius !== null
                ? `${
                    bento.thermalHeadroomCelsius >= 0 ? '+' : ''
                  }${bento.thermalHeadroomCelsius}°C`
                : 'N/A'}
            </span>
          </div>
        </div>
      </section>

      {/* 4. Row 3: Container & Daemon Health Matrix (7 cols) + Synthetic Ingress Probes (5 cols) */}
      <section
        aria-label="Container Health Matrix and Synthetic Ingress Probes"
        className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch"
      >
        {/* Bottom-Left 7 Cols: Container & Daemon Health Matrix */}
        <div
          className={`lg:col-span-7 ${BENTO_CARD_CLASS} flex flex-col justify-between`}
        >
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t(
                    'Container & Daemon Health Matrix',
                    'Ma trận Sức khỏe Container & Tiến trình'
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    `Docker Engine on ${device.hostname} (${device.architecture}) · Reconciled against expected_containers`,
                    `Docker Engine trên ${device.hostname} (${device.architecture}) · Đối chiếu trực tiếp với danh sách expected_containers`
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {bento.runningContainersCount} / {bento.expectedContainersCount}{' '}
                  Running
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateTab('containers')}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
                >
                  <span>{t('Inspect All', 'Chi tiết')}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {filteredContainers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                {t(
                  'No containers match the current filter query.',
                  'Không có container nào khớp với từ khóa tìm kiếm.'
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredContainers.map((ctr: ContainerMetricRecord) => {
                  const mono = getContainerMonogram(ctr.container_name);
                  const memPct = ctr.memory_percent ?? 0;
                  return (
                    <div
                      key={ctr.container_name}
                      className={`p-3.5 ${BENTO_INNER_ROW_CLASS} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-2xl border flex items-center justify-center font-mono text-xs font-bold shrink-0 shadow-[0_2px_8px_rgba(15,23,42,0.06)] ${mono.accentClass}`}
                        >
                          {mono.code}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {ctr.container_name}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {ctr.image}
                            </span>
                            {ctr.oom_killed && (
                              <span className="text-[11px] font-mono font-bold text-red-500">
                                · OOM KILLED (Exit {ctr.exit_code ?? 137})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            <span>{ctr.role_description}</span>
                            <span aria-hidden="true" className="mx-1.5">
                              ·
                            </span>
                            <span className="font-mono">{ctr.status_text}</span>
                            <span aria-hidden="true" className="mx-1.5">
                              ·
                            </span>
                            <span className="font-mono">
                              Restarts: {ctr.restart_count}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3.5 shrink-0">
                        <div className="text-right font-mono tabular-nums w-32 shrink-0">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {formatBytes(ctr.memory_usage_bytes, 0)} (
                            {formatMetricValue(ctr.memory_percent, '%', 1)})
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden mt-1.5">
                            <div
                              className={`h-full rounded-full ${
                                ctr.state !== 'running' || ctr.oom_killed
                                  ? 'bg-red-500'
                                  : memPct >= 80
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{
                                width: `${Math.min(100, Math.max(4, memPct))}%`,
                              }}
                            />
                          </div>
                        </div>

                        <div className="shrink-0">
                          <ContainerStateIndicator state={ctr.state} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>
              {t('Expected list:', 'Danh sách kỳ vọng:')}{' '}
              {device.expected_containers.join(', ')}
            </span>
          </div>
        </div>

        {/* Bottom-Right 5 Cols: Synthetic Ingress Probes & Real Telemetry Verification */}
        <div
          className={`lg:col-span-5 ${BENTO_CARD_CLASS} flex flex-col justify-between`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('Synthetic Ingress Probes', 'Probe Kiểm tra Ingress & Dịch vụ')}
              </h3>
              <StatusIndicator
                status={
                  bento.externalProbes.some((p) => p.status === 'critical')
                    ? 'critical'
                    : bento.externalProbes.some((p) => p.status === 'warning')
                    ? 'warning'
                    : 'healthy'
                }
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {t(
                'Public Cloudflare Tunnel health checks & local daemon socket probes (`public.service_checks`)',
                'Kiểm tra sức khỏe qua Cloudflare Tunnel & socket nội bộ (`public.service_checks`)'
              )}
            </p>

            {/* Probe Rows from snapshot.service_checks */}
            <div className="space-y-2.5">
              {filteredProbes.slice(0, 6).map((probe) => (
                <div
                  key={`${probe.source}-${probe.target_name}`}
                  className={`p-3 ${BENTO_INNER_ROW_CLASS} flex items-center justify-between gap-3`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {probe.endpoint_or_target}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {probe.display_name} ·{' '}
                      <span className="font-mono">
                        {probe.source === 'external_probe'
                          ? 'external_probe'
                          : 'agent_local'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div
                      className={`text-xs font-bold ${
                        probe.status === 'healthy'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : probe.status === 'warning'
                          ? 'text-amber-500'
                          : 'text-red-500'
                      }`}
                    >
                      {probe.http_status !== null
                        ? `${probe.http_status} ${
                            probe.http_status < 400 ? 'OK' : 'ERR'
                          }`
                        : probe.status.toUpperCase()}
                      {probe.response_time_ms !== null
                        ? ` · ${Math.round(probe.response_time_ms)}ms`
                        : ''}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {probe.error_code !== 'NONE'
                        ? probe.error_code
                        : probe.verification_method.slice(0, 28)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Real Supabase Telemetry & Mounts Verification Box (Replacing fake SSL/WAF/PoP) */}
            <div className={`mt-4 p-3.5 ${BENTO_INNER_ROW_CLASS} space-y-2 text-xs`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  {t('Heartbeat Freshness:', 'Độ tươi Heartbeat:')}
                </span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {heartbeat.label} ({heartbeat.status.toUpperCase()})
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  {t('Verified Mount Points:', 'Phân vùng đã kiểm tra:')}
                </span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {sys?.mounts_json && sys.mounts_json.length > 0
                    ? sys.mounts_json
                        .map((m) => `${m.mount_point} (${m.used_percent}%)`)
                        .join(' · ')
                    : '/ (Root FS)'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  {t('Anti-Flap & Cooldown:', 'Chống báo giả & Cooldown:')}
                </span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {settings.consecutive_breaches_required}x samples ·{' '}
                  {settings.alert_cooldown_minutes}m cooldown
                </span>
              </div>
            </div>
          </div>

          {/* Real Dashboard Navigation Actions (Replacing fake SSH/Reboot buttons) */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateTab('website')}
              className="px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 text-center whitespace-nowrap cursor-pointer shadow-2xs"
            >
              {t('Website & API Probes', 'Chi tiết Probe Web/API')}
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('health')}
              className="px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 text-center whitespace-nowrap cursor-pointer shadow-2xs"
            >
              {t('Dual-Source Health Matrix', 'Ma trận Sức khỏe Kép')}
            </button>
          </div>
        </div>
      </section>

      {/* 5. Active Incidents & Diagnostic Observations Strip (from public.alerts) */}
      <section className={BENTO_CARD_CLASS}>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t(
                `Active Incidents & Diagnostic Observations (${openAlerts.length})`,
                `Sự cố Đang mở & Chẩn đoán Nguyên nhân (${openAlerts.length})`
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                'Directly bound to `public.alerts` and `public.alert_events` with anti-flap consecutive breach verification.',
                'Đồng bộ trực tiếp từ bảng `public.alerts` và `public.alert_events`.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('alerts')}
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{t('Open Alert Center', 'Mở Trung tâm Cảnh báo')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {openAlerts.length === 0 ? (
          <div className="py-5 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            {t(
              'Zero active incidents in `public.alerts`. All hardware thresholds and ingress probes are nominal.',
              'Không có sự cố nào đang mở trong `public.alerts`. Toàn bộ ngưỡng phần cứng và Probe ngoại vi đều ổn định.'
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {openAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 ${BENTO_INNER_ROW_CLASS} flex flex-col lg:flex-row lg:items-center justify-between gap-4`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <SeverityIndicator severity={alert.severity} />
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-500">
                      Rule: {alert.rule_key}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-500">
                      Status: {alert.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {alert.title}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <strong className="text-slate-800 dark:text-slate-200">
                      {t('Observation:', 'Quan sát thực tế:')}
                    </strong>{' '}
                    {alert.observation}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-300">
                      {t('Recommended Check:', 'Khuyến nghị kiểm tra:')}
                    </strong>{' '}
                    {alert.recommended_check}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => onAcknowledgeAlert(alert.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                    >
                      {t('Acknowledge', 'Xác nhận (Ack)')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigateTab('alerts')}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {t('Incident Log', 'Nhật ký Sự cố')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
