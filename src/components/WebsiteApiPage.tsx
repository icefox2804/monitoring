import React, { useState } from 'react';
import { Globe, Play, RefreshCw } from 'lucide-react';
import type { MonitoringSnapshot } from '../types/monitoring';
import { formatMetricValue } from '../utils/monitoringLogic';
import { StatusIndicator, TelemetryLineChart } from './StatusIndicator';
import { useLanguage } from '../i18n/LanguageContext';

interface WebsiteApiPageProps {
  snapshot: MonitoringSnapshot;
  onRunManualExternalProbe: () => void;
}

export const WebsiteApiPage: React.FC<WebsiteApiPageProps> = ({
  snapshot,
  onRunManualExternalProbe,
}) => {
  const { t } = useLanguage();
  const { service_checks, time_series } = snapshot;
  const [probing, setProbing] = useState(false);

  const webCheck = service_checks.find((c) => c.target_name === 'public_website');
  const apiCheck = service_checks.find((c) => c.target_name === 'public_api');
  const ingestCheck = service_checks.find(
    (c) => c.target_name === 'ingestion_endpoint'
  );

  const handleProbe = () => {
    setProbing(true);
    onRunManualExternalProbe();
    setTimeout(() => setProbing(false), 300);
  };

  return (
    <div className="space-y-6">
      {/* Header & External Probe Action */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t(
              'External Uptime & Public Endpoint Verification (`app.example.com`)',
              'Giám sát Uptime Ngoại vi & Xác thực Public Endpoint (`app.example.com`)'
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t(
              'Probed independently from outside the TV Box network via `cron-job.org` → Supabase Edge Function `external-probe`. Does not assume HTTP 200 on homepage implies Laravel database or queue health.',
              'Kiểm tra độc lập từ ngoài mạng nội bộ TV Box qua `cron-job.org` → Supabase Edge Function `external-probe`. Không đánh đồng HTTP 200 ở trang chủ với trạng thái sống của Laravel DB hay Queue Worker.'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={handleProbe}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
        >
          {probing ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          <span>
            {t('Trigger External Probe Check', 'Kích hoạt Probe Kiểm tra Ngay')}
          </span>
        </button>
      </section>

      {/* Primary Endpoint Cards */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[webCheck, apiCheck, ingestCheck].map((chk) => {
          if (!chk) return null;
          return (
            <div
              key={chk.target_name}
              className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/60 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    {chk.display_name}
                  </span>
                  <StatusIndicator status={chk.status} />
                </div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">
                  {chk.endpoint_or_target}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 font-mono tabular-nums text-xs">
                <div>
                  <div className="text-[10px] text-slate-500 font-sans">
                    {t('HTTP Status', 'Mã HTTP')}
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {chk.http_status !== null ? `HTTP ${chk.http_status}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-sans">
                    {t('Response Time', 'Độ trễ (Latency)')}
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {formatMetricValue(chk.response_time_ms, ' ms', 0, {
                      nullLabel:
                        chk.status === 'healthy'
                          ? t('< 50 ms (Local)', '< 50 ms (Nội bộ)')
                          : t('Failed', 'Lỗi kết nối'),
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-sans">
                    {t('Error Class', 'Phân loại lỗi')}
                  </div>
                  <div
                    className={`font-semibold mt-0.5 ${
                      chk.error_code === 'NONE'
                        ? 'text-emerald-500'
                        : 'text-red-500'
                    }`}
                  >
                    {chk.error_code}
                  </div>
                </div>
              </div>

              {chk.error_summary && (
                <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-xs text-red-200 font-mono">
                  {chk.error_summary}
                </div>
              )}

              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between font-mono">
                <span>
                  {t('Checked:', 'Đo lúc:')}{' '}
                  {new Date(chk.checked_at).toISOString().slice(11, 19)} UTC
                </span>
                <span>
                  {t('Source:', 'Nguồn:')} {chk.source}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {/* Response Latency Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TelemetryLineChart
          title={t(
            'Public Website Response Time (ms)',
            'Độ trễ Phản hồi Website Public (ms)'
          )}
          subtitle="https://app.example.com via Cloudflare Tunnel"
          data={time_series.map((pt) => ({
            label: pt.label,
            value: pt.web_response_ms,
          }))}
          unit=" ms"
          maxDomain={2000}
          warnThreshold={800}
          criticalThreshold={1500}
          colorHex="#10b981"
        />

        <TelemetryLineChart
          title={t(
            'Public Laravel API Response Time (ms)',
            'Độ trễ Phản hồi Laravel API (ms)'
          )}
          subtitle={t(
            'https://app.example.com/api/v1/health-ping (Null when HTTP 502/530)',
            'https://app.example.com/api/v1/health-ping (Giá trị Null khi lỗi HTTP 502/530)'
          )}
          data={time_series.map((pt) => ({
            label: pt.label,
            value: pt.api_response_ms,
          }))}
          unit=" ms"
          maxDomain={2000}
          warnThreshold={800}
          criticalThreshold={1500}
          colorHex="#38bdf8"
        />
      </section>

      {/* Error Classification Matrix & Read-Only Health Endpoint Proposal */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/60 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(
              'Failure Classification Taxonomy (`external-probe`)',
              'Ma trận Phân loại Lỗi Đường truyền & Ứng dụng (`external-probe`)'
            )}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t(
              'Distinguishes network/tunnel failures from application or database crashes:',
              'Phân biệt chính xác sự cố đứt kết nối mạng/Tunnel với lỗi sập tiến trình ứng dụng hoặc DB:'
            )}
          </p>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
              <span className="font-mono font-semibold text-amber-500">
                TIMEOUT (&gt; 8000ms):
              </span>{' '}
              {t(
                'PHP-FPM worker pool saturated or TV Box stalled in eMMC swap thrashing.',
                'Cạn kiệt PHP-FPM worker pool hoặc TV Box bị treo I/O do tràn Swap trên eMMC.'
              )}
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
              <span className="font-mono font-semibold text-red-400">
                HTTP 530 / DNS_ERROR / TLS_ERROR:
              </span>{' '}
              {t(
                '`cloudflare-tunnel` daemon disconnected or ISP outage at server premises.',
                'Tiến trình `cloudflare-tunnel` mất kết nối hoặc mất mạng Internet tại nơi đặt máy chủ.'
              )}
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
              <span className="font-mono font-semibold text-red-500">
                HTTP 502 / 504 (Bad Gateway):
              </span>{' '}
              {t(
                'Cloudflare and `app-nginx` are reachable, but `app-backend` or `app-nextjs` crashed (e.g., OOMKilled).',
                'Cloudflare và `app-nginx` vẫn thông suốt, nhưng Upstream `app-backend` hoặc `app-nextjs` bị dừng (ví dụ: bị OOMKilled).'
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/60 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(
                'Optional Read-Only Laravel Health Endpoint Proposal',
                'Đề xuất Endpoint Health-Check Chỉ đọc trên Laravel (Tùy chọn)'
              )}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t(
              'Production code is never modified without approval. If you choose to add a dedicated read-only health route in Laravel later, use this minimal snippet that leaks zero environment details:',
              'Hệ thống giám sát không tự ý sửa code Production. Nếu bạn muốn thêm route kiểm tra kết nối DB & Redis chỉ đọc trong Laravel, có thể dùng đoạn mã tối giản không lộ thông tin nhạy cảm sau:'
            )}
          </p>
          <pre className="text-[11px] font-mono bg-slate-950 text-slate-200 p-3 rounded-lg overflow-x-auto border border-slate-800">
{`// routes/api.php (Optional — Only add after approval)
Route::get('/health-ping', function () {
    try {
        DB::select('SELECT 1');
        Redis::ping();
        return response()->json(['ok' => true], 200);
    } catch (\\Throwable $e) {
        return response()->json(['ok' => false], 503);
    }
});`}
          </pre>
        </div>
      </section>
    </div>
  );
};
