import React, { useState } from 'react';
import { Search, ShieldAlert, X } from 'lucide-react';
import type {
  ContainerMetricRecord,
  MonitoringSnapshot,
} from '../types/monitoring';
import { formatBytes, formatMetricValue } from '../utils/monitoringLogic';
import {
  ContainerStateIndicator,
  StatusIndicator,
} from './StatusIndicator';
import {
  LayoutCustomizationBar,
  SortableGrid,
  usePersistedOrder,
} from './SortableGrid';
import { useLanguage } from '../i18n/LanguageContext';

interface DockerContainersPageProps {
  snapshot: MonitoringSnapshot;
}

const DEFAULT_CONTAINER_CHART_IDS = ['cont-chart-mem', 'cont-chart-cpu'];

export const DockerContainersPage: React.FC<DockerContainersPageProps> = ({
  snapshot,
}) => {
  const { t } = useLanguage();
  const { containers, device } = snapshot;
  const [filterState, setFilterState] = useState<'all' | 'running' | 'issues'>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContainer, setSelectedContainer] =
    useState<ContainerMetricRecord | null>(null);

  const chartsLayout = usePersistedOrder(
    'server_layout_container_charts_v1',
    DEFAULT_CONTAINER_CHART_IDS
  );

  const filtered = (containers ?? []).filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (c.container_name ?? '').toLowerCase().includes(q) ||
      (c.image ?? '').toLowerCase().includes(q) ||
      (c.role_description ?? '').toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (filterState === 'running') return c.state === 'running';
    if (filterState === 'issues')
      return (
        c.state !== 'running' ||
        c.oom_killed ||
        c.restart_count > 0 ||
        c.health_status === 'unhealthy'
      );
    return true;
  });

  const runningCount = containers.filter((c) => c.state === 'running').length;
  const issueCount = containers.filter(
    (c) =>
      c.state !== 'running' ||
      c.oom_killed ||
      c.restart_count > 0 ||
      c.health_status === 'unhealthy'
  ).length;

  const containerChartPanels = [
    {
      id: 'cont-chart-mem',
      node: (
        <div className="h-full border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/70 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t(
                  'Container Memory Footprint Comparison (Working Set vs Limit)',
                  'Phân bổ Bộ nhớ RAM theo Container (Working Set RSS vs cgroup Limit)'
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'Visualizes which containers consume the 2 GB physical RAM budget',
                  'So sánh trực quan mức tiêu thụ RAM thực tế của từng container trên tổng 2 GB RAM vật lý'
                )}
              </p>
            </div>
          </div>
          <div className="space-y-2.5 pt-1">
            {containers.map((c) => {
              const pct = Math.min(100, Math.max(0, c.memory_percent ?? 0));
              const barColor =
                c.state !== 'running' || c.oom_killed
                  ? 'bg-red-500'
                  : pct >= 75
                  ? 'bg-amber-500'
                  : 'bg-sky-500';
              return (
                <div key={`mem-bar-${c.container_name}`} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-mono tabular-nums">
                    <span className="text-slate-800 dark:text-slate-200 font-medium truncate">
                      {c.container_name}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatBytes(c.memory_usage_bytes, 1)} /{' '}
                      {formatBytes(c.memory_limit_bytes, 0)} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full rounded-full ${barColor}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      id: 'cont-chart-cpu',
      node: (
        <div className="h-full border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/70 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(
                'Container CPU Utilization Breakdown (%)',
                'Tỷ trọng Sử dụng CPU theo Container (%)'
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                'Real-time CPU share across Cortex-A53 cores (`stats?stream=false`)',
                'Tỷ lệ chiếm dụng CPU trên các nhân Cortex-A53 (`stats?stream=false`)'
              )}
            </p>
          </div>
          <div className="space-y-2.5 pt-1">
            {containers.map((c) => {
              const cpuPct = Math.min(100, Math.max(0, c.cpu_percent ?? 0));
              const barColor =
                cpuPct >= 50
                  ? 'bg-red-500'
                  : cpuPct >= 25
                  ? 'bg-amber-500'
                  : 'bg-emerald-500';
              return (
                <div key={`cpu-bar-${c.container_name}`} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-mono tabular-nums">
                    <span className="text-slate-800 dark:text-slate-200 font-medium truncate">
                      {c.container_name}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatMetricValue(c.cpu_percent, '%', 1)} ·{' '}
                      {t('Restarts:', 'Khởi động lại:')} {c.restart_count}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.max(cpuPct > 0 ? 2 : 0, cpuPct)}%` }}
                      className={`h-full rounded-full ${barColor}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header & Filter Bar */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/70 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t(
              'Docker Engine Containers (`docker.sock` Read-Only Telemetry)',
              'Giám sát Docker Engine Containers (Chỉ đọc qua `docker.sock`)'
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t(
              'Discovered via `/var/run/docker.sock` without spawning heavy CLI processes. Container environment variables (`Config.Env`) are never collected.',
              'Truy vấn trực tiếp qua `/var/run/docker.sock` không tốn tiến trình CLI. Tuyệt đối không thu thập biến môi trường nhạy cảm (`Config.Env`).'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Filter containers by name or image"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(
                'Search container or image...',
                'Tìm tên container hoặc image...'
              )}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Segmented filter buttons */}
          <div
            role="group"
            aria-label="Filter containers by status"
            className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            <button
              type="button"
              onClick={() => setFilterState('all')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterState === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t(`All (${containers.length})`, `Tất cả (${containers.length})`)}
            </button>
            <button
              type="button"
              onClick={() => setFilterState('running')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterState === 'running'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t(`Running (${runningCount})`, `Đang chạy (${runningCount})`)}
            </button>
            <button
              type="button"
              onClick={() => setFilterState('issues')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterState === 'issues'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t(`Issues (${issueCount})`, `Bất thường (${issueCount})`)}
            </button>
          </div>
        </div>
      </section>

      {/* Drag & Drop Customization Bar */}
      <LayoutCustomizationBar
        isCustomized={chartsLayout.isCustomized}
        onReset={chartsLayout.resetOrder}
        label={t(
          'Drag and drop the Container RAM and CPU comparison panels to swap positions.',
          'Kéo thả 2 bảng biểu đồ RAM và CPU của Container để hoán đổi vị trí.'
        )}
      />

      {/* Memory Limit Context Note for Next.js 1536MB vs 2GB Host RAM */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 bg-slate-50/70 dark:bg-slate-900/40 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <span className="font-semibold text-slate-900 dark:text-white">
            {t(
              'Note on Container Memory Limits vs Physical RAM:',
              'Lưu ý về Giới hạn Bộ nhớ Container (cgroup Memory Limit) vs RAM Vật lý:'
            )}
          </span>{' '}
          {t(
            'Container app-nextjs has a configured cgroup limit of 1.50 GB (1536 MB) on a host with ~1.95 GB usable RAM. The charts and table below track actual RSS working set against each limit.',
            'Container app-nextjs được cấu hình cgroup limit 1.50 GB (1536 MB) trên thiết bị có ~1.95 GB RAM khả dụng. Biểu đồ và bảng dưới đây theo dõi bộ nhớ RSS thực tế (Working Set) so với giới hạn của từng container.'
          )}
        </div>
        <span className="font-mono text-slate-500 whitespace-nowrap shrink-0">
          {t('Expected Containers:', 'Số Container chuẩn:')}{' '}
          {device.expected_containers.length}
        </span>
      </div>

      {/* Visual Resource Comparison Charts across 8 Containers (Draggable) */}
      <SortableGrid
        items={containerChartPanels}
        order={chartsLayout.order}
        onSwap={chartsLayout.swapItems}
        onMoveByOffset={chartsLayout.moveByOffset}
        gridClassName="grid grid-cols-1 lg:grid-cols-2 gap-4"
        renderItem={(item) => item.node}
      />

      {/* Containers High-Density Table */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                <th className="py-3 px-3.5 font-medium">
                  {t('Container Name & Role', 'Tên Container & Vai trò kiến trúc')}
                </th>
                <th className="py-3 px-2.5 font-medium">
                  {t('State', 'Trạng thái')}
                </th>
                <th className="py-3 px-2.5 font-medium text-right">CPU %</th>
                <th className="py-3 px-2.5 font-medium text-right">
                  {t('Mem Usage', 'RAM thực dùng')}
                </th>
                <th className="py-3 px-2.5 font-medium text-right">
                  {t('Mem Limit', 'Giới hạn (Limit)')}
                </th>
                <th className="py-3 px-2.5 font-medium text-right">Mem %</th>
                <th className="py-3 px-2.5 font-medium text-right">
                  {t('Restarts', 'Khởi động lại')}
                </th>
                <th className="py-3 px-2.5 font-medium">Healthcheck</th>
                <th className="py-3 px-2.5 font-medium text-right">
                  {t('Checked', 'Thời điểm đo')}
                </th>
                <th className="py-3 px-3.5 font-medium text-right">
                  {t('Action', 'Tác vụ')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70 font-mono tabular-nums">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-8 text-center font-sans text-slate-500 dark:text-slate-400"
                  >
                    {t(
                      'No containers match the current filter criteria.',
                      'Không có container nào khớp với bộ lọc hiện tại.'
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.container_name}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors whitespace-nowrap"
                  >
                    <td className="py-3 px-3.5 font-sans">
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {c.container_name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[230px]">
                        {c.role_description}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 font-sans">
                      <div className="flex flex-col gap-0.5">
                        <ContainerStateIndicator state={c.state} />
                        {c.oom_killed && (
                          <span className="text-[10px] font-mono font-semibold text-red-500">
                            OOMKilled (Exit {c.exit_code})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-right text-slate-900 dark:text-slate-100">
                      {formatMetricValue(c.cpu_percent, '%', 1)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatBytes(c.memory_usage_bytes, 1)}
                    </td>
                    <td className="py-3 px-2.5 text-right text-slate-500 dark:text-slate-400">
                      {formatBytes(c.memory_limit_bytes, 2)}
                    </td>
                    <td className="py-3 px-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden hidden xl:block">
                          <div
                            style={{
                              width: `${Math.min(100, c.memory_percent ?? 0)}%`,
                            }}
                            className={`h-full ${
                              (c.memory_percent ?? 0) >= 80
                                ? 'bg-red-500'
                                : (c.memory_percent ?? 0) >= 65
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                          />
                        </div>
                        <span>{formatMetricValue(c.memory_percent, '%', 1)}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-right">
                      <span
                        className={
                          c.restart_count > 0
                            ? 'text-amber-500 font-semibold'
                            : 'text-slate-600 dark:text-slate-400'
                        }
                      >
                        {c.restart_count}
                      </span>
                    </td>
                    <td className="py-3 px-2.5 font-sans">
                      <StatusIndicator
                        status={
                          c.health_status === 'healthy'
                            ? 'healthy'
                            : c.health_status === 'unhealthy'
                            ? 'critical'
                            : 'unknown'
                        }
                        customLabel={
                          c.health_status === 'none'
                            ? t('None', 'Không cấu hình')
                            : c.health_status
                        }
                      />
                    </td>
                    <td className="py-3 px-2.5 text-right text-slate-500 dark:text-slate-400">
                      {new Date(c.recorded_at).toISOString().slice(11, 19)} UTC
                    </td>
                    <td className="py-3 px-3.5 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => setSelectedContainer(c)}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {t('Inspect', 'Chi tiết')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Container Detail Modal / Drawer */}
      {selectedContainer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="container-modal-title"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div className="max-w-xl w-full border border-slate-700 rounded-xl bg-slate-900 text-slate-100 p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-mono text-slate-400">
                  Container ID: {selectedContainer.container_id_short ?? 'N/A'} ·{' '}
                  {selectedContainer.image}
                </div>
                <h3
                  id="container-modal-title"
                  className="text-lg font-bold font-mono text-white mt-0.5"
                >
                  {selectedContainer.container_name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedContainer.role_description}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close container details"
                onClick={() => setSelectedContainer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">
                  {t('Run State', 'Trạng thái thực thi')}
                </div>
                <div className="mt-1">
                  <ContainerStateIndicator state={selectedContainer.state} />
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">
                  {t('Working Set Memory', 'Bộ nhớ Working Set')}
                </div>
                <div className="text-sm font-semibold text-white mt-1">
                  {formatBytes(selectedContainer.memory_usage_bytes, 1)} /{' '}
                  {formatBytes(selectedContainer.memory_limit_bytes, 0)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">
                  {t('OOMKilled Flag', 'Cờ tràn bộ nhớ (OOMKilled)')}
                </div>
                <div
                  className={`text-sm font-semibold mt-1 ${
                    selectedContainer.oom_killed
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {selectedContainer.oom_killed
                    ? `TRUE (Exit ${selectedContainer.exit_code})`
                    : 'false (0)'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">
                  {t('CPU Utilization', 'Hiệu suất CPU')}
                </div>
                <div className="text-sm font-semibold text-white mt-1">
                  {formatMetricValue(selectedContainer.cpu_percent, '%', 1)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">
                  {t('Restart Count', 'Số lần tự khởi động lại')}
                </div>
                <div className="text-sm font-semibold text-white mt-1">
                  {selectedContainer.restart_count}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">
                  {t('Started At (UTC)', 'Khởi chạy lúc (UTC)')}
                </div>
                <div className="text-xs font-semibold text-slate-200 mt-1">
                  {selectedContainer.started_at
                    ? selectedContainer.started_at.replace('T', ' ').slice(0, 19)
                    : 'N/A'}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-emerald-400" />
                <span>
                  {t(
                    'Read-Only Verification Commands (Run on TV Box SSH)',
                    'Lệnh kiểm tra chỉ đọc an toàn (Chạy qua SSH trên TV Box)'
                  )}
                </span>
              </div>
              <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto p-2 rounded bg-slate-900">
{`# Verify container state, OOM flag, and restart count without modifying state:
docker inspect --format 'State={{.State.Status}} OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}} Restarts={{.RestartCount}}' ${selectedContainer.container_name}

# View last 30 log lines safely:
docker logs --tail 30 ${selectedContainer.container_name}`}
              </pre>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedContainer(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white cursor-pointer"
              >
                {t('Close Inspector', 'Đóng cửa sổ')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
