'use client';

import { useCallback, useRef, useState } from 'react';

import { useAppStore } from '@/store/appStore';
import type { DashboardWidget } from '@/types';

type Props = {
  widget: DashboardWidget;
};

export function TextWidget({ widget }: Props) {
  const updateWidget = useAppStore((s) => s.updateWidget);
  const removeWidget = useAppStore((s) => s.removeWidget);
  const [text, setText] = useState(widget.textContent ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleBlur = useCallback(() => {
    updateWidget(widget.id, { textContent: text });
  }, [widget.id, text, updateWidget]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Drag handle */}
      <div className="chart-drag-handle flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2 active:cursor-grabbing">
        <div className="flex items-center gap-2">
          <svg
            className="no-print size-4 shrink-0 text-[var(--color-text-faint)]"
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
          <span className="text-xs font-medium text-[var(--color-text-muted)]">Text</span>
        </div>
        <button
          type="button"
          onClick={() => removeWidget(widget.id)}
          className="no-print rounded-md px-1.5 py-0.5 text-xs text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-error)]"
          aria-label="Remove text widget"
        >
          ✕
        </button>
      </div>

      {/* Editable content */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder="Click to edit text..."
        className="h-full w-full min-h-0 flex-1 resize-none rounded-b-xl bg-transparent p-3 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)] focus:ring-1 focus:ring-[var(--color-accent)]"
      />
    </div>
  );
}
