import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, Save, Shield, Terminal } from 'lucide-react';
import type { MonitoringSettings } from '../types/monitoring';
import { validateIngestPayload } from '../utils/monitoringLogic';
import { useLanguage } from '../i18n/LanguageContext';

interface SettingsAndDeployPageProps {
  settings: MonitoringSettings;
  onUpdateSettings: (newSettings: MonitoringSettings) => void;
}

export const SettingsAndDeployPage: React.FC<SettingsAndDeployPageProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t } = useLanguage();
  const [formState, setFormState] = useState<MonitoringSettings>(settings);
  const [emailsInput, setEmailsInput] = useState(
    settings.alert_recipient_emails.join(', ')
  );
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'ok' | 'err';
    message: string;
  } | null>(null);

  const [activeBlueprintTab, setActiveBlueprintTab] = useState<
    'validator' | 'runbook' | 'quotas'
  >('validator');

  const [samplePayloadText, setSamplePayloadText] = useState(
    JSON.stringify(
      {
        device_id: 'arm64-tvbox-01',
        idempotency_key: 'arm64-tvbox-01:29881920',
        recorded_at: new Date().toISOString(),
        cpu_percent: 34.2,
        memory_total_bytes: 2088763392,
        temperature_celsius: 58.4,
        containers: [{ container_name: 'app-nextjs', state: 'running' }],
      },
      null,
      2
    )
  );
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveFeedback(null);

    const parsedEmails = emailsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (
      parsedEmails.length === 0 ||
      parsedEmails.some((em) => !em.includes('@'))
    ) {
      setSaveFeedback({
        type: 'err',
        message: t(
          'Please provide at least one valid alert recipient email address.',
          'Vui lòng nhập ít nhất một địa chỉ email nhận cảnh báo hợp lệ.'
        ),
      });
      return;
    }

    if (
      formState.ram_available_warn_percent <= 2 ||
      formState.ram_available_warn_percent >= 80
    ) {
      setSaveFeedback({
        type: 'err',
        message: t(
          'RAM Available Warning threshold must be between 3% and 79%.',
          'Ngưỡng cảnh báo RAM khả dụng (MemAvailable) phải nằm trong khoảng 3% đến 79%.'
        ),
      });
      return;
    }

    if (
      formState.heartbeat_stale_seconds < 60 ||
      formState.heartbeat_offline_seconds <= formState.heartbeat_stale_seconds
    ) {
      setSaveFeedback({
        type: 'err',
        message: t(
          'Heartbeat Stale threshold must be >= 60s and less than Offline threshold.',
          'Ngưỡng trễ tín hiệu (Heartbeat Stale) phải >= 60 giây và nhỏ hơn ngưỡng Mất kết nối (Offline).'
        ),
      });
      return;
    }

    const updated: MonitoringSettings = {
      ...formState,
      alert_recipient_emails: parsedEmails,
    };

    onUpdateSettings(updated);
    setSaveFeedback({
      type: 'ok',
      message: t(
        'Monitoring thresholds, cooldown settings, and retention policy updated.',
        'Đã cập nhật ngưỡng cảnh báo (Alert Thresholds), thời gian Cooldown và chính sách lưu trữ (Data Retention).'
      ),
    });
  };

  const handleRunPayloadValidation = () => {
    try {
      const parsed = JSON.parse(samplePayloadText);
      const res = validateIngestPayload(parsed);
      setValidationResult(res);
    } catch (err: any) {
      setValidationResult({
        valid: false,
        errors: [
          t(
            `Malformed JSON syntax: ${err?.message ?? 'Invalid JSON'}`,
            `Lỗi cú pháp JSON (Malformed JSON): ${err?.message ?? 'Invalid JSON'}`
          ),
        ],
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Editable Thresholds & Retention Form */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-white dark:bg-slate-900/70">
        <div className="flex items-start justify-between gap-4 mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t(
                'Alert Thresholds, Cooldown & Retention Configuration',
                'Cấu Hình Ngưỡng Cảnh Báo (Thresholds), Cooldown & Chu Kỳ Lưu Trữ (Retention)'
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t(
                'Adjust thresholds per hardware profile. Stored in ',
                'Tinh chỉnh ngưỡng cảnh báo theo đặc tả phần cứng TV Box. Được lưu tại bảng '
              )}
              <code className="font-mono">public.monitoring_settings</code>
              {t(
                ' (protected by Admin RLS). No SSH, firewall, or Docker control actions are exposed.',
                ' (bảo vệ bởi Admin RLS). Không mở cổng SSH, Firewall hay lệnh điều khiển Docker từ xa.'
              )}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
            {t('Secrets Hidden (Write-Only)', 'Bảo mật Khóa (Write-Only Secrets)')}
          </span>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label
                htmlFor="ram-warn-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t(
                  'Available RAM Warning (%)',
                  'Ngưỡng Cảnh báo RAM Khả dụng (MemAvailable %)'
                )}
              </label>
              <input
                id="ram-warn-input"
                type="number"
                min={3}
                max={75}
                value={formState.ram_available_warn_percent}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    ram_available_warn_percent: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="cpu-warn-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('CPU Sustained Warning (%)', 'Ngưỡng Cảnh báo Tải CPU Duy trì (%)')}
              </label>
              <input
                id="cpu-warn-input"
                type="number"
                min={50}
                max={99}
                value={formState.cpu_warn_percent}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    cpu_warn_percent: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="temp-warn-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('SoC Thermal Warning (°C)', 'Ngưỡng Cảnh báo Nhiệt độ SoC (°C)')}
              </label>
              <input
                id="temp-warn-input"
                type="number"
                min={45}
                max={105}
                value={formState.temp_warn_celsius}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    temp_warn_celsius: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="disk-warn-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t(
                  'Root Filesystem Warning (%)',
                  'Ngưỡng Cảnh báo Phân vùng Rootfs `/`'
                )}
              </label>
              <input
                id="disk-warn-input"
                type="number"
                min={50}
                max={98}
                value={formState.disk_warn_percent}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    disk_warn_percent: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="hb-stale-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t(
                  'Heartbeat Stale Warning (Seconds)',
                  'Ngưỡng Trễ Tín hiệu Heartbeat Stale (Giây)'
                )}
              </label>
              <input
                id="hb-stale-input"
                type="number"
                min={60}
                max={1800}
                value={formState.heartbeat_stale_seconds}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    heartbeat_stale_seconds: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="hb-offline-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t(
                  'Heartbeat Offline Critical (Seconds)',
                  'Ngưỡng Mất kết nối Heartbeat Offline (Giây)'
                )}
              </label>
              <input
                id="hb-offline-input"
                type="number"
                min={180}
                max={7200}
                value={formState.heartbeat_offline_seconds}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    heartbeat_offline_seconds: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="consecutive-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t(
                  'Consecutive Breaches to Trigger',
                  'Số Chu kỳ Vượt ngưỡng Liên tiếp (Flap Suppression)'
                )}
              </label>
              <input
                id="consecutive-input"
                type="number"
                min={1}
                max={10}
                value={formState.consecutive_breaches_required}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    consecutive_breaches_required: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="cooldown-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t(
                  'Email Alert Cooldown (Minutes)',
                  'Thời gian Giãn cách Gửi Email (Cooldown — Phút)'
                )}
              </label>
              <input
                id="cooldown-input"
                type="number"
                min={5}
                max={1440}
                value={formState.alert_cooldown_minutes}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    alert_cooldown_minutes: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            <div className="lg:col-span-2">
              <label
                htmlFor="recipient-emails-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t(
                  'Alert Recipient Emails (Comma-separated)',
                  'Danh sách Email Nhận Cảnh báo (Phân cách bằng dấu phẩy)'
                )}
              </label>
              <input
                id="recipient-emails-input"
                type="text"
                value={emailsInput}
                onChange={(e) => setEmailsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="retention-days-input"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t(
                  'Raw Metric Retention (Days — Free Tier)',
                  'Chu kỳ Lưu trữ Dữ liệu Thô (Raw Retention — Ngày)'
                )}
              </label>
              <input
                id="retention-days-input"
                type="number"
                min={7}
                max={30}
                value={formState.raw_retention_days}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    raw_retention_days: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {saveFeedback && (
            <div
              role="alert"
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                saveFeedback.type === 'ok'
                  ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
                  : 'bg-red-950/60 border border-red-800 text-red-200'
              }`}
            >
              {saveFeedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{saveFeedback.message}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t('Save Monitoring Settings', 'Lưu Cấu hình Giám sát')}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Interactive Ingest Validator, Deployment Runbook & Free Tier Quota Audit */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-white dark:bg-slate-900/70 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t(
                'Ingestion Validator, Deployment Runbook & Free Tier Quota Audit',
                'Kiểm Định Gói Tin Ingest, Runbook Triển Khai & Định Mức Free Tier'
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                'Test `ingest-metrics` payload validation, review deployment commands by target environment, and inspect Free Tier storage math.',
                'Kiểm tra cấu trúc gói tin `ingest-metrics`, tra cứu câu lệnh vận hành trên TV Box và kiểm toán dung lượng lưu trữ PostgreSQL.'
              )}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveBlueprintTab('validator')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                activeBlueprintTab === 'validator'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-500'
              }`}
            >
              {t('Payload Validator', 'Kiểm tra Payload JSON')}
            </button>
            <button
              type="button"
              onClick={() => setActiveBlueprintTab('runbook')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                activeBlueprintTab === 'runbook'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-500'
              }`}
            >
              {t('Deployment & Token Rotation', 'Runbook Triển khai & Xoay vòng Khóa')}
            </button>
            <button
              type="button"
              onClick={() => setActiveBlueprintTab('quotas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                activeBlueprintTab === 'quotas'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-500'
              }`}
            >
              {t('Free Tier & Security Audit', 'Định mức Tài nguyên & Bảo mật')}
            </button>
          </div>
        </div>

        {activeBlueprintTab === 'validator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
            <div className="lg:col-span-7 space-y-2">
              <label
                htmlFor="payload-json-textarea"
                className="block font-medium text-slate-700 dark:text-slate-300"
              >
                {t(
                  'Test TV Box Agent JSON Payload (`POST /functions/v1/ingest-metrics`)',
                  'Kiểm thử Gói tin JSON từ TV Box Agent (`POST /functions/v1/ingest-metrics`)'
                )}
              </label>
              <textarea
                id="payload-json-textarea"
                rows={10}
                value={samplePayloadText}
                onChange={(e) => setSamplePayloadText(e.target.value)}
                className="w-full p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs border border-slate-800"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunPayloadValidation}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-semibold cursor-pointer"
                >
                  {t(
                    'Validate Payload Schema & Bounds',
                    'Kiểm tra Schema & Giới hạn Giá trị (Bounds)'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSamplePayloadText(
                      JSON.stringify(
                        {
                          device_id: 'x',
                          cpu_percent: 250,
                          temperature_celsius: 999,
                        },
                        null,
                        2
                      )
                    );
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {t(
                    'Load Malformed Payload Example',
                    'Nạp Mẫu Payload Lỗi (Malformed)'
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500" />
                <span>
                  {t(
                    'Edge Function Schema Verification Result',
                    'Kết quả Kiểm định Schema tại Edge Function'
                  )}
                </span>
              </div>
              {!validationResult ? (
                <p className="text-slate-500">
                  {t(
                    'Click "Validate Payload Schema & Bounds" to test how `ingest-metrics` validates incoming TV Box packets.',
                    'Nhấn "Kiểm tra Schema & Giới hạn Giá trị" để mô phỏng cách hàm `ingest-metrics` kiểm duyệt gói tin từ TV Box.'
                  )}
                </p>
              ) : validationResult.valid ? (
                <div className="p-3 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-200 font-mono">
                  {t(
                    'HTTP 201 Created — Schema valid, numeric bounds verified, idempotency key accepted.',
                    'HTTP 201 Created — Schema hợp lệ, các chỉ số nằm trong ngưỡng vật lý, Idempotency Key được chấp nhận.'
                  )}
                </div>
              ) : (
                <div className="p-3 rounded bg-red-950/60 border border-red-800 text-red-200 space-y-1 font-mono">
                  <div className="font-bold">
                    {t(
                      'HTTP 422 Unprocessable Entity — Rejected:',
                      'HTTP 422 Unprocessable Entity — Từ chối gói tin:'
                    )}
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    {validationResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {activeBlueprintTab === 'runbook' && (
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-950 text-slate-200 border border-slate-800 space-y-2">
              <div className="font-semibold text-emerald-400 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                <span>
                  {t(
                    '1. Where to run: SSH Session on Tanix TX3 Mini TV Box (Read-Only Dry Run First)',
                    '1. Môi trường thực thi: Phiên SSH trên Tanix TX3 Mini TV Box (Chạy thử chế độ Read-Only)'
                  )}
                </span>
              </div>
              <pre className="font-mono text-[11px] overflow-x-auto text-slate-300">
{`# Verify actual container names without touching production:
docker ps -a --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}"

# Run the collector agent script once:
sudo /opt/server-monitor/collector.sh /opt/server-monitor/agent.env`}
              </pre>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 text-slate-200 border border-slate-800 space-y-2">
              <div className="font-semibold text-sky-400">
                {t(
                  '2. Where to run: Supabase SQL Editor (Project: `server-monitoring`)',
                  '2. Môi trường thực thi: Supabase SQL Editor (Khởi tạo Schema & RLS Policies)'
                )}
              </div>
              <p className="text-slate-400">
                {t(
                  'Execute `supabase/migrations/001_initial_monitoring_schema.sql` to create all tables, indexes, `is_monitoring_admin()` RLS policies, and retention functions.',
                  'Chạy file migration SQL `supabase/migrations/001_initial_monitoring_schema.sql` để khởi tạo toàn bộ bảng, chỉ mục (Indexes), hàm bảo mật `is_monitoring_admin()` RLS và tiến trình tự động dọn dẹp dữ liệu cũ.'
                )}
              </p>
            </div>
          </div>
        )}

        {activeBlueprintTab === 'quotas' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Supabase PostgreSQL (500 MB Free)
              </div>
              <div className="font-mono text-emerald-500 font-semibold">
                {t('Est. Usage: ~68 MB (13.6%)', 'Dung lượng ước tính: ~68 MB (13.6%)')}
              </div>
              <p className="text-slate-500">
                {t(
                  '14-day raw retention + 90-day hourly rollup via `rollup_and_prune_monitoring_data()` prevents unbounded growth.',
                  'Lưu dữ liệu thô 14 ngày + tổng hợp theo giờ (Hourly Rollup) 90 ngày qua hàm `rollup_and_prune_monitoring_data()` giúp chống đầy ổ đĩa DB.'
                )}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Edge Functions / PostgREST Quota
              </div>
              <div className="font-mono text-emerald-500 font-semibold">
                {t(
                  'Est. Usage: ~57,600 req / mo (11.5%)',
                  'Tần suất ước tính: ~57,600 req / tháng (11.5%)'
                )}
              </div>
              <p className="text-slate-500">
                {t(
                  '43,200 invocations from TV Box (60s cycle) + 14,400 from external uptime probe (3m cycle).',
                  '43.200 bản tin từ TV Box (chu kỳ 60 giây) + 14.400 lần kiểm tra Uptime ngoài mạng (chu kỳ 3 phút).'
                )}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                {t(
                  'TV Box Agent Footprint (2 GB RAM)',
                  'Tài nguyên TV Box Agent Chiếm dụng (trên 2 GB RAM)'
                )}
              </div>
              <div className="font-mono text-emerald-500 font-semibold">
                {t('Idle RAM: 0 MB · Peak: < 14 MB', 'RAM nghỉ: 0 MB · Đỉnh: < 14 MB')}
              </div>
              <p className="text-slate-500">
                {t(
                  'Runs as low-priority daemon with `Nice=19`, `IOSchedulingClass=idle`, and `MemoryMax=32M`.',
                  'Chạy tiến trình ưu tiên thấp nhất với `Nice=19`, `IOSchedulingClass=idle` và giới hạn cứng `MemoryMax=32M`.'
                )}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
