'use client';

import type { ChartType, ColumnType } from '@/types';

const CHART_TYPES: { key: ChartType; label: string; icon: string }[] = [
  { key: 'bar', label: 'Bar', icon: '▮' },
  { key: 'line', label: 'Line', icon: '╱' },
  { key: 'area', label: 'Area', icon: '▲' },
  { key: 'pie', label: 'Pie', icon: '◕' },
  { key: 'scatter', label: 'Scatter', icon: '⁘' },
];

type Props = {
  value: ChartType;
  onChange: (type: ChartType) => void;
};

export function ComposerChartTypeSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 rounded-lg border border-foreground/10 bg-foreground/3 p-1">
      {CHART_TYPES.map((ct) => {
        const isActive = value === ct.key;
        return (
          <button
            key={ct.key}
            type="button"
            onClick={() => onChange(ct.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground/45 hover:text-foreground/70'
            }`}
          >
            <span className="text-xs">{ct.icon}</span>
            {ct.label}
          </button>
        );
      })}
    </div>
  );
}

/** Type icon helper — reused by FieldList and DropZone chips */
export function typeIcon(type: ColumnType): string {
  switch (type) {
    case 'number':
      return '123';
    case 'date':
      return '📅';
    case 'boolean':
      return '✓';
    case 'category':
      return '◆';
    default:
      return 'T';
  }
}
