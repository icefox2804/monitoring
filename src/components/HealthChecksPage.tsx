import React from 'react';
import { Check, Minus, X } from 'lucide-react';
import type { MonitoringSnapshot } from '../types/monitoring';
import { formatMetricValue } from '../utils/monitoringLogic';
import { StatusIndicator } from './StatusIndicator';
import { useLanguage } from '../i18n/LanguageContext';

interface HealthChecksPageProps {
  snapshot: MonitoringSnapshot;
}

export const HealthChecksPage: React.FC<HealthChecksPageProps> = ({
  snapshot,
}) => {
  const { t } = useLanguage();
  const { service_checks } = snapshot;

  const renderLayerState = (val: boolean | null) => {
    if (val === null) {
      return (
        <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-xs">
          <Minus className="w-3.5 h-3.5" />
          <span>N/A</span>
        </span>
      );
    }
    if (val) {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-medium">
          <Check className="w-3.5 h-3.5" />
          <span>{t('Pass', 'Đạt (Pass)')}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-mono text-xs font-semibold">
        <X className="w-3.5 h-3.5" />
        <span>{t('Fail', 'Lỗi (Fail)')}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header explaining 4-layer distinction */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/70">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t(
            'Multi-Layer Service & Dependency Health Matrix (10 Targets)',
            'Ma trận Kiểm tra Sức khỏe Dịch vụ Đa tầng (4-Layer Health Matrix)'
          )}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {t(
            'A running Docker container does not guarantee that MariaDB, Redis, or PHP-FPM is accepting requests. This matrix separates 1. Container Running · 2. Application Responding · 3. Upstream Dependency Healthy · 4. Publicly Reachable.',
            'Một Docker container đang ở trạng thái Running không đồng nghĩa MariaDB, Redis hay PHP-FPM đang xử lý được truy vấn. Ma trận này bóc tách độc lập 4 tầng: 1. Tiến trình Container (Container Up) · 2. Phản hồi Ứng dụng (App Responding) · 3. Dịch vụ Phụ thuộc (Dependencies OK) · 4. Truy cập Công khai (Public Reachable).'
          )}
        </p>
      </section>

      {/* 10 Service Targets Matrix Table */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-medium">
                  {t('Service Target', 'Đích Dịch vụ (Service Target)')}
                </th>
                <th className="py-3 px-3 font-medium">
                  {t('Overall Status', 'Trạng thái tổng')}
                </th>
                <th className="py-3 px-3 font-medium">
                  {t('1. Container Up', '1. Container Chạy')}
                </th>
                <th className="py-3 px-3 font-medium">
                  {t('2. App Responding', '2. App Phản hồi')}
                </th>
                <th className="py-3 px-3 font-medium">
                  {t('3. Dependencies OK', '3. Phụ thuộc (DB/Cache)')}
                </th>
                <th className="py-3 px-3 font-medium">
                  {t('4. Public Reachable', '4. Public Internet')}
                </th>
                <th className="py-3 px-3 font-medium text-right">
                  {t('Latency', 'Độ trễ')}
                </th>
                <th className="py-3 px-4 font-medium">
                  {t(
                    'Verification Method & Notes',
                    'Phương thức Xác thực & Ghi chú Chẩn đoán'
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
              {service_checks.map((chk) => (
                <tr
                  key={chk.target_name}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {chk.display_name}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {chk.endpoint_or_target}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <StatusIndicator status={chk.status} />
                  </td>
                  <td className="py-3 px-3">
                    {renderLayerState(chk.container_running)}
                  </td>
                  <td className="py-3 px-3">{renderLayerState(chk.app_responding)}</td>
                  <td className="py-3 px-3">
                    {renderLayerState(chk.dependency_healthy)}
                  </td>
                  <td className="py-3 px-3">
                    {renderLayerState(chk.public_reachable)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMetricValue(chk.response_time_ms, ' ms', 0, {
                      nullLabel: '—',
                    })}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                    <div>{chk.verification_method}</div>
                    {chk.error_summary && (
                      <div className="text-red-500 dark:text-red-400 font-mono text-[11px] mt-0.5">
                        Fault: {chk.error_summary}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
