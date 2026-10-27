import React, { createContext, useContext, useState, useCallback } from 'react';
import { Languages } from 'lucide-react';
import type {
  AlertSeverity,
  ContainerRunState,
  SystemHealthStatus,
} from '../types/monitoring';

export type AppLanguage = 'en' | 'vi';

const LANG_STORAGE_KEY = 'server_monitoring_lang_v1';

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  toggleLang: () => void;
  /**
   * Returns exact domain-specific English or Vietnamese string based on active language.
   */
  t: (en: string, vi: string) => string;
  statusLabel: (status: SystemHealthStatus) => string;
  containerStateLabel: (state: ContainerRunState) => string;
  severityLabel: (severity: AlertSeverity) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    if (typeof window === 'undefined') return 'vi';
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'en' || saved === 'vi' ? saved : 'vi';
  });

  const setLang = useCallback((next: AppLanguage) => {
    setLangState(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'vi' ? 'en' : 'vi');
  }, [lang, setLang]);

  const t = useCallback(
    (en: string, vi: string) => (lang === 'vi' ? vi : en),
    [lang]
  );

  const statusLabel = useCallback(
    (status: SystemHealthStatus): string => {
      const map: Record<SystemHealthStatus, { en: string; vi: string }> = {
        healthy: { en: 'Healthy', vi: 'Ổn định' },
        warning: { en: 'Warning', vi: 'Cảnh báo' },
        critical: { en: 'Critical', vi: 'Nguy cấp' },
        stale: { en: 'Stale', vi: 'Trễ nhịp' },
        offline: { en: 'Offline', vi: 'Mất kết nối' },
        unknown: { en: 'Unknown', vi: 'Chưa rõ' },
      };
      const item = map[status] ?? map.unknown;
      return lang === 'vi' ? item.vi : item.en;
    },
    [lang]
  );

  const containerStateLabel = useCallback(
    (state: ContainerRunState): string => {
      const map: Record<ContainerRunState, { en: string; vi: string }> = {
        running: { en: 'Running', vi: 'Đang chạy (Running)' },
        restarting: { en: 'Restarting', vi: 'Đang khởi động lại' },
        paused: { en: 'Paused', vi: 'Tạm dừng (Paused)' },
        exited: { en: 'Exited', vi: 'Đã dừng (Exited)' },
        dead: { en: 'Dead', vi: 'Lỗi tiến trình (Dead)' },
        missing: { en: 'Missing', vi: 'Không tìm thấy' },
      };
      const item = map[state] ?? { en: state, vi: state };
      return lang === 'vi' ? item.vi : item.en;
    },
    [lang]
  );

  const severityLabel = useCallback(
    (severity: AlertSeverity): string => {
      if (severity === 'critical') {
        return lang === 'vi' ? 'Nghiêm trọng (Critical)' : 'Critical';
      }
      if (severity === 'warning') {
        return lang === 'vi' ? 'Cảnh báo (Warning)' : 'Warning';
      }
      return lang === 'vi' ? 'Thông tin (Info)' : 'Info';
    },
    [lang]
  );

  return (
    <LanguageContext.Provider
      value={{
        lang,
        setLang,
        toggleLang,
        t,
        statusLabel,
        containerStateLabel,
        severityLabel,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

/**
 * Segmented EN / VI language switcher button.
 */
export const LanguageSwitcher: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  const { lang, setLang } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language switcher (EN / VI)"
      className={`inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 text-xs font-mono ${className}`}
    >
      <span className="px-1.5 text-slate-400 flex items-center" aria-hidden="true">
        <Languages className="w-3.5 h-3.5" />
      </span>
      <button
        type="button"
        onClick={() => setLang('vi')}
        className={`px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
          lang === 'vi'
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        title="Tiếng Việt (Thuật ngữ SRE / Hạ tầng)"
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
          lang === 'en'
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        title="English (SRE / Infrastructure Terminology)"
      >
        EN
      </button>
    </div>
  );
};
