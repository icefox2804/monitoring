/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Box,
  CheckCircle2,
  Cpu,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sun,
  Table2,
  X,
} from 'lucide-react';
import type {
  AlertRecord,
  DataViewMode,
  MonitoringSettings,
  MonitoringSnapshot,
  SimulationScenarioId,
} from './types/monitoring';
import {
  DEFAULT_MONITORING_SETTINGS,
  generateMockSnapshot,
} from './data/mockScenarios';
import {
  fetchLiveMonitoringSnapshot,
  getSupabaseClient,
  verifyAdminSession,
} from './lib/supabaseClient';
import { AuthGateView } from './components/AuthGateModal';
import { OverviewPage } from './components/OverviewPage';
import { BentoTelemetryHub } from './components/BentoTelemetryHub';
import { ServerMetricsPage } from './components/ServerMetricsPage';
import { DockerContainersPage } from './components/DockerContainersPage';
import { WebsiteApiPage } from './components/WebsiteApiPage';
import { HealthChecksPage } from './components/HealthChecksPage';
import { AlertsIncidentsPage } from './components/AlertsIncidentsPage';
import { SettingsAndDeployPage } from './components/SettingsAndDeployPage';
import {
  LanguageProvider,
  LanguageSwitcher,
  useLanguage,
} from './i18n/LanguageContext';

export type DashboardTabId =
  | 'overview'
  | 'server'
  | 'containers'
  | 'website'
  | 'health'
  | 'alerts'
  | 'settings';

export type OverviewLayoutStyle = 'classic' | 'bento';

const NAV_ITEMS: {
  id: DashboardTabId;
  labelEn: string;
  labelVi: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    id: 'overview',
    labelEn: 'Overview',
    labelVi: 'Tổng quan Hạ tầng',
    icon: LayoutDashboard,
  },
  {
    id: 'server',
    labelEn: 'Server Metrics',
    labelVi: 'Tài nguyên Máy chủ',
    icon: Cpu,
  },
  {
    id: 'containers',
    labelEn: 'Docker Containers',
    labelVi: 'Docker Containers',
    icon: Box,
  },
  {
    id: 'website',
    labelEn: 'Website & API',
    labelVi: 'Website & API Probe',
    icon: Globe,
  },
  {
    id: 'health',
    labelEn: 'Health Checks',
    labelVi: 'Ma trận Sức khỏe',
    icon: CheckCircle2,
  },
  {
    id: 'alerts',
    labelEn: 'Alerts & Incidents',
    labelVi: 'Cảnh báo & Sự cố',
    icon: ShieldAlert,
  },
  {
    id: 'settings',
    labelEn: 'Settings',
    labelVi: 'Cấu hình & Ngưỡng',
    icon: Settings,
  },
];

const SCENARIO_OPTIONS: {
  id: SimulationScenarioId;
  shortLabelEn: string;
  shortLabelVi: string;
}[] = [
  { id: 'nominal', shortLabelEn: 'Healthy', shortLabelVi: 'Ổn định (Healthy)' },
  {
    id: 'warning',
    shortLabelEn: 'Warning (RAM/Temp)',
    shortLabelVi: 'Cảnh báo (RAM/Nhiệt)',
  },
  {
    id: 'critical',
    shortLabelEn: 'Critical (OOM/502)',
    shortLabelVi: 'Nguy cấp (OOM/502)',
  },
  {
    id: 'stale',
    shortLabelEn: 'Stale (>4m)',
    shortLabelVi: 'Trễ tín hiệu (>4p)',
  },
  {
    id: 'offline',
    shortLabelEn: 'Offline (>18m)',
    shortLabelVi: 'Mất kết nối (>18p)',
  },
  {
    id: 'sensor_na',
    shortLabelEn: 'Sensor N/A vs 0',
    shortLabelVi: 'Cảm biến N/A vs 0',
  },
];

function DashboardShell() {
  const { t } = useLanguage();
  const requireLoginFirst =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('login') === '1';

  const [sessionMode, setSessionMode] = useState<
    'unauthenticated' | 'prototype' | 'live'
  >(requireLoginFirst ? 'unauthenticated' : 'prototype');
  const defaultAdminEmail =
    (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim() ||
    'admin@example.com';
  const [adminEmail, setAdminEmail] = useState<string>(
    requireLoginFirst ? '' : defaultAdminEmail
  );

  const [overviewLayout, setOverviewLayout] = useState<OverviewLayoutStyle>(() => {
    if (typeof window !== 'undefined') {
      const qLayout = new URLSearchParams(window.location.search).get('layout');
      if (qLayout === 'bento' || qLayout === 'classic') return qLayout;
      const saved = window.localStorage.getItem('server_monitor_ui_layout_v1');
      if (saved === 'bento' || saved === 'classic') return saved;
    }
    return 'bento';
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const qTheme = new URLSearchParams(window.location.search).get('theme');
      if (qTheme === 'light') return false;
      if (qTheme === 'dark') return true;
      const savedTheme = window.localStorage.getItem('server_monitor_theme_v1');
      if (savedTheme === 'light') return false;
      if (savedTheme === 'dark') return true;
    }
    // Default to Light Mode when Bento Hub is active so the #F4F6F9 canvas + soft drop shadows match the reference aesthetic
    return false;
  });

  const handleToggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          'server_monitor_theme_v1',
          next ? 'dark' : 'light'
        );
      }
      return next;
    });
  };

  const handleSelectOverviewLayout = (style: OverviewLayoutStyle) => {
    setOverviewLayout(style);
    setActiveTab('overview');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('server_monitor_ui_layout_v1', style);
    }
  };

  const [activeTab, setActiveTab] = useState<DashboardTabId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [scenario, setScenario] = useState<SimulationScenarioId>('nominal');
  const [viewMode, setViewMode] = useState<DataViewMode>('populated');
  const [settings, setSettings] = useState<MonitoringSettings>(
    DEFAULT_MONITORING_SETTINGS
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [snapshot, setSnapshot] = useState<MonitoringSnapshot>(() =>
    generateMockSnapshot('nominal', Date.now(), DEFAULT_MONITORING_SETTINGS)
  );
  const [liveError, setLiveError] = useState<string | null>(null);

  // Sync dark mode class on root html element
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Check if there is already an active Supabase session on mount
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    verifyAdminSession(client)
      .then((res) => {
        if (res.authenticated && res.isAdmin && res.email) {
          setAdminEmail(res.email);
          setSessionMode('live');
        }
      })
      .catch(() => {
        // Ignore if unauthenticated
      });
  }, []);

  // Refresh mock snapshot when scenario or settings change in prototype mode
  useEffect(() => {
    if (sessionMode === 'prototype') {
      const currentTs = Date.now();
      setNowMs(currentTs);
      setSnapshot(generateMockSnapshot(scenario, currentTs, settings));
    }
  }, [scenario, sessionMode]);

  // Fetch live data in live mode (every 45s)
  useEffect(() => {
    if (sessionMode !== 'live') return;
    const client = getSupabaseClient();
    if (!client) return;

    let cancelled = false;
    const loadLive = async () => {
      try {
        setLiveError(null);
        const liveSnap = await fetchLiveMonitoringSnapshot(client);
        if (!cancelled) {
          setNowMs(Date.now());
          setSnapshot(liveSnap);
          setSettings(liveSnap.settings);
        }
      } catch (err: any) {
        if (!cancelled) {
          setLiveError(
            err?.message ??
              t(
                'Failed to fetch live telemetry from Supabase.',
                'Không thể tải dữ liệu Telemetry thời gian thực từ Supabase.'
              )
          );
        }
      }
    };

    loadLive();
    const timer = window.setInterval(loadLive, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionMode]);

  const handleManualRefresh = async () => {
    const currentTs = Date.now();
    setNowMs(currentTs);

    if (sessionMode === 'prototype') {
      setSnapshot((prev) => ({
        ...generateMockSnapshot(scenario, currentTs, settings),
        alerts: prev.alerts, // preserve user acknowledgements in current scenario
      }));
      return;
    }

    const client = getSupabaseClient();
    if (client) {
      try {
        setLiveError(null);
        const liveSnap = await fetchLiveMonitoringSnapshot(client);
        setSnapshot(liveSnap);
      } catch (err: any) {
        setLiveError(err?.message ?? t('Refresh failed', 'Làm mới dữ liệu thất bại'));
      }
    }
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    const ackTime = new Date().toISOString();
    setSnapshot((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a): AlertRecord => {
        if (a.id !== alertId) return a;
        return {
          ...a,
          status: 'acknowledged',
          acknowledged_at: ackTime,
          acknowledged_by: adminEmail || 'admin@example.com',
          events: [
            ...a.events,
            {
              id: `evt-ack-${Date.now()}`,
              alert_id: a.id,
              event_type: 'acknowledged',
              created_at: ackTime,
              actor: adminEmail || 'admin@example.com',
              summary: t(
                'Alert acknowledged by administrator. Duplicate emails suppressed.',
                'Quản trị viên đã xác nhận (Acknowledged) cảnh báo. Đã tạm dừng gửi email lặp lại.'
              ),
            },
          ],
        };
      }),
    }));
  };

  const handleResolveAlert = (alertId: string) => {
    const resTime = new Date().toISOString();
    setSnapshot((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a): AlertRecord => {
        if (a.id !== alertId) return a;
        return {
          ...a,
          status: 'resolved',
          resolved_at: resTime,
          events: [
            ...a.events,
            {
              id: `evt-res-${Date.now()}`,
              alert_id: a.id,
              event_type: 'resolved',
              created_at: resTime,
              actor: adminEmail || 'admin@example.com',
              summary: t(
                'Incident marked resolved by administrator.',
                'Quản trị viên đã đánh dấu sự cố hoàn tất xử lý (Resolved).'
              ),
            },
          ],
        };
      }),
    }));
  };

  const handleTriggerTestAlert = () => {
    const createdIso = new Date().toISOString();
    const newAlert: AlertRecord = {
      id: `alt-test-${Date.now()}`,
      device_id: snapshot.device.id,
      rule_key: 'manual_non_destructive_test',
      source: 'external_uptime',
      severity: 'warning',
      status: 'open',
      title: t(
        'Simulated Non-Destructive Alert & Email Cooldown Verification',
        'Kiểm thử Cảnh báo Không Xâm phạm (Non-Destructive Alert) & Cơ chế Cooldown Email'
      ),
      observation: t(
        'Administrator triggered a non-destructive alert verification test from the console. Production containers on arm64-tvbox-01 were NOT touched.',
        'Quản trị viên đã kích hoạt bài kiểm tra cảnh báo an toàn từ bảng điều khiển. Các container Production trên arm64-tvbox-01 hoàn toàn KHÔNG bị tác động.'
      ),
      probable_cause: t(
        'Intentional verification test confirming Alert State Machine and email cooldown suppression.',
        'Bài kiểm tra chủ động nhằm xác minh Máy trạng thái Cảnh báo (Alert State Machine) và cơ chế chống gửi trùng lặp (Email Cooldown).'
      ),
      recommended_check: t(
        'Click "Acknowledge" or "Mark Resolved" to verify state transition and audit trail logging.',
        'Nhấn "Xác nhận (Acknowledge)" hoặc "Đánh dấu Đã xử lý (Mark Resolved)" để kiểm tra luồng chuyển trạng thái và nhật ký Audit Trail.'
      ),
      first_seen_at: createdIso,
      last_seen_at: createdIso,
      acknowledged_at: null,
      acknowledged_by: null,
      resolved_at: null,
      last_notified_at: createdIso,
      notification_count: 1,
      cooldown_minutes: settings.alert_cooldown_minutes,
      events: [
        {
          id: `evt-test-open-${Date.now()}`,
          alert_id: `alt-test-${Date.now()}`,
          event_type: 'opened',
          created_at: createdIso,
          actor: adminEmail || 'admin@example.com',
          summary: t(
            'Opened non-destructive test alert.',
            'Đã khởi tạo cảnh báo kiểm thử an toàn (Non-Destructive Test Alert).'
          ),
        },
        {
          id: `evt-test-mail-${Date.now() + 1}`,
          alert_id: `alt-test-${Date.now()}`,
          event_type: 'email_sent',
          created_at: createdIso,
          actor: 'Alert Email Engine',
          summary: t(
            `Dispatched test notification to ${settings.alert_recipient_emails.join(
              ', '
            )} (${settings.alert_cooldown_minutes}m cooldown active).`,
            `Đã gửi thông báo kiểm thử tới ${settings.alert_recipient_emails.join(
              ', '
            )} (Kích hoạt Cooldown ${settings.alert_cooldown_minutes} phút).`
          ),
        },
      ],
    };

    setSnapshot((prev) => ({
      ...prev,
      alerts: [newAlert, ...prev.alerts],
    }));
  };

  const handleUpdateSettings = (updated: MonitoringSettings) => {
    setSettings(updated);
    setSnapshot((prev) => ({
      ...prev,
      settings: updated,
    }));
  };

  const handleLogout = async () => {
    const client = getSupabaseClient();
    if (client && sessionMode === 'live') {
      await client.auth.signOut();
    }
    setSessionMode('unauthenticated');
  };

  if (sessionMode === 'unauthenticated') {
    return (
      <AuthGateView
        onEnterPrototypeMode={(email) => {
          setAdminEmail(email);
          setSessionMode('prototype');
        }}
        onAuthenticatedLive={(email) => {
          setAdminEmail(email);
          setSessionMode('live');
        }}
      />
    );
  }

  const openAlertsCount = snapshot.alerts.filter(
    (a) => a.status !== 'resolved'
  ).length;
  const activeNavObj = NAV_ITEMS.find((n) => n.id === activeTab);
  const activeTabLabel = activeNavObj
    ? t(activeNavObj.labelEn, activeNavObj.labelVi)
    : t('Overview', 'Tổng quan Hạ tầng');

  return (
    <div className="min-h-screen bg-[#F4F6F9] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Sidebar Navigation (Desktop 256px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            ARM64 Server Monitor
          </span>
        </div>

        <nav
          aria-label="Primary Sidebar Navigation"
          className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-[0_4px_12px_rgba(16,185,129,0.28)] font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{t(item.labelEn, item.labelVi)}</span>
                </span>
                {item.id === 'alerts' && openAlertsCount > 0 && (
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      isActive ? 'text-white' : 'text-amber-500'
                    }`}
                  >
                    {openAlertsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 space-y-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400 truncate font-mono">
            {adminEmail}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleToggleDarkMode}
              aria-label="Toggle color theme"
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  <span>{t('Light', 'Sáng')}</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>{t('Dark', 'Tối')}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('Sign Out', 'Đăng xuất')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-xs bg-white dark:bg-slate-900 h-full flex flex-col justify-between p-4 z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <span className="font-bold text-sm">ARM64 Server Monitor</span>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium ${
                        activeTab === item.id
                          ? 'bg-slate-900 text-white dark:bg-slate-800'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{t(item.labelEn, item.labelVi)}</span>
                      </span>
                      {item.id === 'alerts' && openAlertsCount > 0 && (
                        <span className="font-mono text-amber-500">
                          {openAlertsCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div className="flex justify-center">
                <LanguageSwitcher />
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDarkMode(!darkMode)}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700"
                >
                  {darkMode
                    ? t('Light Mode', 'Giao diện Sáng')
                    : t('Dark Mode', 'Giao diện Tối')}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700"
                >
                  {t('Sign Out', 'Đăng xuất')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* SaaS Top Bar Contract: Breadcrumb on Left, Language Switcher + Primary Action on Right */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
              <span>server-monitoring</span>
              <span className="mx-2" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {activeTabLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={handleManualRefresh}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-xs font-semibold text-white dark:text-slate-950 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('Refresh Telemetry', 'Làm mới Telemetry')}</span>
            </button>
          </div>
        </header>

        {/* Explicit Prototype / Simulation Mode Controls Bar */}
        {snapshot.is_mock_data && (
          <div className="bg-slate-100 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2.5">
            <div className="max-w-7xl mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <Activity className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                  {t(
                    '[PROTOTYPE MODE — LABELED MOCK DATA]',
                    '[CHẾ ĐỘ PROTOTYPE — DỮ LIỆU MÔ PHỎNG]'
                  )}
                </span>
                <span className="text-slate-600 dark:text-slate-400 hidden sm:inline">
                  {t(
                    'Simulate TV Box states & UI edge cases:',
                    'Giả lập các kịch bản sự cố TV Box & trạng thái giao diện:'
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Scenario Selector */}
                <div
                  role="group"
                  aria-label="Simulate telemetry scenario"
                  className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  {SCENARIO_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setScenario(opt.id);
                        setViewMode('populated');
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        scenario === opt.id && viewMode === 'populated'
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {t(opt.shortLabelEn, opt.shortLabelVi)}
                    </button>
                  ))}
                </div>

                {/* UI State Verification Selector (Populated / Loading / Empty / Error) */}
                <div
                  role="group"
                  aria-label="Simulate UI view state"
                  className="flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  {(
                    [
                      ['populated', 'Data', 'Dữ liệu'],
                      ['loading', 'Skeleton', 'Đang tải'],
                      ['empty', 'Empty', 'Trống'],
                      ['error', 'Query Error', 'Lỗi truy vấn'],
                    ] as const
                  ).map(([modeId, labelEn, labelVi]) => (
                    <button
                      key={modeId}
                      type="button"
                      onClick={() => setViewMode(modeId)}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        viewMode === modeId
                          ? 'bg-slate-900 dark:bg-slate-700 text-white'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {t(labelEn, labelVi)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Viewport */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
          {/* Selectable Dashboard Layout Switcher (Classic Technical vs Bento Telemetry Hub) */}
          <div className="mb-5 pb-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {t('Overview Interface Layout:', 'Chế độ Giao diện Tổng quan:')}
              </span>{' '}
              <span>
                {t(
                  'Both layouts share 100% identical Supabase PostgreSQL telemetry state.',
                  'Cả 2 giao diện dùng chung 100% nguồn dữ liệu thực từ Supabase PostgreSQL.'
                )}
              </span>
            </div>

            <div
              role="group"
              aria-label="Select dashboard layout style"
              className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 self-start sm:self-auto"
            >
              <button
                type="button"
                onClick={() => handleSelectOverviewLayout('bento')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  overviewLayout === 'bento' && activeTab === 'overview'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{t('Bento Hub View', 'Giao diện Bento Hub')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectOverviewLayout('classic')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  overviewLayout === 'classic' && activeTab === 'overview'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>{t('Classic Technical View', 'Giao diện Kỹ thuật Classic')}</span>
              </button>
            </div>
          </div>

          {liveError && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-200 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{liveError}</span>
              </div>
              <button
                type="button"
                onClick={handleManualRefresh}
                className="px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-white font-medium whitespace-nowrap shrink-0"
              >
                {t('Retry Query', 'Thử truy vấn lại')}
              </button>
            </div>
          )}

          {viewMode === 'loading' ? (
            <div
              aria-label="Loading telemetry skeleton"
              className="space-y-6 animate-pulse"
            >
              <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800/70" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-28 rounded-lg bg-slate-200 dark:bg-slate-800/70"
                  />
                ))}
              </div>
              <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-800/70" />
            </div>
          ) : viewMode === 'empty' ? (
            <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-12 text-center max-w-lg mx-auto my-8 space-y-3">
              <div className="text-base font-bold text-slate-900 dark:text-white">
                {t(
                  'No Telemetry Packets Recorded Yet (`Unknown` State)',
                  'Chưa Có Bản Tin Telemetry Nào Được Ghi Nhận (Trạng thái `Unknown`)'
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {t(
                  'Device `arm64-tvbox-01` is registered in `public.devices`, but no metric rows have arrived yet. Notice that the dashboard displays Unknown / Waiting rather than misleadingly showing 0% CPU or 0 MB RAM.',
                  'Thiết bị `arm64-tvbox-01` đã được đăng ký trong bảng `public.devices`, nhưng chưa có bản ghi metric nào được đẩy lên. Lưu ý hệ thống hiển thị rõ trạng thái Unknown / Đang chờ thay vì báo sai lệch 0% CPU hay 0 MB RAM.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setViewMode('populated')}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
              >
                {t('Restore Telemetry View', 'Khôi phục Chế độ Xem Telemetry')}
              </button>
            </div>
          ) : viewMode === 'error' ? (
            <div
              role="alert"
              className="border border-red-800/80 bg-red-950/30 rounded-xl p-8 max-w-xl mx-auto my-8 space-y-3"
            >
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>
                  {t(
                    'Supabase PostgreSQL Query / Network Error',
                    'Lỗi Truy vấn Supabase PostgreSQL / Mất Kết nối Mạng'
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-mono">
                {t(
                  'Error: PostgREST connection timeout or RLS policy rejected unauthenticated request (HTTP 401/403). Last cached state is preserved separately; raw metrics are not fabricated.',
                  'Lỗi: Quá thời gian chờ kết nối PostgREST (Timeout) hoặc chính sách RLS từ chối truy vấn chưa xác thực (HTTP 401/403). Trạng thái bộ nhớ đệm gần nhất được giữ riêng, không tự bịa số liệu ảo.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setViewMode('populated')}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                {t('Retry Connection', 'Thử Kết nối Lại')}
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'overview' &&
                (overviewLayout === 'bento' ? (
                  <BentoTelemetryHub
                    snapshot={snapshot}
                    nowMs={nowMs}
                    onNavigateTab={(tId) => setActiveTab(tId as DashboardTabId)}
                    onAcknowledgeAlert={handleAcknowledgeAlert}
                  />
                ) : (
                  <OverviewPage
                    snapshot={snapshot}
                    nowMs={nowMs}
                    onNavigateTab={(tId) => setActiveTab(tId as DashboardTabId)}
                    onAcknowledgeAlert={handleAcknowledgeAlert}
                  />
                ))}
              {activeTab === 'server' && (
                <ServerMetricsPage snapshot={snapshot} nowMs={nowMs} />
              )}
              {activeTab === 'containers' && (
                <DockerContainersPage snapshot={snapshot} />
              )}
              {activeTab === 'website' && (
                <WebsiteApiPage
                  snapshot={snapshot}
                  onRunManualExternalProbe={handleManualRefresh}
                />
              )}
              {activeTab === 'health' && <HealthChecksPage snapshot={snapshot} />}
              {activeTab === 'alerts' && (
                <AlertsIncidentsPage
                  snapshot={snapshot}
                  onAcknowledgeAlert={handleAcknowledgeAlert}
                  onResolveAlert={handleResolveAlert}
                  onTriggerTestAlert={handleTriggerTestAlert}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsAndDeployPage
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <DashboardShell />
    </LanguageProvider>
  );
}
