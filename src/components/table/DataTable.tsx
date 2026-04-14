'use client';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { Fragment, useEffect, useMemo, useState } from 'react';

import { useCSVData } from '@/hooks/useCSVData';

type RowData = Record<string, string>;

function buildColumns(headers: string[]): ColumnDef<RowData>[] {
  return headers.map((header) => ({
    id: header,
    accessorFn: (row) => row[header] ?? '',
    header,
    enableSorting: true,
    filterFn: (row, columnId, filterValue) => {
      const raw = filterValue as string | undefined;
      if (raw == null || String(raw).trim() === '') return true;
      const cell = String(row.getValue(columnId) ?? '').toLowerCase();
      return cell.includes(String(raw).toLowerCase());
    },
  }));
}

function TableSkeleton({ columnCount }: { columnCount: number }) {
  const cols = Math.max(columnCount, 6);
  return (
    <div className="w-full overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <thead className="border-b border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/5">
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="min-w-[120px] px-3 py-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-black/10 dark:bg-white/15" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r} className="border-b border-black/5 last:border-0 dark:border-white/10">
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="min-w-[120px] px-3 py-2">
                    <div className="h-4 w-full max-w-40 animate-pulse rounded bg-black/10 dark:bg-white/10" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DataTable() {
  const { csv, isLoading } = useCSVData();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 100,
  });

  const columns = useMemo(
    () => (csv ? buildColumns(csv.headers) : []),
    [csv],
  );

  const data = useMemo(() => csv?.rows ?? [], [csv]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  useEffect(() => {
    setSorting([]);
    setColumnFilters([]);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [csv]);

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [columnFilters]);

  if (!csv && !isLoading) {
    return (
      <div
        className="flex min-h-[200px] w-full items-center justify-center rounded-xl border border-dashed border-black/15 bg-black/2 text-sm text-foreground/60 dark:border-white/20 dark:bg-white/4"
        role="status"
      >
        No data
      </div>
    );
  }

  if (isLoading) {
    return (
      <TableSkeleton columnCount={csv?.headers.length ?? 0} />
    );
  }

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = Math.max(table.getPageCount(), 1);
  const { pageIndex, pageSize } = table.getState().pagination;
  const rowsOnPage = table.getRowModel().rows.length;
  const start = filteredCount === 0 ? 0 : pageIndex * pageSize + 1;
  const end = pageIndex * pageSize + rowsOnPage;
  const totalInFile = csv!.rowCount;
  const isFiltered = filteredCount !== totalInFile;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-black/10 bg-background dark:border-white/15">
              {table.getHeaderGroups().map((headerGroup) => (
                <Fragment key={headerGroup.id}>
                  <tr>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="min-w-[120px] px-3 py-2 font-medium text-foreground"
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            className="inline-flex w-full items-center gap-1 text-left hover:underline"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getIsSorted() === 'asc' ? (
                              <span className="text-foreground/50" aria-hidden>
                                ▲
                              </span>
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <span className="text-foreground/50" aria-hidden>
                                ▼
                              </span>
                            ) : null}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={`${header.id}-filter`}
                        className="min-w-[120px] px-3 pb-2 pt-0"
                      >
                        <label className="sr-only" htmlFor={`filter-${header.id}`}>
                          Filter {String(header.column.columnDef.header)}
                        </label>
                        <input
                          id={`filter-${header.id}`}
                          type="search"
                          value={(header.column.getFilterValue() as string) ?? ''}
                          onChange={(e) =>
                            header.column.setFilterValue(e.target.value)
                          }
                          placeholder="Filter…"
                          className="w-full min-w-[120px] rounded-md border border-black/15 bg-background px-2 py-1 text-xs text-foreground placeholder:text-foreground/40 focus:border-black/30 focus:outline-none dark:border-white/20 dark:focus:border-white/40"
                        />
                      </th>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={csv!.headers.length || 1}
                    className="px-3 py-8 text-center text-foreground/60"
                  >
                    No rows match the current filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/10"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="min-w-[120px] max-w-[320px] truncate px-3 py-2 align-top text-foreground/90"
                        title={String(cell.getValue() ?? '')}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-xs text-foreground/70 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p>
          <span className="font-medium text-foreground/80">Total rows:</span>{' '}
          {totalInFile.toLocaleString()}
          {isFiltered ? (
            <>
              {' '}
              <span className="text-foreground/50">·</span>{' '}
              <span className="font-medium text-foreground/80">
                After filter:
              </span>{' '}
              {filteredCount.toLocaleString()}
            </>
          ) : null}
        </p>
        <p>
          <span className="font-medium text-foreground/80">Page</span>{' '}
          {pageIndex + 1} of {pageCount}
          <span className="text-foreground/50"> · </span>
          <span className="font-medium text-foreground/80">Showing</span>{' '}
          {start}–{end}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded-md border border-black/15 px-2 py-1 text-foreground transition-colors enabled:hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:enabled:hover:bg-white/10"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded-md border border-black/15 px-2 py-1 text-foreground transition-colors enabled:hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:enabled:hover:bg-white/10"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
