import React, { useState, useEffect, useCallback } from 'react';
import { GripVertical, RotateCcw, ArrowLeft, ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * Custom hook to manage and persist an ordered list of item IDs in localStorage.
 * Automatically reconciles if defaultIds ever gain or lose items.
 */
export function usePersistedOrder(storageKey: string, defaultIds: string[]) {
  const readStored = useCallback((): string[] => {
    if (typeof window === 'undefined') return defaultIds;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return defaultIds;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return defaultIds;
      const validStored = parsed.filter(
        (id): id is string => typeof id === 'string' && defaultIds.includes(id)
      );
      const missing = defaultIds.filter((id) => !validStored.includes(id));
      return [...validStored, ...missing];
    } catch {
      return defaultIds;
    }
  }, [storageKey, defaultIds]);

  const [order, setOrder] = useState<string[]>(readStored);

  useEffect(() => {
    setOrder(readStored());
  }, [readStored]);

  const updateOrder = useCallback(
    (nextOrder: string[]) => {
      setOrder(nextOrder);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(nextOrder));
        } catch {
          // Ignore storage quota errors
        }
      }
    },
    [storageKey]
  );

  const swapItems = useCallback(
    (sourceId: string, targetId: string) => {
      if (!sourceId || !targetId || sourceId === targetId) return;
      setOrder((prev) => {
        const srcIdx = prev.indexOf(sourceId);
        const tgtIdx = prev.indexOf(targetId);
        if (srcIdx === -1 || tgtIdx === -1) return prev;
        const next = [...prev];
        // Swap the two items directly so they exchange positions
        const temp = next[srcIdx];
        next[srcIdx] = next[tgtIdx];
        next[tgtIdx] = temp;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            // Ignore
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const moveByOffset = useCallback(
    (id: string, delta: -1 | 1) => {
      setOrder((prev) => {
        const idx = prev.indexOf(id);
        if (idx === -1) return prev;
        const targetIdx = idx + delta;
        if (targetIdx < 0 || targetIdx >= prev.length) return prev;
        const next = [...prev];
        const temp = next[idx];
        next[idx] = next[targetIdx];
        next[targetIdx] = temp;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            // Ignore
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const resetOrder = useCallback(() => {
    setOrder(defaultIds);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore
      }
    }
  }, [storageKey, defaultIds]);

  const isCustomized =
    order.length === defaultIds.length &&
    order.some((id, idx) => id !== defaultIds[idx]);

  return {
    order,
    updateOrder,
    swapItems,
    moveByOffset,
    resetOrder,
    isCustomized,
  };
}

interface SortableGridProps<T extends { id: string }> {
  items: T[];
  order: string[];
  onSwap: (sourceId: string, targetId: string) => void;
  onMoveByOffset?: (id: string, delta: -1 | 1) => void;
  gridClassName: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  itemClassName?: (item: T) => string;
}

/**
 * Interactive drag-and-drop sortable grid container.
 * Supports HTML5 drag-and-drop to swap cards plus quick left/right swap buttons on hover.
 */
export function SortableGrid<T extends { id: string }>({
  items,
  order,
  onSwap,
  onMoveByOffset,
  gridClassName,
  renderItem,
  itemClassName,
}: SortableGridProps<T>) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const itemMap = new Map<string, T>();
  items.forEach((it) => itemMap.set(it.id, it));

  const orderedItems: T[] = [];
  order.forEach((id) => {
    const found = itemMap.get(id);
    if (found) orderedItems.push(found);
  });
  items.forEach((it) => {
    if (!order.includes(it.id)) orderedItems.push(it);
  });

  const { t } = useLanguage();

  return (
    <div className={gridClassName}>
      {orderedItems.map((item, idx) => {
        const isDragging = draggedId === item.id;
        const isOver = dragOverId === item.id && draggedId !== item.id;
        const extraClass = itemClassName ? itemClassName(item) : '';

        return (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => {
              setDraggedId(item.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverId !== item.id) {
                setDragOverId(item.id);
              }
            }}
            onDragLeave={() => {
              if (dragOverId === item.id) {
                setDragOverId(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const srcId = draggedId || e.dataTransfer.getData('text/plain');
              if (srcId && srcId !== item.id) {
                onSwap(srcId, item.id);
              }
              setDraggedId(null);
              setDragOverId(null);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverId(null);
            }}
            className={`group relative transition-all duration-150 select-none ${
              isDragging
                ? 'opacity-50 scale-[0.98] ring-2 ring-emerald-500/60 rounded-xl'
                : ''
            } ${
              isOver
                ? 'ring-2 ring-emerald-500 bg-emerald-500/5 rounded-xl scale-[1.01]'
                : ''
            } ${extraClass}`}
          >
            {/* Floating Drag Handle & Quick Swap Controls (Top-Right Hover Bar) */}
            <div
              className="absolute top-2 right-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shadow-xs"
              title={t('Drag to swap card positions', 'Kéo thả để hoán đổi vị trí ô')}
            >
              {onMoveByOffset && idx > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveByOffset(item.id, -1);
                  }}
                  aria-label="Move card backward"
                  title={t('Swap left / previous', 'Hoán đổi sang trái / lên trước')}
                  className="p-0.5 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                </button>
              )}
              <span className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-emerald-500 p-0.5 flex items-center">
                <GripVertical className="w-3.5 h-3.5" />
              </span>
              {onMoveByOffset && idx < orderedItems.length - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveByOffset(item.id, 1);
                  }}
                  aria-label="Move card forward"
                  title={t('Swap right / next', 'Hoán đổi sang phải / xuống sau')}
                  className="p-0.5 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            {renderItem(item, idx)}
          </div>
        );
      })}
    </div>
  );
}

interface LayoutResetBarProps {
  isCustomized: boolean;
  onReset: () => void;
  label?: string;
}

/**
 * Toolbar strip showing drag-and-drop instructions and the "Reset to Default" button.
 */
export const LayoutCustomizationBar: React.FC<LayoutResetBarProps> = ({
  isCustomized,
  onReset,
  label,
}) => {
  const { t } = useLanguage();
  const displayLabel =
    label ??
    t(
      'Drag and drop metric cards or charts to swap positions (layout auto-saved).',
      'Kéo thả các ô thông số / biểu đồ để hoán đổi vị trí (tự động lưu bố cục).'
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/40 text-xs">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <GripVertical className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span>{displayLabel}</span>
        {isCustomized && (
          <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            {t('· Custom layout active', '· Đã tùy chỉnh vị trí')}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onReset}
        className={`px-3 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          isCustomized
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
            : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
      >
        <RotateCcw className="w-3 h-3" />
        <span>{t('Reset Default Layout', 'Quay về mặc định')}</span>
      </button>
    </div>
  );
};
