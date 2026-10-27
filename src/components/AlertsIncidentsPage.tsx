import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import type {
  AlertSeverity,
  AlertStatus,
  MonitoringSnapshot,
} from '../types/monitoring';
import { SeverityIndicator } from './StatusIndicator';
import { useLanguage } from '../i18n/LanguageContext';

interface AlertsIncidentsPageProps {
  snapshot: MonitoringSnapshot;
  onAcknowledgeAlert: (alertId: string) => void;
  onResolveAlert: (alertId: string) => void;
  onTriggerTestAlert: () => void;
}

export const AlertsIncidentsPage: React.FC<AlertsIncidentsPageProps> = ({
  snapshot,
  onAcknowledgeAlert,
  onResolveAlert,
  onTriggerTestAlert,
}) => {
  const { t } = useLanguage();
  const { alerts, settings } = snapshot;
  const [statusFilter, setStatusFilter] = useState<'all' | AlertStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | AlertSeverity>(
    'all'
  );

  const filtered = alerts.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    return true;
  });

  const openCount = alerts.filter((a) => a.status === 'open').length;
  const ackCount = alerts.filter((a) => a.status === 'acknowledged').length;
  const resolvedCount = alerts.filter((a) => a.status === 'resolved').length;

  return (
    <div className="space-y-6">
      {/* Header & Anti-Spam Policy Banner */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/70 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t(
              'Alerts, Incident Lifecycle & Anti-Spam Email Engine',
              'Quản lý Vòng đời Cảnh báo (Incident Lifecycle) & Chống Spam Cảnh báo'
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t(
              `Resource alerts require ${settings.consecutive_breaches_required} consecutive breaches before opening. Duplicate emails are suppressed for ${settings.alert_cooldown_minutes} minutes or immediately upon admin acknowledgement.`,
              `Cảnh báo tài nguyên yêu cầu vượt ngưỡng ${settings.consecutive_breaches_required} chu kỳ liên tiếp (Consecutive Breaches) để chống nhiễu (Anti-flapping). Email trùng lặp được chặn trong ${settings.alert_cooldown_minutes} phút (Cooldown) hoặc dừng ngay khi Admin xác nhận (Acknowledge).`
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTriggerTestAlert}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>
              {t(
                'Simulate Non-Destructive Test Alert',
                'Mô phỏng Cảnh báo Kiểm thử (An toàn)'
              )}
            </span>
          </button>
        </div>
      </section>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label="Filter alerts by status"
          className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
        >
          {(
            [
              ['all', t(`All (${alerts.length})`, `Tất cả (${alerts.length})`)],
              ['open', t(`Open (${openCount})`, `Đang mở (${openCount})`)],
              [
                'acknowledged',
                t(`Acknowledged (${ackCount})`, `Đã tiếp nhận (${ackCount})`),
              ],
              [
                'resolved',
                t(`Resolved (${resolvedCount})`, `Đã xử lý (${resolvedCount})`),
              ],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === val
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          role="group"
          aria-label="Filter alerts by severity"
          className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
        >
          {(
            [
              ['all', t('All Severities', 'Mọi mức độ')],
              ['critical', t('Critical', 'Nghiêm trọng (Critical)')],
              ['warning', t('Warning', 'Cảnh báo (Warning)')],
              ['info', t('Info', 'Thông tin (Info)')],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setSeverityFilter(val)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                severityFilter === val
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Incident List */}
      <section className="space-y-4">
        {filtered.length === 0 ? (
          <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            {t(
              'No alerts match the selected filter criteria.',
              'Không có cảnh báo nào khớp với bộ lọc đã chọn.'
            )}
          </div>
        ) : (
          filtered.map((alert) => (
            <div
              key={alert.id}
              className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/70 space-y-4"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap text-xs">
                    <SeverityIndicator severity={alert.severity} />
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                      {t('Status:', 'Trạng thái:')} {alert.status.toUpperCase()}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      Rule: {alert.rule_key}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {t('Emails Sent:', 'Email đã gửi:')}{' '}
                      {alert.notification_count} (Cooldown: {alert.cooldown_minutes}
                      m)
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {alert.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => onAcknowledgeAlert(alert.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-xs font-semibold text-white dark:text-slate-950 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {t('Acknowledge Incident', 'Tiếp nhận Sự cố (Ack)')}
                    </button>
                  )}
                  {alert.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={() => onResolveAlert(alert.id)}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {t('Mark Resolved', 'Đánh dấu Đã xử lý')}
                    </button>
                  )}
                </div>
              </div>

              {/* Explicit Separation: Observation vs Probable Cause vs Recommended Check */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    {t(
                      '1. Direct Observation (Measured Telemetry)',
                      '1. Quan sát thực tế (Direct Observation)'
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {alert.observation}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    {t(
                      '2. Probable Cause (Diagnostic Hypothesis)',
                      '2. Nguyên nhân khả dĩ (Probable Root Cause)'
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {alert.probable_cause}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    {t(
                      '3. Safe Read-Only Verification Step',
                      '3. Lệnh Xác minh Chỉ đọc An toàn (Read-Only Check)'
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-mono text-[11px]">
                    {alert.recommended_check}
                  </p>
                </div>
              </div>

              {/* Timestamps & Event History */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
                <div>
                  {t('First Seen:', 'Phát hiện đầu:')}{' '}
                  {alert.first_seen_at.replace('T', ' ').slice(0, 19)} UTC ·{' '}
                  {t('Last Seen:', 'Ghi nhận cuối:')}{' '}
                  {alert.last_seen_at.replace('T', ' ').slice(0, 19)} UTC
                </div>
                <div>
                  {alert.acknowledged_at && (
                    <span>
                      {t('Acked:', 'Đã Ack:')}{' '}
                      {alert.acknowledged_at.slice(11, 19)} UTC (
                      {alert.acknowledged_by}) ·{' '}
                    </span>
                  )}
                  {alert.resolved_at && (
                    <span className="text-emerald-500">
                      {t('Resolved:', 'Đã xử lý:')}{' '}
                      {alert.resolved_at.replace('T', ' ').slice(0, 19)} UTC
                    </span>
                  )}
                </div>
              </div>

              {alert.events.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    {t(
                      'Alert Audit Log (`alert_events`)',
                      'Nhật ký Kiểm toán Sự cố (`alert_events`)'
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs font-mono">
                    {alert.events.map((evt) => (
                      <div
                        key={evt.id}
                        className="flex items-start justify-between gap-4 text-slate-600 dark:text-slate-400"
                      >
                        <div>
                          <span className="text-slate-900 dark:text-slate-200 font-semibold">
                            [{evt.event_type}]
                          </span>{' '}
                          {evt.summary}
                        </div>
                        <span className="whitespace-nowrap shrink-0 text-[11px]">
                          {evt.created_at.slice(11, 19)} UTC
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
};
