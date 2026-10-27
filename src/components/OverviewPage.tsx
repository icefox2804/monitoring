import React, { useMemo } from 'react';
import { ArrowRight, Clock, ArrowUp, ArrowDown } from 'lucide-react';
import type {
  MonitoringSnapshot,
  SystemHealthStatus,
} from '../types/monitoring';
import {
  calculateLinuxMemoryBreakdown,
  evaluateHeartbeatStatus,
  evaluateOverallSystemState,
  formatBytes,
  formatDurationShort,
  formatMetricValue,
} from '../utils/monitoringLogic';
import {
  MiniSparkline,
  RadialGaugeChart,
  SeverityIndicator,
  StatusIndicator,
  TelemetryLineChart,
} from './StatusIndicator';
import {
  LayoutCustomizationBar,
  SortableGrid,
  usePersistedOrder,
} from './SortableGrid';
import { useLanguage } from '../i18n/LanguageContext';

interface OverviewPageProps {
  snapshot: MonitoringSnapshot;
  nowMs: number;
  onNavigateTab: (tab: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
}

const DEFAULT_GAUGE_IDS = [
  'gauge-cpu',
  'gauge-ram',
  'gauge-swap',
  'gauge-temp',
  'gauge-disk',
];

const DEFAULT_CHART_IDS = ['chart-cpu', 'chart-ram', 'chart-temp'];

const DEFAULT_KPI_IDS = [
  'kpi-web',
  'kpi-api',
  'kpi-latency',
  'kpi-cpu',
  'kpi-ram',
  'kpi-swap',
  'kpi-temp',
  'kpi-disk',
  'kpi-docker',
  'kpi-tunnel',
  'kpi-heartbeat',
  'kpi-uptime',
];

const DEFAULT_SECTION_IDS = [
  'sec-gauges',
  'sec-charts',
  'sec-kpis',
  'sec-alerts',
];

export const OverviewPage: React.FC<OverviewPageProps> = ({
  snapshot,
  nowMs,
  onNavigateTab,
  onAcknowledgeAlert,
}) => {
  const { t, lang } = useLanguage();
  const {
    device,
    latest_system: sys,
    containers,
    service_checks: checks,
    alerts,
    time_series,
    settings,
  } = snapshot;

  const gaugesLayout = usePersistedOrder(
    'server_layout_overview_gauges_v1',
    DEFAULT_GAUGE_IDS
  );
  const chartsLayout = usePersistedOrder(
    'server_layout_overview_charts_v1',
    DEFAULT_CHART_IDS
  );
  const kpisLayout = usePersistedOrder(
    'server_layout_overview_kpis_v1',
    DEFAULT_KPI_IDS
  );
  const sectionsLayout = usePersistedOrder(
    'server_layout_overview_sections_v1',
    DEFAULT_SECTION_IDS
  );

  const isAnyCustomized =
    gaugesLayout.isCustomized ||
    chartsLayout.isCustomized ||
    kpisLayout.isCustomized ||
    sectionsLayout.isCustomized;

  const handleResetAllLayouts = () => {
    gaugesLayout.resetOrder();
    chartsLayout.resetOrder();
    kpisLayout.resetOrder();
    sectionsLayout.resetOrder();
  };

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

  const localizedOverall = useMemo(() => {
    if (lang === 'en') return overall;
    if (overall.status === 'offline') {
      return {
        status: overall.status,
        headline: 'Mất kết nối tới TV Box (Host Offline)',
        subheadline: `Không nhận được gói tin Telemetry từ TV Box trong ${formatDurationShort(
          heartbeat.ageSeconds
        )}. Probe ngoại vi vẫn đang giám sát.`,
      };
    }
    if (overall.status === 'unknown') {
      return {
        status: overall.status,
        headline: 'Chưa xác định trạng thái Telemetry (Unknown)',
        subheadline:
          'Đang chờ gói tin Telemetry hợp lệ đầu tiên từ Agent trên TV Box.',
      };
    }
    if (overall.status === 'critical') {
      return {
        status: overall.status,
        headline: 'Phát hiện Sự cố Nghiêm trọng (Critical Incident)',
        subheadline: overall.subheadline,
      };
    }
    if (overall.status === 'stale') {
      return {
        status: overall.status,
        headline: 'Dữ liệu Telemetry bị trễ nhịp (Stale Heartbeat)',
        subheadline: `Gói tin cuối cùng nhận được cách đây ${formatDurationShort(
          heartbeat.ageSeconds
        )} (ngưỡng trễ: ${
          settings.heartbeat_stale_seconds
        }s). Đang hiển thị trạng thái xác thực gần nhất.`,
      };
    }
    if (overall.status === 'warning') {
      return {
        status: overall.status,
        headline: 'Cảnh báo Vượt ngưỡng Tài nguyên (Degraded / Warning)',
        subheadline: overall.subheadline,
      };
    }
    return {
      status: overall.status,
      headline: 'Toàn bộ Dịch vụ Production Hoạt động Ổn định (Nominal)',
      subheadline:
        'Website app.example.com, Laravel API, MariaDB, Redis, Cloudflare Tunnel và tài nguyên phần cứng TV Box đều nằm trong ngưỡng an toàn.',
    };
  }, [overall, lang, heartbeat.ageSeconds, settings.heartbeat_stale_seconds]);

  const isStaleOrOffline =
    heartbeat.status === 'stale' || heartbeat.status === 'offline';

  const mem = calculateLinuxMemoryBreakdown({
    totalBytes: sys?.memory_total_bytes ?? null,
    availableBytes: sys?.memory_available_bytes ?? null,
    cachedBytes: sys?.memory_cached_bytes ?? null,
    buffersBytes: sys?.memory_buffers_bytes ?? null,
  });

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

  const runningContainers = containers.filter(
    (c) => c.state === 'running'
  ).length;
  const totalContainers = containers.length;
  const openAlerts = alerts.filter((a) => a.status !== 'resolved');

  const recordedTimeLabel = sys?.recorded_at
    ? new Date(sys.recorded_at).toISOString().slice(11, 19) + ' UTC'
    : 'N/A';

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

  const swapStatus: SystemHealthStatus = isStaleOrOffline
    ? heartbeat.status
    : (sys?.oom_kill_count ?? 0) > 0
    ? 'critical'
    : (swapPct ?? 0) >= settings.swap_used_warn_percent
    ? 'warning'
    : 'healthy';

  const tempStatus: SystemHealthStatus =
    sys?.temperature_celsius === null || sys?.temperature_celsius === undefined
      ? 'unknown'
      : isStaleOrOffline
      ? heartbeat.status
      : sys.temperature_celsius >= settings.temp_critical_celsius
      ? 'critical'
      : sys.temperature_celsius >= settings.temp_warn_celsius
      ? 'warning'
      : 'healthy';

  const diskStatus: SystemHealthStatus = isStaleOrOffline
    ? heartbeat.status
    : (sys?.root_disk_percent ?? 0) >= settings.disk_critical_percent
    ? 'critical'
    : (sys?.root_disk_percent ?? 0) >= settings.disk_warn_percent
    ? 'warning'
    : 'healthy';

  const gaugeItems = useMemo(
    () => [
      {
        id: 'gauge-cpu',
        label: t('CPU Busy', 'Tải CPU'),
        value: sys?.cpu_percent,
        max: 100,
        unit: '%',
        subtitle: `Load 1m: ${formatMetricValue(sys?.load_1, '', 2)}`,
        status: cpuStatus,
      },
      {
        id: 'gauge-ram',
        label: t('RAM Used', 'RAM Đang dùng'),
        value: mem.usedPercent,
        max: 100,
        unit: '%',
        subtitle: `${t('Avail:', 'Khả dụng:')} ${formatBytes(
          sys?.memory_available_bytes,
          0
        )}`,
        status: ramStatus,
      },
      {
        id: 'gauge-swap',
        label: t('Swap Used', 'Swap Đang dùng'),
        value: swapPct,
        max: 100,
        unit: '%',
        subtitle:
          sys?.swap_total_bytes === 0
            ? t('Swap Disabled (0 B)', 'Tắt Swap (0 B)')
            : `${formatBytes(sys?.swap_used_bytes, 0)} / ${formatBytes(
                sys?.swap_total_bytes,
                0
              )}`,
        status: swapStatus,
      },
      {
        id: 'gauge-temp',
        label: t('SoC Temp', 'Nhiệt độ SoC'),
        value: sys?.temperature_celsius,
        max: 105,
        unit: '°C',
        subtitle:
          sys?.temperature_celsius === null
            ? t('Sensor Unsupported', 'Không có cảm biến')
            : `${t('Warn >=', 'Cảnh báo >=')} ${settings.temp_warn_celsius}°C`,
        status: tempStatus,
        nullText: 'N/A',
      },
      {
        id: 'gauge-disk',
        label: t('eMMC Root /', 'Phân vùng Root (/)'),
        value: sys?.root_disk_percent,
        max: 100,
        unit: '%',
        subtitle: `${formatBytes(sys?.root_disk_used_bytes, 1)} / ${formatBytes(
          sys?.root_disk_total_bytes,
          1
        )}`,
        status: diskStatus,
      },
    ],
    [
      t,
      sys,
      mem.usedPercent,
      swapPct,
      cpuStatus,
      ramStatus,
      swapStatus,
      tempStatus,
      diskStatus,
      settings.temp_warn_celsius,
    ]
  );

  const chartItems = useMemo(
    () => [
      {
        id: 'chart-cpu',
        title: t('CPU Utilization (%)', 'Mức sử dụng CPU (%)'),
        subtitle: t(
          `Warn >= ${settings.cpu_warn_percent}% · 60s sampling`,
          `Ngưỡng cảnh báo >= ${settings.cpu_warn_percent}% · Chu kỳ lấy mẫu 60s`
        ),
        data: time_series.map((pt) => ({
          label: pt.label,
          value: pt.cpu_percent,
        })),
        unit: '%',
        maxDomain: 100,
        warnThreshold: settings.cpu_warn_percent,
        criticalThreshold: settings.cpu_critical_percent,
        colorHex: '#10b981',
      },
      {
        id: 'chart-ram',
        title: t(
          'Physical Memory Used (%)',
          'Mức sử dụng RAM vật lý (%)'
        ),
        subtitle: t(
          `Warn when Available < ${settings.ram_available_warn_percent}%`,
          `Cảnh báo khi MemAvailable < ${settings.ram_available_warn_percent}%`
        ),
        data: time_series.map((pt) => ({
          label: pt.label,
          value: pt.memory_used_percent,
        })),
        unit: '%',
        maxDomain: 100,
        warnThreshold: 100 - settings.ram_available_warn_percent,
        criticalThreshold: 100 - settings.ram_available_critical_percent,
        colorHex: '#38bdf8',
      },
      {
        id: 'chart-temp',
        title: t(
          'SoC Thermal Sensor (°C)',
          'Nhiệt độ cảm biến SoC (°C)'
        ),
        subtitle: t(
          `Warn >= ${settings.temp_warn_celsius}°C · Crit >= ${settings.temp_critical_celsius}°C`,
          `Cảnh báo >= ${settings.temp_warn_celsius}°C · Nghiêm trọng >= ${settings.temp_critical_celsius}°C`
        ),
        data: time_series.map((pt) => ({
          label: pt.label,
          value: pt.temperature_celsius,
        })),
        unit: '°C',
        maxDomain: 100,
        warnThreshold: settings.temp_warn_celsius,
        criticalThreshold: settings.temp_critical_celsius,
        colorHex: '#f59e0b',
      },
    ],
    [t, time_series, settings]
  );

  const kpiCards: {
    id: string;
    title: string;
    value: string;
    subtext: string;
    status: SystemHealthStatus;
    measuredAt: string;
    sparkline?: (number | null | undefined)[];
    sparkColor?: string;
  }[] = [
    {
      id: 'kpi-web',
      title: t(
        'Public Website (app.example.com)',
        'Website Public (app.example.com)'
      ),
      value:
        webCheck?.http_status !== null && webCheck?.http_status !== undefined
          ? `HTTP ${webCheck.http_status}`
          : webCheck?.status === 'healthy'
          ? 'HTTP 200 (OK)'
          : t('Unreachable', 'Không phản hồi'),
      subtext:
        webCheck?.response_time_ms !== null &&
        webCheck?.response_time_ms !== undefined
          ? `${webCheck.response_time_ms} ms · Uptime 99.94% (30d)`
          : webCheck?.status === 'healthy'
          ? t(
              'Tunnel + Nginx + Next.js containers active',
              'Container Tunnel + Nginx + Next.js đang chạy ổn định'
            )
          : webCheck?.error_summary ??
            t('External check failed', 'Kiểm tra ngoại vi thất bại'),
      status: webCheck?.status ?? 'unknown',
      measuredAt:
        webCheck?.source === 'external_probe'
          ? t('External probe', 'Probe ngoại vi')
          : t('Container state', 'Trạng thái Container'),
      sparkline: time_series.map((p) => p.web_response_ms),
      sparkColor: '#10b981',
    },
    {
      id: 'kpi-api',
      title: t(
        'Laravel Production API',
        'Backend API (Laravel Production)'
      ),
      value:
        apiCheck?.http_status !== null && apiCheck?.http_status !== undefined
          ? `HTTP ${apiCheck.http_status}`
          : apiCheck?.status === 'healthy'
          ? 'HTTP 200 (OK)'
          : t('Down', 'Ngừng phản hồi'),
      subtext:
        apiCheck?.response_time_ms !== null &&
        apiCheck?.response_time_ms !== undefined
          ? `${t('Response time:', 'Thời gian phản hồi:')} ${
              apiCheck.response_time_ms
            } ms`
          : apiCheck?.status === 'healthy'
          ? t(
              'Nginx + Laravel PHP-FPM + MariaDB active',
              'Container Nginx + Laravel PHP-FPM + MariaDB hoạt động tốt'
            )
          : apiCheck?.error_summary ??
            t('Endpoint failed', 'Lỗi kết nối Endpoint'),
      status: apiCheck?.status ?? 'unknown',
      measuredAt:
        apiCheck?.source === 'external_probe'
          ? t('External probe', 'Probe ngoại vi')
          : t('Container state', 'Trạng thái Container'),
      sparkline: time_series.map((p) => p.api_response_ms),
      sparkColor: '#38bdf8',
    },
    {
      id: 'kpi-latency',
      title: t(
        'API Response Latency',
        'Độ trễ phản hồi API (Latency)'
      ),
      value:
        apiCheck?.response_time_ms !== null &&
        apiCheck?.response_time_ms !== undefined
          ? `${Math.round(apiCheck.response_time_ms)} ms`
          : apiCheck?.status === 'healthy'
          ? t('< 50 ms (Local)', '< 50 ms (Nội bộ)')
          : 'Timeout / 5xx',
      subtext: t(
        'Target < 500 ms · Warn >= 800 ms',
        'Mục tiêu < 500 ms · Cảnh báo >= 800 ms'
      ),
      status:
        apiCheck?.status === 'critical'
          ? 'critical'
          : (apiCheck?.response_time_ms ?? 0) > 800
          ? 'warning'
          : apiCheck?.status ?? 'unknown',
      measuredAt:
        apiCheck?.source === 'external_probe'
          ? t('External probe', 'Probe ngoại vi')
          : t('Local socket', 'Socket nội bộ'),
      sparkline: time_series.map((p) => p.api_response_ms),
      sparkColor: '#38bdf8',
    },
    {
      id: 'kpi-cpu',
      title: t(
        'ARM64 CPU Utilization',
        'Hiệu suất CPU ARM64 (Utilization)'
      ),
      value: formatMetricValue(sys?.cpu_percent, '%', 1),
      subtext: `Load 1m/5m/15m: ${formatMetricValue(
        sys?.load_1,
        '',
        2
      )} / ${formatMetricValue(sys?.load_5, '', 2)} / ${formatMetricValue(
        sys?.load_15,
        '',
        2
      )}`,
      status: cpuStatus,
      measuredAt: recordedTimeLabel,
      sparkline: time_series.map((p) => p.cpu_percent),
      sparkColor: '#10b981',
    },
    {
      id: 'kpi-ram',
      title: t(
        'Physical RAM (Used / Available)',
        'RAM Vật lý (Đang dùng / Khả dụng)'
      ),
      value: `${formatBytes(mem.usedBytes, 2)} / ${formatBytes(
        sys?.memory_total_bytes,
        2
      )}`,
      subtext: `${t('Available:', 'Khả dụng:')} ${formatBytes(
        sys?.memory_available_bytes,
        0
      )} (${formatMetricValue(
        mem.availablePercent,
        '%',
        1
      )}) · Cache: ${formatBytes(mem.cacheAndBuffersBytes, 0)}`,
      status: ramStatus,
      measuredAt: recordedTimeLabel,
      sparkline: time_series.map((p) => p.memory_used_percent),
      sparkColor: '#38bdf8',
    },
    {
      id: 'kpi-swap',
      title: t(
        'Swap Memory & OOM Events',
        'Bộ nhớ Swap & Sự kiện OOM Kill'
      ),
      value:
        sys?.swap_total_bytes === 0
          ? t('0 B (Disabled)', '0 B (Đã tắt)')
          : `${formatBytes(sys?.swap_used_bytes, 2)} (${formatMetricValue(
              swapPct,
              '%',
              1
            )})`,
      subtext: `${t('Total Swap:', 'Tổng Swap:')} ${formatBytes(
        sys?.swap_total_bytes,
        2
      )} · Kernel OOM Kills: ${formatMetricValue(sys?.oom_kill_count, '', 0)}`,
      status: swapStatus,
      measuredAt: recordedTimeLabel,
      sparkline: time_series.map((p) => p.swap_used_mb),
      sparkColor: '#f59e0b',
    },
    {
      id: 'kpi-temp',
      title: t('SoC Thermal Sensor', 'Nhiệt độ Vi xử lý (SoC Thermal)'),
      value: formatMetricValue(sys?.temperature_celsius, '°C', 1, {
        nullLabel: t('N/A (Unsupported)', 'N/A (Không hỗ trợ)'),
      }),
      subtext:
        sys?.temperature_celsius === null
          ? t(
              'No /sys/class/thermal zone exposed',
              'Kernel không xuất cảm biến /sys/class/thermal'
            )
          : `${t('Warn >=', 'Cảnh báo >=')} ${settings.temp_warn_celsius}°C · ${t(
              'Crit >=',
              'Nguy cấp >='
            )} ${settings.temp_critical_celsius}°C`,
      status: tempStatus,
      measuredAt: recordedTimeLabel,
      sparkline: time_series.map((p) => p.temperature_celsius),
      sparkColor: '#f59e0b',
    },
    {
      id: 'kpi-disk',
      title: t('Root Filesystem (eMMC /)', 'Ổ cứng hệ thống (Root FS eMMC /)'),
      value: formatMetricValue(sys?.root_disk_percent, '%', 1),
      subtext: `${formatBytes(
        sys?.root_disk_used_bytes,
        1
      )} / ${formatBytes(sys?.root_disk_total_bytes, 1)} (rw mode)`,
      status: diskStatus,
      measuredAt: recordedTimeLabel,
    },
    {
      id: 'kpi-docker',
      title: t('Docker Containers', 'Tiến trình Docker Containers'),
      value: `${runningContainers} / ${totalContainers} Running`,
      subtext:
        runningContainers === totalContainers
          ? t(
              'All expected production containers active',
              'Toàn bộ container production đang chạy ổn định'
            )
          : t(
              `${totalContainers - runningContainers} container(s) stopped or restarting`,
              `${totalContainers - runningContainers} container đang dừng hoặc khởi động lại`
            ),
      status: isStaleOrOffline
        ? heartbeat.status
        : runningContainers < totalContainers
        ? 'critical'
        : 'healthy',
      measuredAt: recordedTimeLabel,
    },
    {
      id: 'kpi-tunnel',
      title: t(
        'Cloudflare Tunnel (cloudflared)',
        'Đường hầm Cloudflare (cloudflared)'
      ),
      value:
        tunnelCheck?.status === 'healthy'
          ? t('Connected', 'Đã kết nối (Connected)')
          : t('Disconnected', 'Mất kết nối'),
      subtext: t(
        'Edge Active · Outbound QUIC (Zero Inbound Ports)',
        'Kết nối Edge QUIC chiều ra (Không mở cổng Inbound)'
      ),
      status: tunnelCheck?.status ?? 'unknown',
      measuredAt: recordedTimeLabel,
    },
    {
      id: 'kpi-heartbeat',
      title: t(
        'TV Box Heartbeat Age',
        'Độ trễ Nhịp tim Thiết bị (Heartbeat Age)'
      ),
      value: heartbeat.label,
      subtext: `${t('Last seen:', 'Nhận cuối:')} ${
        device.last_seen_at
          ? new Date(device.last_seen_at)
              .toISOString()
              .replace('T', ' ')
              .slice(0, 19) + ' UTC'
          : t('Never', 'Chưa từng nhận')
      }`,
      status: heartbeat.status,
      measuredAt: t('Cycle: 60s', 'Chu kỳ: 60s'),
    },
    {
      id: 'kpi-uptime',
      title: t('Host Uptime & Kernel', 'Thời gian hoạt động (Host Uptime)'),
      value: formatDurationShort(sys?.uptime_seconds),
      subtext: `${device.kernel_version} · ${device.architecture}`,
      status: isStaleOrOffline ? heartbeat.status : 'healthy',
      measuredAt: `Agent v${device.agent_version}`,
    },
  ];

  const renderSectionById = (secId: string, secIdx: number) => {
    const sectionReorderButtons = (titleLabel: string) => (
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {titleLabel}
        </span>
        <div className="flex items-center gap-1">
          {secIdx > 0 && (
            <button
              type="button"
              onClick={() => sectionsLayout.moveByOffset(secId, -1)}
              title={t('Move section up', 'Di chuyển cụm này lên trên')}
              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-0.5 cursor-pointer"
            >
              <ArrowUp className="w-3 h-3" />
              <span>{t('Up', 'Lên')}</span>
            </button>
          )}
          {secIdx < sectionsLayout.order.length - 1 && (
            <button
              type="button"
              onClick={() => sectionsLayout.moveByOffset(secId, 1)}
              title={t('Move section down', 'Di chuyển cụm này xuống dưới')}
              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-0.5 cursor-pointer"
            >
              <ArrowDown className="w-3 h-3" />
              <span>{t('Down', 'Xuống')}</span>
            </button>
          )}
        </div>
      </div>
    );

    if (secId === 'sec-gauges') {
      return (
        <section key="sec-gauges" aria-label="Real-Time Hardware Radial Gauges">
          {sectionReorderButtons(
            t(
              'Hardware Radial Gauges (Drag to swap positions)',
              'Đồng hồ đo phần cứng thời gian thực (Radial Gauges — Kéo thả để đổi vị trí)'
            )
          )}
          <SortableGrid
            items={gaugeItems}
            order={gaugesLayout.order}
            onSwap={gaugesLayout.swapItems}
            onMoveByOffset={gaugesLayout.moveByOffset}
            gridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
            renderItem={(g) => (
              <RadialGaugeChart
                label={g.label}
                value={g.value}
                max={g.max}
                unit={g.unit}
                subtitle={g.subtitle}
                status={g.status}
                nullText={g.nullText}
              />
            )}
          />
        </section>
      );
    }

    if (secId === 'sec-charts') {
      return (
        <section key="sec-charts" aria-label="Time-Series Telemetry Area Charts">
          {sectionReorderButtons(
            t(
              'Real-Time Telemetry Trend Charts (Drag to swap positions)',
              'Biểu đồ miền xu hướng Telemetry (Time-Series Area Charts — Kéo thả để đổi vị trí)'
            )
          )}
          <SortableGrid
            items={chartItems}
            order={chartsLayout.order}
            onSwap={chartsLayout.swapItems}
            onMoveByOffset={chartsLayout.moveByOffset}
            gridClassName="grid grid-cols-1 lg:grid-cols-3 gap-4"
            renderItem={(ch) => (
              <TelemetryLineChart
                title={ch.title}
                subtitle={ch.subtitle}
                data={ch.data}
                unit={ch.unit}
                maxDomain={ch.maxDomain}
                warnThreshold={ch.warnThreshold}
                criticalThreshold={ch.criticalThreshold}
                colorHex={ch.colorHex}
                isStale={isStaleOrOffline}
              />
            )}
          />
        </section>
      );
    }

    if (secId === 'sec-kpis') {
      return (
        <section key="sec-kpis" aria-label="Key Infrastructure Metrics">
          {sectionReorderButtons(
            t(
              '12 Infrastructure & Service KPI Cards (Drag to swap positions)',
              '12 Chỉ số Hạ tầng & Dịch vụ trọng yếu (KPI Cards — Kéo thả để đổi vị trí)'
            )
          )}
          <SortableGrid
            items={kpiCards}
            order={kpisLayout.order}
            onSwap={kpisLayout.swapItems}
            onMoveByOffset={kpisLayout.moveByOffset}
            gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            renderItem={(card) => (
              <div className="h-full border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                      {card.title}
                    </span>
                    <StatusIndicator status={card.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {card.value}
                    </div>
                    {card.sparkline && (
                      <MiniSparkline
                        values={card.sparkline}
                        colorHex={card.sparkColor}
                      />
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="truncate">{card.subtext}</span>
                  <span className="font-mono whitespace-nowrap shrink-0">
                    {card.measuredAt}
                  </span>
                </div>
              </div>
            )}
          />
        </section>
      );
    }

    if (secId === 'sec-alerts') {
      return (
        <section key="sec-alerts" aria-label="Open Incidents">
          {sectionReorderButtons(
            t(
              'Active Alerts & Incident Log',
              'Cảnh báo & Sự cố vận hành đang mở (Active Incidents)'
            )
          )}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t(
                    `Open Incidents & Threshold Breaches (${openAlerts.length})`,
                    `Sự cố đang mở & Vi phạm ngưỡng (${openAlerts.length})`
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    'Separates confirmed telemetry observations from probable root causes.',
                    'Phân tách rõ giữa dữ liệu đo đạc thực tế (Observation) và nguyên nhân khả dĩ (Probable Cause).'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('alerts')}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>
                  {t('View Full Incident Log', 'Xem toàn bộ Nhật ký Sự cố')}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {openAlerts.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                {t(
                  'No open warnings or critical incidents. All consecutive-breach rules and external probes are nominal.',
                  'Không có cảnh báo hay sự cố nào đang mở. Mọi quy tắc kiểm tra ngưỡng liên tiếp (Consecutive Breach) và Probe ngoại vi đều ổn định.'
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {openAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50/60 dark:bg-slate-950/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5 flex-wrap text-xs">
                        <SeverityIndicator severity={alert.severity} />
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {t('Status:', 'Trạng thái:')} {alert.status.toUpperCase()}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {t('First seen:', 'Phát hiện lúc:')}{' '}
                          {new Date(alert.first_seen_at).toISOString().slice(11, 19)}{' '}
                          UTC
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {alert.title}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {t('Observation:', 'Quan sát thực tế (Observation):')}
                        </span>{' '}
                        {alert.observation}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {t('Probable Cause:', 'Nguyên nhân khả dĩ (Probable Cause):')}
                        </span>{' '}
                        {alert.probable_cause}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {alert.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => onAcknowledgeAlert(alert.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {t('Acknowledge Alert', 'Xác nhận đã biết (Ack)')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigateTab('alerts')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {t('Details', 'Chi tiết')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      );
    }

    return null;
  };

  return (
    <div className="space-y-5">
      {/* Primary System Status Banner */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/70 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusIndicator status={localizedOverall.status} size="md" />
            <span
              className="text-slate-300 dark:text-slate-700"
              aria-hidden="true"
            >
              ·
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {t('Device ID:', 'Mã thiết bị:')} {device.id} ({device.hostname})
            </span>
            <span
              className="text-slate-300 dark:text-slate-700"
              aria-hidden="true"
            >
              ·
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Snapshot: {new Date(snapshot.fetched_at).toISOString().slice(11, 19)}{' '}
              UTC
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {localizedOverall.headline}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {localizedOverall.subheadline}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('containers')}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('Inspect 8 Containers', 'Kiểm tra 8 Containers')}
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('alerts')}
            className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-xs font-semibold text-white dark:text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t(
              `Active Alerts (${openAlerts.length})`,
              `Cảnh báo đang mở (${openAlerts.length})`
            )}
          </button>
        </div>
      </section>

      {/* Drag & Drop Customization Bar + Reset to Default Button */}
      <LayoutCustomizationBar
        isCustomized={isAnyCustomized}
        onReset={handleResetAllLayouts}
        label={t(
          'Drag and drop radial gauges, area charts, or KPI cards to swap positions (or use Up/Down buttons to reorder sections).',
          'Kéo thả các ô đồng hồ, biểu đồ hoặc thẻ KPI để hoán đổi vị trí cho nhau (hoặc dùng nút Lên/Xuống để đổi thứ tự cụm).'
        )}
      />

      {/* Stale / Offline explicit warning notice */}
      {isStaleOrOffline && (
        <div
          role="alert"
          className="border border-amber-500/40 bg-amber-950/30 rounded-lg p-4 flex items-start gap-3 text-xs text-amber-200"
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
              'The TV Box has not sent a new metric payload for',
              'Thiết bị TV Box chưa gửi gói tin Telemetry mới trong'
            )}{' '}
            <span className="font-mono font-semibold">
              {formatDurationShort(heartbeat.ageSeconds)}
            </span>
            .{' '}
            {t(
              `Values below reflect the last verified reading at ${recordedTimeLabel} and are never replaced with fake zeroes or assumed healthy.`,
              `Các thông số bên dưới phản ánh lần đo xác thực gần nhất lúc ${recordedTimeLabel} và tuyệt đối không bị thay thế bằng số 0 giả định.`
            )}
          </div>
        </div>
      )}

      {/* Render Reorderable Sections */}
      <div className="space-y-6">
        {sectionsLayout.order.map((secId, idx) => renderSectionById(secId, idx))}
      </div>
    </div>
  );
};
