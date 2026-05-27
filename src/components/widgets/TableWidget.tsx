'use client';

import { useCallback, useState } from 'react';

import { useAppStore } from '@/store/appStore';
import type { DashboardWidget } from '@/types';

type Props = {
  widget: DashboardWidget;
};

export function TableWidget({ widget }: Props) {
  const updateWidget = useAppStore((s) => s.updateWidget);
  const removeWidget = useAppStore((s) => s.removeWidget);
  
  const initialData = widget.tableData ?? {
    title: 'Untitled',
    rows: 3,
    cols: 3,
    cells: Array(3).fill(Array(3).fill('')),
  };

  const [title, setTitle] = useState(initialData.title);
  const [cells, setCells] = useState(initialData.cells);

  const saveToStore = useCallback(
    (newTitle: string, newCells: string[][]) => {
      updateWidget(widget.id, {
        tableData: {
          ...initialData,
          title: newTitle,
          cells: newCells,
        },
      });
    },
    [widget.id, updateWidget, initialData]
  );

  const handleTitleBlur = () => {
    saveToStore(title, cells);
  };

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const newCells = cells.map((row, r) =>
      r === rowIndex ? row.map((cell: string, c: number) => (c === colIndex ? value : cell)) : row
    );
    setCells(newCells);
    saveToStore(title, newCells);
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-[var(--color-accent)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
      {/* Drag handle header */}
      <div className="chart-drag-handle relative flex shrink-0 cursor-grab items-center justify-between px-3 py-1.5 bg-[var(--color-accent)] text-[var(--color-bg)] active:cursor-grabbing">
        <div className="flex items-center gap-1.5 z-10 bg-[var(--color-accent)] rounded-sm pr-2">
          <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12c-.621 0-1.125.504-1.125 1.125M12 10.875c-.621 0-1.125.504-1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 1.5c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125" />
          </svg>
          <span className="text-xs font-semibold">{title || 'Table'}</span>
        </div>
        
        {/* drag dots centered absolutely */}
        <div className="no-print absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg
              className="size-4 shrink-0"
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
        </div>

        <button
          type="button"
          onClick={() => removeWidget(widget.id)}
          className="no-print z-10 rounded px-1 text-xs text-[var(--color-bg)] transition-colors hover:bg-black/20"
          aria-label="Remove table widget"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4 bg-[var(--color-bg)]">
        <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="w-full text-2xl font-medium bg-transparent outline-none placeholder:text-[var(--color-text-faint)] text-[var(--color-text-muted)] border-b border-transparent focus:border-[var(--color-border)] px-1"
            placeholder="Untitled"
        />

        <div className="flex-1 overflow-auto min-h-0 border border-[var(--color-border)] rounded-sm bg-[var(--color-surface)]">
            <table className="w-full border-collapse">
                <tbody>
                    {cells.map((row: string[], rowIndex: number) => (
                        <tr key={rowIndex}>
                            {row.map((cell: string, colIndex: number) => (
                                <td key={colIndex} className="border border-[var(--color-border)] p-0 m-0">
                                    <input 
                                        type="text"
                                        value={cell}
                                        onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                                        className="w-full bg-transparent px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:bg-[var(--color-surface-2)] transition-colors"
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
