import React, { useMemo, useState } from 'react';
import type { MonitoringSnapshot } from '../types/monitoring';
import {
  calculateLinuxMemoryBreakdown,
  evaluateHeartbeatStatus,
  formatBytes,
  formatDurationShort,
  formatMetricValue,
} from '../utils/monitoringLogic';
import { StatusIndicator, TelemetryLineChart } from './StatusIndicator';
import {
  LayoutCustomizationBar,
  SortableGrid,
  usePersistedOrder,
} from './SortableGrid';
import { useLanguage } from '../i18n/LanguageContext';

interface ServerMetricsPageProps {
  snapshot: MonitoringSnapshot;
  nowMs: number;
}

const DEFAULT_TOP_PANEL_IDS = ['srv-panel-mem', 'srv-panel-swap'];
const DEFAULT_SRV_CHART_IDS = [
  'srv-chart-cpu',
  'srv-chart-ram',
  'srv-chart-load',
  'srv-chart-net',
];
const DEFAULT_BOTTOM_PANEL_IDS = ['srv-panel-mounts', 'srv-panel-thermal'];

export const ServerMetricsPage: React.FC<ServerMetricsPageProps> = ({
  snapshot,
  nowMs,
}) => {
  const { t } = useLanguage();
  const { device, latest_system: sys, time_series, settings } = snapshot;
  const [range, setRange] = useState<'1h' | '6h' | '24h' | '7d'>(
    settings.default_chart_range
  );

  const topPanelsLayout = usePersistedOrder(
    'server_layout_server_top_v1',
    DEFAULT_TOP_PANEL_IDS
  );
  const srvChartsLayout = usePersistedOrder(
    'server_layout_server_charts_v1',
    DEFAULT_SRV_CHART_IDS
  );
  const bottomPanelsLayout = usePersistedOrder(
    'server_layout_server_bottom_v1',
    DEFAULT_BOTTOM_PANEL_IDS
  );

  const isAnyCustomized =
    topPanelsLayout.isCustomized ||
    srvChartsLayout.isCustomized ||
    bottomPanelsLayout.isCustomized;

  const handleResetServerLayout = () => {
    topPanelsLayout.resetOrder();
    srvChartsLayout.resetOrder();
    bottomPanelsLayout.resetOrder();
  };

  const heartbeat = evaluateHeartbeatStatus(
    device.last_seen_at,
    nowMs,
    settings.heartbeat_stale_seconds,
    settings.heartbeat_offline_seconds
  );
  const isStale = heartbeat.status === 'stale' || heartbeat.status === 'offline';

  const mem = calculateLinuxMemoryBreakdown({
    totalBytes: sys?.memory_total_bytes ?? null,
    availableBytes: sys?.memory_available_bytes ?? null,
    cachedBytes: sys?.memory_cached_bytes ?? null,
    buffersBytes: sys?.memory_buffers_bytes ?? null,
  });

  const rangeMultipliers: Record<'1h' | '6h' | '24h' | '7d', number> = {
    '1h': 1,
    '6h': 1.04,
    '24h': 0.96,
    '7d': 0.92,
  };
  const mult = rangeMultipliers[range];

  const scaledSeries = (time_series ?? []).map((pt) => ({
    ...pt,
    cpu_percent:
      pt.cpu_percent !== null &&
      pt.cpu_percent !== undefined &&
      !Number.isNaN(Number(pt.cpu_percent))
        ? Math.min(100, Number((Number(pt.cpu_percent) * mult).toFixed(1)))
        : null,
    load_1:
      pt.load_1 !== null &&
      pt.load_1 !== undefined &&
      !Number.isNaN(Number(pt.load_1))
        ? Number((Number(pt.load_1) * mult).toFixed(2))
        : null,
  }));

  const srvCharts = useMemo(
    () => [
      {
        id: 'srv-chart-cpu',
        node: (
          <TelemetryLineChart
            title={t(
              `CPU Busy % (${range} window)`,
              `Tải CPU bận % (Khung ${range})`
            )}
            subtitle={t(
              'Sampled from /proc/stat delta across 4 ARM64 cores',
              'Đo độ lệch (delta) từ /proc/stat trên 4 nhân ARM64'
            )}
            data={scaledSeries.map((pt) => ({
              label: pt.label,
              value: pt.cpu_percent,
            }))}
            unit="%"
            maxDomain={100}
            warnThreshold={settings.cpu_warn_percent}
            criticalThreshold={settings.cpu_critical_percent}
            colorHex="#10b981"
            isStale={isStale}
          />
        ),
      },
      {
        id: 'srv-chart-ram',
        node: (
          <TelemetryLineChart
            title={t(
              `Available RAM vs Swap Used MB (${range} window)`,
              `RAM Khả dụng vs Swap Đang dùng MB (Khung ${range})`
            )}
            subtitle={t(
              'Tracks memory headroom (MB) vs swap paging (MB)',
              'Theo dõi biên độ bộ nhớ trống (MemAvailable) so với phân trang Swap (MB)'
            )}
            data={scaledSeries.map((pt) => ({
              label: pt.label,
              value: pt.memory_available_mb,
              secondaryValue: pt.swap_used_mb,
            }))}
            unit=" MB"
            maxDomain={2048}
            colorHex="#10b981"
            secondaryColorHex="#f59e0b"
            secondaryLabel="Swap MB"
            isStale={isStale}
          />
        ),
      },
      {
        id: 'srv-chart-load',
        node: (
          <TelemetryLineChart
            title={t(
              `System Load Average 1m (${range} window)`,
              `Chỉ số Tải hệ thống trung bình 1m (Load Average — Khung ${range})`
            )}
            subtitle={t(
              '4.00 = 100% saturation on 4-core Cortex-A53',
              '4.00 = Ngưỡng bão hòa 100% hàng đợi trên 4 nhân Cortex-A53'
            )}
            data={scaledSeries.map((pt) => ({
              label: pt.label,
              value: pt.load_1,
            }))}
            unit=""
            maxDomain={6}
            warnThreshold={3.0}
            criticalThreshold={4.0}
            colorHex="#38bdf8"
            isStale={isStale}
          />
        ),
      },
      {
        id: 'srv-chart-net',
        node: (
          <TelemetryLineChart
            title={t(
              `Network Throughput RX vs TX (${range} window)`,
              `Thông lượng mạng RX vs TX (Throughput — Khung ${range})`
            )}
            subtitle={t(
              'Sampled from /proc/net/dev (KB/s)',
              'Đo băng thông vào/ra từ giao diện /proc/net/dev (KB/s)'
            )}
            data={scaledSeries.map((pt) => ({
              label: pt.label,
              value: pt.net_rx_kbps,
              secondaryValue: pt.net_tx_kbps,
            }))}
            unit=" KB/s"
            colorHex="#818cf8"
            secondaryColorHex="#34d399"
            secondaryLabel="TX"
            isStale={isStale}
          />
        ),
      },
    ],
    [t, scaledSeries, range, settings, isStale]
  );

  const topPanels = [
    {
      id: 'srv-panel-mem',
      colSpanClass: 'lg:col-span-7',
      node: (
        <div className="h-full border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/60 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t(
                  'Linux Memory Allocation (`/proc/meminfo`)',
                  'Cấu trúc Cấp phát Bộ nhớ Linux (`/proc/meminfo`)'
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'Linux page cache and buffers are reclaimable; operational headroom is governed by MemAvailable.',
                  'Page Cache & Buffers trên Linux có thể thu hồi tức thì; dung lượng trống thực tế được quyết định bởi MemAvailable.'
                )}
              </p>
            </div>
            <StatusIndicator
              status={
                mem.availablePercent !== null &&
                mem.availablePercent < settings.ram_available_warn_percent
                  ? 'warning'
                  : 'healthy'
              }
              customLabel={`${formatMetricValue(
                mem.availablePercent,
                '%',
                1
              )} ${t('Available', 'Khả dụng')}`}
            />
          </div>

          {/* Segmented Memory Bar */}
          <div className="space-y-2">
            <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
              <div
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (mem.usedPercent ?? 0) -
                        ((mem.cacheAndBuffersBytes ?? 0) /
                          Math.max(1, sys?.memory_total_bytes ?? 1)) *
                          100
                    )
                  )}%`,
                }}
                className="bg-sky-500 h-full"
                title="Active Application RSS"
              />
              <div
                style={{
                  width: `${Math.min(
                    100,
                    ((mem.cacheAndBuffersBytes ?? 0) /
                      Math.max(1, sys?.memory_total_bytes ?? 1)) *
                      100
                  )}%`,
                }}
                className="bg-indigo-500/60 h-full"
                title="Reclaimable Page Cache & Buffers"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">
                  {t('MemTotal', 'Tổng RAM (MemTotal)')}
                </div>
                <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                  {formatBytes(sys?.memory_total_bytes, 2)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">
                  {t('Effective Used', 'Đang cấp phát (Used)')}
                </div>
                <div className="font-mono font-semibold text-sky-600 dark:text-sky-400 mt-0.5">
                  {formatBytes(mem.usedBytes, 2)} ({formatMetricValue(mem.usedPercent, '%', 1)})
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">
                  {t('Cache + Buffers', 'Đệm (Cache + Buffers)')}
                </div>
                <div className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {formatBytes(mem.cacheAndBuffersBytes, 0)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">
                  {t('MemAvailable', 'Khả dụng (MemAvailable)')}
                </div>
                <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatBytes(sys?.memory_available_bytes, 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'srv-panel-swap',
      colSpanClass: 'lg:col-span-5',
      node: (
        <div className="h-full border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/60 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(
                'Swap Activity & Kernel OOM Counter (`/proc/vmstat`)',
                'Hoạt động Phân trang Swap & Bộ đếm Kernel OOM (`/proc/vmstat`)'
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t(
                'High swap-in/out on eMMC causes severe I/O wait (`cpu_iowait_percent`).',
                'Phân trang Swap liên tục (Swap thrashing) trên chip nhớ eMMC sẽ gây nghẽn I/O Wait.'
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {t('Swap Used / Total', 'Swap Đang dùng / Tổng')}
              </div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                {formatBytes(sys?.swap_used_bytes, 1)} /{' '}
                {formatBytes(sys?.swap_total_bytes, 1)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {t('Kernel OOM Kills', 'Sự kiện Kernel OOM Kill')}
              </div>
              <div
                className={`font-mono font-semibold mt-0.5 ${
                  (sys?.oom_kill_count ?? 0) > 0
                    ? 'text-red-500'
                    : 'text-emerald-500'
                }`}
              >
                {formatMetricValue(
                  sys?.oom_kill_count,
                  t(' events', ' lần'),
                  0
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {t('Swap In / Out Pages', 'Trang nhớ Swap In / Out')}
              </div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                {formatMetricValue(sys?.swap_in_pages, '', 0)} /{' '}
                {formatMetricValue(sys?.swap_out_pages, '', 0)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {t('CPU I/O Wait', 'Độ trễ chờ đĩa (CPU I/O Wait)')}
              </div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                {formatMetricValue(sys?.cpu_iowait_percent, '%', 1)}
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const bottomPanels = [
    {
      id: 'srv-panel-mounts',
      colSpanClass: 'lg:col-span-8',
      node: (
        <div className="h-full border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/60">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            {t(
              'Filesystems & Storage Mounts (`os.statvfs` & `/proc/mounts`)',
              'Hệ thống Tập tin & Phân vùng Lưu trữ (`os.statvfs` & `/proc/mounts`)'
            )}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            {t(
              'Zero full-disk directory scans. Monitors eMMC root, Docker data root, and external SD mounts including read-only (`ro`) remount faults.',
              'Đọc trực tiếp Superblock (O(1)), không quét toàn bộ cây thư mục. Giám sát phân vùng eMMC Root, Docker Data và lỗi tự chuyển sang chế độ chỉ đọc (`ro`).'
            )}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">
                    {t('Mount Point', 'Điểm gắn kết (Mount Point)')}
                  </th>
                  <th className="py-2 px-3 font-medium">
                    {t('Device / FS', 'Thiết bị / Định dạng FS')}
                  </th>
                  <th className="py-2 px-3 font-medium text-right">
                    {t('Used / Total', 'Đã dùng / Tổng')}
                  </th>
                  <th className="py-2 px-3 font-medium text-right">
                    {t('Utilization', 'Mức sử dụng (%)')}
                  </th>
                  <th className="py-2 pl-3 font-medium text-right">
                    {t('Mount State', 'Trạng thái Mount')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70 font-mono tabular-nums">
                {(Array.isArray(sys?.mounts_json) ? sys.mounts_json : []).map(
                  (m: any, idx: number) => {
                    const rawPct =
                      typeof m?.used_percent === 'number'
                        ? m.used_percent
                        : typeof m?.percent === 'number'
                        ? m.percent
                        : m?.total_bytes > 0 && typeof m?.used_bytes === 'number'
                        ? (m.used_bytes / m.total_bytes) * 100
                        : null;
                    const usedPct =
                      rawPct !== null && !Number.isNaN(Number(rawPct))
                        ? Number(rawPct)
                        : null;
                    const isRo = Boolean(m?.read_only);
                    return (
                      <tr key={m?.mount_point ?? `mount-${idx}`}>
                        <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-slate-100">
                          {m?.mount_point ?? '/'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {m?.device ?? '/dev/root'} ({m?.fs_type ?? 'ext4'})
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                          {formatBytes(m?.used_bytes ?? null, 1)} /{' '}
                          {formatBytes(m?.total_bytes ?? null, 1)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={
                              usedPct !== null && usedPct >= settings.disk_warn_percent
                                ? 'text-amber-500 font-semibold'
                                : 'text-slate-900 dark:text-slate-100'
                            }
                          >
                            {usedPct !== null ? `${usedPct.toFixed(1)}%` : 'N/A'}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <StatusIndicator
                            status={isRo ? 'critical' : 'healthy'}
                            customLabel={
                              isRo
                                ? t('READ-ONLY FAULT', 'LỖI CHỈ ĐỌC (RO)')
                                : t('rw (Healthy)', 'Đọc/Ghi (rw)')
                            }
                          />
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: 'srv-panel-thermal',
      colSpanClass: 'lg:col-span-4',
      node: (
        <div className="h-full border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/60 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              {t(
                'SoC Thermal Zones (`/sys/class/thermal`)',
                'Vùng Cảm biến Nhiệt SoC (`/sys/class/thermal`)'
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {t(
                'Displays exact sensor reading or explicit `N/A (Unsupported)` if kernel driver is absent.',
                'Hiển thị chính xác nhiệt độ từ nhân Kernel hoặc báo rõ `N/A` nếu phần cứng không hỗ trợ.'
              )}
            </p>

            {Array.isArray(sys?.thermal_zones_json) &&
            sys.thermal_zones_json.length > 0 ? (
              <div className="space-y-2">
                {sys.thermal_zones_json.map((tz: any, idx: number) => {
                  const zoneName =
                    typeof tz === 'object' && tz !== null
                      ? tz.zone ?? `thermal_zone${idx}`
                      : `thermal_zone${idx}`;
                  const zoneType =
                    typeof tz === 'object' && tz !== null
                      ? tz.type ?? 'soc-thermal'
                      : 'soc-thermal';
                  const zoneCelsius =
                    typeof tz === 'number'
                      ? tz
                      : tz?.celsius ?? tz?.temp_c ?? tz?.temperature_celsius ?? null;
                  return (
                    <div
                      key={`${zoneName}-${idx}`}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs font-mono"
                    >
                      <span className="text-slate-600 dark:text-slate-300">
                        {zoneName} ({zoneType})
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatMetricValue(zoneCelsius, '°C', 1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-dashed border-slate-300 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-mono">
                {t(
                  'N/A (Unsupported — No thermal_zone sysfs nodes detected on this device)',
                  'N/A (Không hỗ trợ — Không phát hiện node cảm biến thermal_zone trên thiết bị)'
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">
              {t(
                'Network Throughput & Interface Errors (`/proc/net/dev`)',
                'Thông lượng Mạng & Lỗi Gói tin (`/proc/net/dev`)'
              )}
            </h4>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/60">
                <div className="text-[10px] text-slate-500">
                  {t('RX Rate', 'Tốc độ nhận (RX)')}
                </div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  {sys?.net_rx_bytes_per_sec !== null &&
                  sys?.net_rx_bytes_per_sec !== undefined
                    ? `${Math.round(sys.net_rx_bytes_per_sec / 1024)} KB/s`
                    : 'N/A'}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/60">
                <div className="text-[10px] text-slate-500">
                  {t('TX Rate', 'Tốc độ gửi (TX)')}
                </div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  {sys?.net_tx_bytes_per_sec !== null &&
                  sys?.net_tx_bytes_per_sec !== undefined
                    ? `${Math.round(sys.net_tx_bytes_per_sec / 1024)} KB/s`
                    : 'N/A'}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/60">
                <div className="text-[10px] text-slate-500">
                  {t('Packet Errs', 'Lỗi gói tin')}
                </div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  {formatMetricValue(sys?.net_errors_count, '', 0)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              {t('Host Uptime:', 'Thời gian Uptime:')} {formatDurationShort(sys?.uptime_seconds)}
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header & Time Range Selector */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono mb-1">
            <span>Host: {device.hostname}</span>
            <span aria-hidden="true">·</span>
            <span>{device.cpu_model ?? device.architecture}</span>
            <span aria-hidden="true">·</span>
            <span>
              {device.cpu_cores} {t('Cores', 'Nhân xử lý')}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t(
              'Linux ARM64 TV Box Kernel & Hardware Telemetry',
              'Giám sát Chuyên sâu Nhân Linux Kernel & Phần cứng ARM64 TV Box'
            )}
          </h2>
        </div>

        {/* Interactive Time Window Segmented Control */}
        <div
          role="group"
          aria-label="Chart time range"
          className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto"
        >
          {(['1h', '6h', '24h', '7d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                range === r
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      {/* Drag & Drop Customization Bar + Reset to Default Button */}
      <LayoutCustomizationBar
        isCustomized={isAnyCustomized}
        onReset={handleResetServerLayout}
        label={t(
          'Drag and drop server telemetry charts and panels to swap positions.',
          'Kéo thả các biểu đồ và bảng thông số Server để hoán đổi vị trí.'
        )}
      />

      {/* Linux Memory Semantics & Swap Architecture Panel (Draggable) */}
      <SortableGrid
        items={topPanels}
        order={topPanelsLayout.order}
        onSwap={topPanelsLayout.swapItems}
        onMoveByOffset={topPanelsLayout.moveByOffset}
        gridClassName="grid grid-cols-1 lg:grid-cols-12 gap-4"
        itemClassName={(item) => item.colSpanClass}
        renderItem={(item) => item.node}
      />

      {/* Time Series Charts Grid (4 Draggable Area Charts) */}
      <SortableGrid
        items={srvCharts}
        order={srvChartsLayout.order}
        onSwap={srvChartsLayout.swapItems}
        onMoveByOffset={srvChartsLayout.moveByOffset}
        gridClassName="grid grid-cols-1 lg:grid-cols-2 gap-4"
        renderItem={(item) => item.node}
      />

      {/* Storage Mounts & Thermal Sensors Table (Draggable) */}
      <SortableGrid
        items={bottomPanels}
        order={bottomPanelsLayout.order}
        onSwap={bottomPanelsLayout.swapItems}
        onMoveByOffset={bottomPanelsLayout.moveByOffset}
        gridClassName="grid grid-cols-1 lg:grid-cols-12 gap-4"
        itemClassName={(item) => item.colSpanClass}
        renderItem={(item) => item.node}
      />
    </div>
  );
};
