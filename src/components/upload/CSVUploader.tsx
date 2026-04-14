'use client';

import { useCallback, useRef, useState } from 'react';

import { useCSVData } from '@/hooks/useCSVData';
import { useAppStore } from '@/store/appStore';

const MAX_WARN_BYTES = 50 * 1024 * 1024;

function isCsvFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) return true;
  const t = file.type.toLowerCase();
  return t === 'text/csv' || t === 'application/vnd.ms-excel';
}

export function CSVUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { csv, isLoading, error, uploadFile, clearData } = useCSVData();
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState(false);

  const displayError = error ?? localError;

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setLocalError(null);
      if (!isCsvFile(file)) {
        setSizeWarning(false);
        setLocalError('Please choose a .csv file.');
        return;
      }
      setSizeWarning(file.size > MAX_WARN_BYTES);
      await uploadFile(file);
      const { error: storeError } = useAppStore.getState();
      if (!storeError) {
        setLastFileName(file.name);
      }
    },
    [uploadFile],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      void handleFile(file);
      e.target.value = '';
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      void handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onRetry = useCallback(() => {
    clearData();
    setLocalError(null);
    setSizeWarning(false);
    setLastFileName(null);
  }, [clearData]);

  const onChangeFile = useCallback(() => {
    clearData();
    setLocalError(null);
    setSizeWarning(false);
    setLastFileName(null);
    openPicker();
  }, [clearData, openPicker]);

  const showSuccess = Boolean(csv && !isLoading && !displayError);

  return (
    <div className="w-full max-w-xl">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label="Upload CSV file"
        onChange={onInputChange}
      />

      {isLoading ? (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-black/20 bg-black/[.02] px-6 py-10 dark:border-white/20 dark:bg-white/[.04]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            className="size-10 rounded-full border-2 border-current border-t-transparent animate-spin text-foreground"
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground">Parsing…</p>
          {sizeWarning ? (
            <p className="max-w-sm text-center text-xs text-amber-700 dark:text-amber-400">
              This file is larger than 50 MB. Parsing may take a while.
            </p>
          ) : null}
        </div>
      ) : displayError ? (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-red-500/40 bg-red-500/[.06] px-6 py-10 dark:bg-red-500/[.08]"
          role="alert"
        >
          <p className="text-center text-sm text-foreground">{displayError}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-black/15 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]"
          >
            Retry
          </button>
        </div>
      ) : showSuccess ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-solid border-black/15 bg-black/[.02] px-6 py-10 dark:border-white/20 dark:bg-white/[.04]">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{lastFileName ?? 'Uploaded file'}</p>
            <p className="mt-1 text-sm text-foreground/70">
              {csv!.rowCount.toLocaleString()} row{csv!.rowCount === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onChangeFile}
            className="rounded-lg border border-black/15 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]"
          >
            Change file
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={openPicker}
            onDrop={onDrop}
            onDragOver={onDragOver}
            className="flex min-h-[200px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-black/20 bg-black/[.02] px-6 py-10 text-center transition-colors hover:border-black/35 hover:bg-black/[.04] dark:border-white/20 dark:bg-white/[.04] dark:hover:border-white/35 dark:hover:bg-white/[.06]"
          >
            <span className="text-sm font-medium text-foreground">
              Drag and drop a CSV here, or click to browse
            </span>
            <span className="text-xs text-foreground/60">.csv only</span>
          </button>
        </div>
      )}
    </div>
  );
}
