import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  WifiOff,
  XCircle,
} from 'lucide-react';
import type {
  AlertSeverity,
  ContainerRunState,
  SystemHealthStatus,
} from '../types/monitoring';
import { useLanguage } from '../i18n/LanguageContext';

interface StatusIndicatorProps {
  status: SystemHealthStatus;
  customLabel?: string;
  size?: 'sm' | 'md';
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  customLabel,
  size = 'sm',
}) => {
  const { statusLabel } = useLanguage();

  const config: Record<
    SystemHealthStatus,
    {
      icon: React.FC<{ className?: string }>;
      textClass: string;
    }
  > = {
    healthy: {
      icon: CheckCircle2,
      textClass: 'text-emerald-600 dark:text-emerald-400',
    },
    warning: {
      icon: AlertTriangle,
      textClass: 'text-amber-600 dark:text-amber-400',
    },
    critical: {
      icon: XCircle,
      textClass: 'text-red-600 dark:text-red-400',
    },
    stale: {
      icon: Clock,
      textClass: 'text-amber-600 dark:text-amber-300',
    },
    offline: {
      icon: WifiOff,
      textClass: 'text-red-600 dark:text-red-400',
    },
    unknown: {
      icon: HelpCircle,
      textClass: 'text-slate-500 dark:text-slate-400',
    },
  };

  const current = config[status] || config.unknown;
  const Icon = current.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium whitespace-nowrap shrink-0 ${
        size === 'md' ? 'text-sm' : 'text-xs'
      } ${current.textClass}`}
    >
      <Icon
        className={size === 'md' ? 'w-4 h-4 shrink-0' : 'w-3.5 h-3.5 shrink-0'}
      />
      <span>{customLabel ?? statusLabel(status)}</span>
    </span>
  );
};

export const ContainerStateIndicator: React.FC<{ state: ContainerRunState }> = ({
  state,
}) => {
  const { containerStateLabel } = useLanguage();
  const map: Record<ContainerRunState, SystemHealthStatus> = {
    running: 'healthy',
    restarting: 'warning',
    paused: 'warning',
    exited: 'critical',
    dead: 'critical',
    missing: 'critical',
  };
  const status = map[state] ?? 'unknown';
  return (
    <StatusIndicator status={status} customLabel={containerStateLabel(state)} />
  );
};

export const SeverityIndicator: React.FC<{ severity: AlertSeverity }> = ({
  severity,
}) => {
  const { severityLabel } = useLanguage();
  if (severity === 'critical') {
    return (
      <StatusIndicator status="critical" customLabel={severityLabel(severity)} />
    );
  }
  if (severity === 'warning') {
    return (
      <StatusIndicator status="warning" customLabel={severityLabel(severity)} />
    );
  }
  return (
    <StatusIndicator status="unknown" customLabel={severityLabel(severity)} />
  );
};

interface RadialGaugeProps {
  label: string;
  value: number | null | undefined;
  max?: number;
  unit?: string;
  subtitle: string;
  status: SystemHealthStatus;
  nullText?: string;
}

/**
 * Semi-circular SVG Radial Gauge Chart for hardware metrics (CPU, RAM, Swap, Temp, Disk).
 * Explicitly handles null/undefined without drawing fake 0% arcs.
 */
export const RadialGaugeChart: React.FC<RadialGaugeProps> = ({
  label,
  value,
  max = 100,
  unit = '%',
  subtitle,
  status,
  nullText = 'N/A',
}) => {
  const numVal =
    value === null || value === undefined ? NaN : Number(value);
  const isNull = Number.isNaN(numVal) || !Number.isFinite(numVal);
  const clampedRatio = isNull
    ? 0
    : Math.min(1, Math.max(0, numVal / Math.max(1, max)));

  const strokeColor =
    status === 'critical' || status === 'offline'
      ? '#ef4444'
      : status === 'warning' || status === 'stale'
      ? '#f59e0b'
      : status === 'unknown' || isNull
      ? '#64748b'
      : '#10b981';

  const radius = 44;
  const circumference = Math.PI * radius; // Semi-circle arc length
  const dashOffset = circumference * (1 - clampedRatio);

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900/70 flex flex-col items-center justify-between text-center">
      <div className="w-full flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
          {label}
        </span>
        <StatusIndicator status={status} />
      </div>

      <div className="relative w-32 h-20 flex items-end justify-center my-1">
        <svg viewBox="0 0 110 62" className="w-full h-full overflow-visible">
          {/* Background track arc */}
          <path
            d="M 11 54 A 44 44 0 0 1 99 54"
            fill="none"
            stroke="currentColor"
            className="text-slate-200 dark:text-slate-800"
            strokeWidth="9"
            strokeLinecap="round"
          />
          {/* Value arc */}
          {!isNull && (
            <path
              d="M 11 54 A 44 44 0 0 1 99 54"
              fill="none"
              stroke={strokeColor}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          )}
        </svg>
        <div className="absolute bottom-0 inset-x-0 text-center font-mono tabular-nums">
          <span className="text-base font-bold text-slate-900 dark:text-white">
            {isNull
              ? nullText
              : `${Number.isInteger(numVal) ? numVal : numVal.toFixed(1)}${unit}`}
          </span>
        </div>
      </div>

      <div className="w-full pt-2 mt-1 border-t border-slate-100 dark:border-slate-800/80 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
        {subtitle}
      </div>
    </div>
  );
};

interface MiniSparklineProps {
  values: (number | null | undefined)[];
  colorHex?: string;
}

/**
 * Compact inline SVG sparkline for KPI cards.
 */
export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  values,
  colorHex = '#10b981',
}) => {
  const valid = values.filter(
    (v): v is number => v !== null && v !== undefined && !Number.isNaN(v)
  );
  if (valid.length === 0) {
    return null;
  }
  const minVal = Math.min(...valid);
  const maxVal = Math.max(...valid, minVal + 1);
  const w = 76;
  const h = 22;

  const pts: string[] = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(v)) return;
    const x = values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - 3 - ((v - minVal) / (maxVal - minVal)) * (h - 6);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-20 h-5 shrink-0 overflow-visible"
      aria-hidden="true"
    >
      {pts.length === 1 ? (
        <circle
          cx={w / 2}
          cy={h / 2}
          r="3"
          fill={colorHex}
        />
      ) : (
        <polyline
          fill="none"
          stroke={colorHex}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pts.join(' ')}
        />
      )}
    </svg>
  );
};

interface TelemetryLineChartProps {
  title: string;
  subtitle: string;
  data: { label: string; value: number | null; secondaryValue?: number | null }[];
  unit: string;
  maxDomain?: number;
  warnThreshold?: number;
  criticalThreshold?: number;
  colorHex?: string;
  secondaryColorHex?: string;
  secondaryLabel?: string;
  isStale?: boolean;
  variant?: 'default' | 'bento';
}

export const TelemetryLineChart: React.FC<TelemetryLineChartProps> = ({
  title,
  subtitle,
  data,
  unit,
  maxDomain,
  warnThreshold,
  criticalThreshold,
  colorHex = '#10b981',
  secondaryColorHex = '#38bdf8',
  secondaryLabel,
  isStale = false,
  variant = 'default',
}) => {
  const { t } = useLanguage();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const validValues = data
    .map((d) => d.value)
    .filter((v): v is number => v !== null && !Number.isNaN(v));
  const validSecondary = data
    .map((d) => d.secondaryValue)
    .filter(
      (v): v is number => v !== null && v !== undefined && !Number.isNaN(v)
    );

  const hasValidData = validValues.length > 0;
  const minStat = hasValidData ? Math.min(...validValues) : null;
  const maxStat = hasValidData ? Math.max(...validValues) : null;
  const avgStat = hasValidData
    ? validValues.reduce((acc, v) => acc + v, 0) / validValues.length
    : null;

  const computedMax =
    maxDomain ??
    Math.max(
      10,
      ...validValues,
      ...validSecondary,
      warnThreshold ?? 0,
      criticalThreshold ?? 0
    ) * 1.15;

  const width = 560;
  const height = 172;
  const padLeft = 40;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const baselineY = padTop + plotH;

  const getX = (idx: number) =>
    padLeft + (data.length <= 1 ? plotW / 2 : (idx / (data.length - 1)) * plotW);
  const getY = (val: number) =>
    padTop + plotH - Math.min(1, Math.max(0, val / computedMax)) * plotH;

  const buildSegments = (
    accessor: (item: (typeof data)[0]) => number | null | undefined
  ) => {
    const lineSegments: string[] = [];
    const areaSegments: string[] = [];
    let currentPts: { x: number; y: number }[] = [];

    const flush = () => {
      if (currentPts.length > 0) {
        const linePath = currentPts
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          .join(' ');
        lineSegments.push(linePath);
        if (currentPts.length >= 2) {
          const first = currentPts[0];
          const last = currentPts[currentPts.length - 1];
          areaSegments.push(
            `${linePath} L${last.x.toFixed(1)},${baselineY.toFixed(1)} L${first.x.toFixed(
              1
            )},${baselineY.toFixed(1)} Z`
          );
        }
        currentPts = [];
      }
    };

    data.forEach((pt, idx) => {
      const v = accessor(pt);
      if (v === null || v === undefined || Number.isNaN(v)) {
        flush();
      } else {
        currentPts.push({ x: getX(idx), y: getY(v) });
      }
    });
    flush();

    return { lineSegments, areaSegments };
  };

  const primary = buildSegments((d) => d.value);
  const secondary = secondaryLabel
    ? buildSegments((d) => d.secondaryValue)
    : { lineSegments: [], areaSegments: [] };

  const activePoint =
    hoverIndex !== null && data[hoverIndex]
      ? data[hoverIndex]
      : data[data.length - 1];

  const gradId = `area-grad-${title.replace(/[^a-zA-Z0-9]/g, '')}`;

  const wrapperClass =
    variant === 'bento'
      ? 'rounded-2xl p-4 bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.03)]'
      : 'border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900/70';

  return (
    <div className={wrapperClass}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {subtitle}
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          {activePoint ? (
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {activePoint.value !== null && activePoint.value !== undefined
                ? `${activePoint.value}${unit}`
                : t('N/A (Unsupported)', 'N/A (Không hỗ trợ)')}
              {secondaryLabel &&
                activePoint.secondaryValue !== null &&
                activePoint.secondaryValue !== undefined && (
                  <span className="text-xs text-sky-400 ml-2">
                    / {activePoint.secondaryValue}
                    {unit}
                  </span>
                )}
            </div>
          ) : (
            <div className="text-xs text-slate-400">{t('No data', 'Chưa có mẫu đo')}</div>
          )}
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {activePoint ? `${activePoint.label} UTC` : ''}
            {isStale ? ` · ${t('Stale', 'Trễ nhịp')}` : ''}
          </div>
        </div>
      </div>

      {/* Min / Avg / Max Statistical Strip */}
      {hasValidData && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mb-2 pb-2 border-b border-slate-100 dark:border-slate-800/70">
          <span className="whitespace-nowrap">
            Min:{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {minStat?.toFixed(1)}
              {unit}
            </strong>
          </span>
          <span>·</span>
          <span className="whitespace-nowrap">
            {t('Avg:', 'TB:')}{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {avgStat?.toFixed(1)}
              {unit}
            </strong>
          </span>
          <span>·</span>
          <span className="whitespace-nowrap">
            {t('Peak:', 'Đỉnh:')}{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {maxStat?.toFixed(1)}
              {unit}
            </strong>
          </span>
          <span>·</span>
          <span className="whitespace-nowrap">
            {t('Samples:', 'Mẫu:')} {validValues.length}
          </span>
        </div>
      )}

      {!hasValidData ? (
        <div className="h-36 flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded text-xs text-slate-500 dark:text-slate-400">
          <span>
            {t(
              'Sensor unsupported or no numeric samples recorded in range',
              'Cảm biến phần cứng không hỗ trợ hoặc chưa có mẫu đo trong chu kỳ'
            )}
          </span>
          <span className="font-mono mt-1">
            {t(
              'Value = null (Not substituted with 0)',
              'Giá trị = null (Không giả lập bằng số 0)'
            )}
          </span>
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-40 overflow-visible select-none"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorHex} stopOpacity="0.28" />
                <stop offset="100%" stopColor={colorHex} stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id={`${gradId}-sec`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={secondaryColorHex} stopOpacity="0.16" />
                <stop offset="100%" stopColor={secondaryColorHex} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal grid lines */}
            {[0, 0.5, 1].map((ratio) => {
              const y = padTop + plotH * (1 - ratio);
              const valLabel = Math.round(computedMax * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="text-[10px] fill-slate-400 font-mono"
                  >
                    {valLabel}
                  </text>
                </g>
              );
            })}

            {/* Warning threshold line */}
            {warnThreshold !== undefined && warnThreshold <= computedMax && (
              <line
                x1={padLeft}
                y1={getY(warnThreshold)}
                x2={width - padRight}
                y2={getY(warnThreshold)}
                stroke="#d97706"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            )}

            {/* Critical threshold line */}
            {criticalThreshold !== undefined &&
              criticalThreshold <= computedMax && (
                <line
                  x1={padLeft}
                  y1={getY(criticalThreshold)}
                  x2={width - padRight}
                  y2={getY(criticalThreshold)}
                  stroke="#dc2626"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              )}

            {/* Area fill under primary line */}
            {primary.areaSegments.map((seg, i) => (
              <path key={`area-${i}`} d={seg} fill={`url(#${gradId})`} />
            ))}

            {/* Area fill under secondary line */}
            {secondary.areaSegments.map((seg, i) => (
              <path key={`sec-area-${i}`} d={seg} fill={`url(#${gradId}-sec)`} />
            ))}

            {/* Secondary line */}
            {secondary.lineSegments.map((seg, i) => (
              <path
                key={`sec-${i}`}
                d={seg}
                fill="none"
                stroke={secondaryColorHex}
                strokeWidth="1.75"
                strokeDasharray="4 3"
                strokeOpacity={isStale ? 0.45 : 0.9}
              />
            ))}

            {/* Primary line */}
            {primary.lineSegments.map((seg, i) => (
              <path
                key={`pri-${i}`}
                d={seg}
                fill="none"
                stroke={colorHex}
                strokeWidth="2.2"
                strokeOpacity={isStale ? 0.5 : 1}
              />
            ))}

            {/* Data point circles (ensures single-point live data or hovered points are clearly visible) */}
            {data.map((pt, idx) => {
              if (pt.value === null || pt.value === undefined) return null;
              const showDot =
                data.length <= 12 ||
                idx === data.length - 1 ||
                hoverIndex === idx;
              if (!showDot) return null;
              return (
                <circle
                  key={`dot-${idx}`}
                  cx={getX(idx)}
                  cy={getY(pt.value)}
                  r={hoverIndex === idx || data.length === 1 ? 4 : 2.5}
                  fill={colorHex}
                  stroke="#0f172a"
                  strokeWidth="1.2"
                />
              );
            })}

            {/* X-axis timestamps */}
            {data.map((pt, idx) => {
              if (
                data.length > 6 &&
                idx % Math.max(1, Math.floor(data.length / 4)) !== 0 &&
                idx !== data.length - 1
              ) {
                return null;
              }
              return (
                <text
                  key={pt.label + idx}
                  x={getX(idx)}
                  y={height - 6}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-400 font-mono"
                >
                  {pt.label}
                </text>
              );
            })}

            {/* Hover vertical cursor */}
            {hoverIndex !== null && data[hoverIndex] && (
              <line
                x1={getX(hoverIndex)}
                y1={padTop}
                x2={getX(hoverIndex)}
                y2={padTop + plotH}
                stroke="currentColor"
                className="text-slate-400 dark:text-slate-600"
                strokeWidth="1"
              />
            )}

            {/* Invisible hover hit columns */}
            {data.map((_, idx) => {
              const colW = plotW / Math.max(1, data.length);
              return (
                <rect
                  key={idx}
                  x={getX(idx) - colW / 2}
                  y={padTop}
                  width={colW}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
};
