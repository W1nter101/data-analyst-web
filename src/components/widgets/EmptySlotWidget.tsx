'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAppStore } from '@/store/appStore';

type Props = {
  widgetId: string;
};

export function EmptySlotWidget({ widgetId }: Props) {
  const router = useRouter();
  const updateWidget = useAppStore((s) => s.updateWidget);
  const removeWidget = useAppStore((s) => s.removeWidget);
  const setPendingChartSlotId = useAppStore((s) => s.setPendingChartSlotId);

  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleText = useCallback(() => {
    setMenuOpen(false);
    updateWidget(widgetId, { widgetType: 'text', textContent: '' });
  }, [widgetId, updateWidget]);

  const handleImage = useCallback(() => {
    setMenuOpen(false);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        updateWidget(widgetId, {
          widgetType: 'image',
          imageUrl: reader.result as string,
        });
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [widgetId, updateWidget],
  );

  const handleChart = useCallback(() => {
    setMenuOpen(false);
    setPendingChartSlotId(widgetId);
    router.push('/visual-board-chart-composer');
  }, [widgetId, setPendingChartSlotId, router]);

  const handleRemove = useCallback(() => {
    setMenuOpen(false);
    removeWidget(widgetId);
  }, [widgetId, removeWidget]);

  return (
    <div
      className="relative flex h-full items-center justify-center rounded-xl border-2 border-dashed border-foreground/10 bg-foreground/[0.02] transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (!menuOpen) setMenuOpen(false);
      }}
    >
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />

      {/* "+" button — visible on hover */}
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className={`flex size-10 items-center justify-center rounded-full bg-foreground/8 text-foreground/40 transition-all hover:bg-foreground/15 hover:text-foreground/70 ${
          hovered || menuOpen ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
        }`}
        aria-label="Add widget"
      >
        <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {/* Popup toolbar */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute z-30 flex items-center gap-1 rounded-full border border-foreground/10 bg-background px-2 py-1.5 shadow-lg"
        >
          {/* Text */}
          <button
            type="button"
            onClick={handleText}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-foreground/5"
            title="Text"
          >
            <svg className="size-5 text-foreground/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12M2.36 12.76c.11-.2.28-.38.48-.5l7.5-4.49a1.32 1.32 0 0 1 1.32 0l7.5 4.49c.2.12.37.3.48.5" />
            </svg>
            <span className="text-[9px] font-medium text-foreground/45">Text</span>
          </button>

          {/* Image */}
          <button
            type="button"
            onClick={handleImage}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-foreground/5"
            title="Image"
          >
            <svg className="size-5 text-foreground/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
            <span className="text-[9px] font-medium text-foreground/45">Image</span>
          </button>

          {/* Chart */}
          <button
            type="button"
            onClick={handleChart}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-foreground/5"
            title="Chart"
          >
            <svg className="size-5 text-foreground/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            <span className="text-[9px] font-medium text-foreground/45">Chart</span>
          </button>

          {/* Table */}
          <button
            type="button"
            onClick={handleChart}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-foreground/5"
            title="Table"
          >
            <svg className="size-5 text-foreground/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12c-.621 0-1.125.504-1.125 1.125M12 10.875c-.621 0-1.125.504-1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 1.5c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125" />
            </svg>
            <span className="text-[9px] font-medium text-foreground/45">Table</span>
          </button>

          {/* Divider */}
          <div className="mx-1 h-8 w-px bg-foreground/10" />

          {/* Remove */}
          <button
            type="button"
            onClick={handleRemove}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
            title="Remove"
          >
            <svg className="size-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            <span className="text-[9px] font-medium text-red-500/70">Remove</span>
          </button>
        </div>
      )}
    </div>
  );
}
