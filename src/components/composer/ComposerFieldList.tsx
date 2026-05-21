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
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/45">
        Fields
      </h3>
      {columns.map((col) => (
        <div
          key={col.name}
          draggable
          onDragStart={(e) => handleDragStart(e, col)}
          className="flex cursor-grab items-center gap-2 rounded-lg border border-foreground/8 bg-foreground/3 px-3 py-2 text-sm text-foreground transition-colors hover:border-foreground/15 hover:bg-foreground/6 active:cursor-grabbing"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-foreground/8 text-[10px] font-semibold text-foreground/50">
            {typeIcon(col.type)}
          </span>
          <span className="min-w-0 truncate font-medium">{col.name}</span>
          <span className="ml-auto shrink-0 text-[10px] text-foreground/35">
            {col.type}
          </span>
        </div>
      ))}
    </div>
  );
}
