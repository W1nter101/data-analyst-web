'use client';

import { useCallback, useRef, useState } from 'react';

import { useAppStore } from '@/store/appStore';
import type { DashboardWidget } from '@/types';

type Props = {
  widget: DashboardWidget;
};

export function ImageWidget({ widget }: Props) {
  const updateWidget = useAppStore((s) => s.updateWidget);
  const removeWidget = useAppStore((s) => s.removeWidget);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hovered, setHovered] = useState(false);

  const handleReplace = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        updateWidget(widget.id, { imageUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [widget.id, updateWidget],
  );

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-xl border border-foreground/10 bg-background"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />

      {/* Drag handle */}
      <div className="chart-drag-handle flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-foreground/5 px-3 py-2 active:cursor-grabbing">
        <div className="flex items-center gap-2">
          <svg
            className="size-4 shrink-0 text-foreground/40"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="4" cy="3" r="1.5" />
            <circle cx="12" cy="3" r="1.5" />
            <circle cx="4" cy="8" r="1.5" />
            <circle cx="12" cy="8" r="1.5" />
            <circle cx="4" cy="13" r="1.5" />
            <circle cx="12" cy="13" r="1.5" />
          </svg>
          <span className="text-xs font-medium text-foreground/50">Image</span>
        </div>
        <div className="flex items-center gap-1">
          {widget.imageUrl && (
            <button
              type="button"
              onClick={handleReplace}
              className="rounded-md px-1.5 py-0.5 text-xs text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              Replace
            </button>
          )}
          <button
            type="button"
            onClick={() => removeWidget(widget.id)}
            className="rounded-md px-1.5 py-0.5 text-xs text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-red-500"
            aria-label="Remove image widget"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Image content */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {widget.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={widget.imageUrl}
            alt="Widget image"
            className="h-full w-full object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={handleReplace}
            className="flex flex-col items-center gap-2 text-foreground/40"
          >
            <svg className="size-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
            <span className="text-xs">Click to upload image</span>
          </button>
        )}
      </div>
    </div>
  );
}
