'use client';

import { useState } from 'react';
import type { ColumnSchema } from '@/types';
import { typeIcon } from '@/components/composer/ComposerChartTypeSelector';

type Props = {
  label: string;
  field: ColumnSchema | null;
  onDrop: (col: ColumnSchema) => void;
  onRemove: () => void;
};

export function ComposerDropZone({ label, field, onDrop, onRemove }: Props) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData('application/composer-field');
    if (!raw) return;
    try {
      const col = JSON.parse(raw) as ColumnSchema;
      onDrop(col);
    } catch {
      // Ignore invalid data
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-right text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </span>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex min-h-[40px] flex-1 items-center rounded-lg border-2 border-dashed px-3 py-1.5 transition-colors ${
          dragOver
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
            : field
              ? 'border-[var(--color-border)] bg-[var(--color-surface)]'
              : 'border-[var(--color-border)] bg-transparent'
        }`}
      >
        {field ? (
          <div className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--color-surface-2)] text-[10px] font-semibold text-[var(--color-text-muted)]">
              {typeIcon(field.type)}
            </span>
            <span className="text-sm font-medium text-[var(--color-text)]">
              {field.name}
            </span>
            <button
              type="button"
              onClick={onRemove}
              className="ml-1 flex size-5 items-center justify-center rounded-full text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-label={`Remove ${field.name}`}
            >
              ×
            </button>
          </div>
        ) : (
          <span className="text-xs text-[var(--color-text-faint)]">
            {dragOver ? 'Thả trường vào đây' : 'Kéo trường vào đây'}
          </span>
        )}
      </div>
    </div>
  );
}
