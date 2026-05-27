'use client';

import type { ColumnSchema } from '@/types';
import { typeIcon } from '@/components/composer/ComposerChartTypeSelector';

type Props = {
  columns: ColumnSchema[];
};

export function ComposerFieldList({ columns }: Props) {
  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    col: ColumnSchema,
  ) => {
    e.dataTransfer.setData('application/composer-field', JSON.stringify(col));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex flex-col gap-1">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
        Fields
      </h3>
      {columns.map((col) => (
        <div
          key={col.name}
          draggable
          onDragStart={(e) => handleDragStart(e, col)}
          className="flex cursor-grab items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-2)] active:cursor-grabbing"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-[var(--color-surface-2)] text-[10px] font-semibold text-[var(--color-text-muted)]">
            {typeIcon(col.type)}
          </span>
          <span className="min-w-0 truncate font-medium">{col.name}</span>
          <span className="ml-auto shrink-0 text-[10px] text-[var(--color-text-faint)]">
            {col.type}
          </span>
        </div>
      ))}
    </div>
  );
}
