import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Lock,
  LogIn,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import {
  getSupabaseClient,
  getSupabaseConfig,
  saveRuntimeSupabaseConfig,
  verifyAdminSession,
} from '../lib/supabaseClient';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';

interface AuthGateProps {
  onEnterPrototypeMode: (email: string) => void;
  onAuthenticatedLive: (email: string) => void;
}

export const AuthGateView: React.FC<AuthGateProps> = ({
  onEnterPrototypeMode,
  onAuthenticatedLive,
}) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentConfig = getSupabaseConfig();
  const [showConnConfig, setShowConnConfig] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState(currentConfig.url);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(currentConfig.anonKey);
  const [connMessage, setConnMessage] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const handleLiveLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setAuthError(
        t(
          'Please enter a valid administrator email address.',
          'Vui lòng nhập địa chỉ email quản trị viên (Administrator) hợp lệ.'
        )
      );
      return;
    }
    if (!password || password.length < 6) {
      setAuthError(
        t(
          'Password is required (minimum 6 characters).',
          'Vui lòng nhập mật khẩu (tối thiểu 6 ký tự).'
        )
      );
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setAuthError(
        t(
          'Supabase project is not configured yet. Configure your server-monitoring URL & Anon Key below, or use Prototype Mode to inspect the dashboard with labeled mock data.',
          'Dự án Supabase chưa được cấu hình. Hãy nhập URL & Anon Key bên dưới hoặc vào Chế độ Prototype (Dữ liệu mô phỏng) để kiểm thử.'
        )
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: signInErr } = await client.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInErr) {
        setAuthError(
          t(
            `Authentication failed: ${signInErr.message}`,
            `Xác thực thất bại (Auth Error): ${signInErr.message}`
          )
        );
        return;
      }

      const verification = await verifyAdminSession(client);
      if (!verification.isAdmin) {
        await client.auth.signOut();
        setAuthError(
          verification.error ??
            t(
              'Access denied: User is not registered in public.admin_users.',
              'Từ chối truy cập (RLS Denied): Tài khoản chưa được khai báo trong bảng public.admin_users.'
            )
        );
        return;
      }

      onAuthenticatedLive(verification.email ?? trimmedEmail);
    } catch (err: any) {
      setAuthError(
        err?.message ??
          t('Unexpected authentication error.', 'Lỗi xác thực không xác định.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConnMessage(null);
    const res = saveRuntimeSupabaseConfig(supabaseUrl, supabaseAnonKey);
    if (!res.ok) {
      setConnMessage({
        type: 'err',
        text: res.error ?? t('Invalid configuration', 'Cấu hình không hợp lệ'),
      });
      return;
    }
    setConnMessage({
      type: 'ok',
      text: t(
        'Saved public Supabase URL & Anon Key. You can now sign in with your admin account.',
        'Đã lưu Supabase URL & Public Anon Key. Bạn có thể đăng nhập bằng tài khoản Admin.'
      ),
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6">
      {/* Top Bar */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4 py-2 border-b border-slate-800/80">
        <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          ARM64 Server Monitoring
        </span>
        <div className="flex items-center gap-3">
          <div className="hidden md:block text-xs text-slate-400 font-mono whitespace-nowrap shrink-0">
            Target: https://app.example.com · ARM64 TV Box
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl w-full mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left column: Security architecture & access policy */}
        <section className="lg:col-span-6 border border-slate-800 rounded-xl p-6 bg-slate-900/50 flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs text-emerald-400 font-medium mb-3">
              <ShieldCheck className="w-4 h-4" />
              <span>
                {t(
                  'Zero-Trust Admin Access & RLS Enforcement',
                  'Kiến trúc Bảo mật Zero-Trust & Phân quyền RLS'
                )}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-3">
              {t(
                'Infrastructure & Container Telemetry Console',
                'Bảng Điều Khiển Giám Sát Hạ Tầng & Docker Containers'
              )}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              {t(
                'Dedicated monitoring console for the production stack (Nginx, Laravel API, Queue Worker, MariaDB 10.6, Redis 7, Next.js, and Cloudflare Tunnel) running on the Linux ARM64 TV Box.',
                'Hệ thống giám sát chuyên dụng (Observability & Telemetry) cho hạ tầng Production (Nginx, Laravel API, Queue Worker, MariaDB 10.6, Redis 7, Next.js và Cloudflare Tunnel) vận hành trên Linux ARM64 TV Box.'
              )}
            </p>

            <div className="space-y-3 text-xs text-slate-300 border-t border-slate-800 pt-4">
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-100">
                    {t(
                      'Strict Admin Whitelist (`public.admin_users`):',
                      'Danh sách trắng Quản trị viên (`public.admin_users`):'
                    )}
                  </span>{' '}
                  {t(
                    'Authenticated sessions are verified via PostgreSQL Row Level Security (`is_monitoring_admin()`). Unauthenticated users and non-admin accounts cannot query metrics.',
                    'Phiên đăng nhập được kiểm tra trực tiếp bởi PostgreSQL Row Level Security (`is_monitoring_admin()`). Người dùng chưa xác thực hoặc không nằm trong whitelist không thể truy vấn Telemetry.'
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Database className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-100">
                    {t(
                      'Isolated Monitoring Database:',
                      'Cơ sở dữ liệu Giám sát Cô lập (Isolated Schema):'
                    )}
                  </span>{' '}
                  {t(
                    'Connects exclusively to your monitoring Supabase project using the public `anon` key. Service-role keys are blocked in the browser.',
                    'Kết nối tới dự án Supabase thông qua khóa công khai `anon` key. Khóa đặc quyền `service_role` bị chặn tuyệt đối trên trình duyệt.'
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Prototype Mode Entry Box for Phase 2 Verification */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="text-xs font-medium text-amber-300 mb-1.5">
              {t(
                'Interactive Prototype & Scenario Simulator',
                'Chế độ Mô phỏng Tương tác & Kiểm thử Kịch bản Sự cố (Simulator)'
              )}
            </div>
            <p className="text-xs text-slate-400 mb-3">
              {t(
                'Inspect all 7 monitoring screens, test OOM/Stale/Offline/Sensor-N/A states, and review the complete Supabase SQL schema and Python 3 TV Box agent.',
                'Trải nghiệm toàn bộ 7 phân hệ giám sát, mô phỏng các kịch bản sự cố (OOM Kill, Mất tín hiệu Stale/Offline, Sensor N/A) với dữ liệu mẫu được gắn nhãn rõ ràng.'
              )}
            </p>
            <button
              type="button"
              onClick={() =>
                onEnterPrototypeMode(
                  (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim() ||
                    'admin@example.com'
                )
              }
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sliders className="w-4 h-4" />
              <span>
                {t(
                  'Enter Prototype Simulation Mode (Labeled Mock Data)',
                  'Vào Chế độ Mô phỏng Prototype (Dữ liệu Mẫu)'
                )}
              </span>
            </button>
          </div>
        </section>

        {/* Right column: Live Supabase Admin Sign-In */}
        <section className="lg:col-span-6 border border-slate-800 rounded-xl p-6 bg-slate-900/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-lg font-semibold text-white">
                {t(
                  'Administrator Sign In (Supabase Auth)',
                  'Đăng Nhập Quản Trị Viên (Supabase Auth)'
                )}
              </h2>
              <span className="text-xs font-mono text-slate-400">
                {currentConfig.source === 'unconfigured'
                  ? t('DB: Not Linked', 'DB: Chưa kết nối')
                  : `DB: ${currentConfig.source.toUpperCase()}`}
              </span>
            </div>

            <form onSubmit={handleLiveLogin} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="admin-email-input"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  {t('Administrator Email', 'Email Quản trị viên (Admin Email)')}
                </label>
                <input
                  id="admin-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim() ||
                    'admin@example.com'
                  }
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password-input"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  {t('Password', 'Mật khẩu (Password)')}
                </label>
                <input
                  id="admin-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {authError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-xs text-red-200 flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-white text-slate-950 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? t(
                        'Verifying Admin Session & RLS...',
                        'Đang xác thực phiên Admin & quyền RLS...'
                      )
                    : t(
                        'Sign In to Live Supabase Project',
                        'Đăng nhập vào Dự án Supabase Thực tế (Live)'
                      )}
                </span>
              </button>
            </form>
          </div>

          {/* Collapsible Public Supabase Connection Setup */}
          <div className="mt-6 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowConnConfig(!showConnConfig)}
              className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
            >
              {showConnConfig
                ? t(
                    'Hide Supabase Project Connection Settings',
                    'Ẩn cấu hình kết nối Supabase Endpoint'
                  )
                : t(
                    'Configure Supabase Project URL & Public Anon Key',
                    'Cấu hình Supabase Project URL & Public Anon Key'
                  )}
            </button>

            {showConnConfig && (
              <form onSubmit={handleSaveSupabaseConfig} className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="supabase-url-input"
                    className="block text-xs text-slate-400 mb-1"
                  >
                    Supabase Project URL (`VITE_SUPABASE_URL`)
                  </label>
                  <input
                    id="supabase-url-input"
                    type="url"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://xxxx.supabase.co"
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200"
                  />
                </div>
                <div>
                  <label
                    htmlFor="supabase-anon-input"
                    className="block text-xs text-slate-400 mb-1"
                  >
                    {t(
                      'Public Anon Key (`VITE_SUPABASE_ANON_KEY` — Never paste service_role)',
                      'Khóa công khai Anon Key (`VITE_SUPABASE_ANON_KEY` — Tuyệt đối không dán service_role)'
                    )}
                  </label>
                  <input
                    id="supabase-anon-input"
                    type="text"
                    value={supabaseAnonKey}
                    onChange={(e) => setSupabaseAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200"
                  />
                </div>
                {connMessage && (
                  <div
                    className={`text-xs p-2 rounded flex items-center gap-1.5 ${
                      connMessage.type === 'ok'
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                        : 'bg-red-950/60 text-red-300 border border-red-800'
                    }`}
                  >
                    {connMessage.type === 'ok' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{connMessage.text}</span>
                  </div>
                )}
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  {t('Save Connection Endpoint', 'Lưu Cấu hình Kết nối (Endpoint)')}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-xs text-slate-500 flex items-center justify-between py-2 border-t border-slate-900">
        <span>
          {t(
            'ARM64 Server Monitoring · Read-Only Non-Intrusive Architecture',
            'ARM64 Server Monitoring · Kiến trúc Giám sát Chỉ đọc (Read-Only Non-Intrusive)'
          )}
        </span>
        <span className="font-mono">
          {t(
            'No Inbound Ports · Outbound HTTPS 443 Only',
            'Không mở Port Inbound · Chỉ kết nối Outbound HTTPS 443'
          )}
        </span>
      </footer>
    </div>
  );
};
