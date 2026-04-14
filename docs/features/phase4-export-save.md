# Feature Plan: Phase 4 — Export & Save Dashboard

## Goal
Let users export charts as PNG images and export the processed data as CSV. Optionally save and reload dashboard layouts.

## Acceptance Criteria
- [ ] Export any chart widget as PNG (using html2canvas or similar)
- [ ] Export full data table as CSV download
- [ ] Export filtered/sorted data as CSV (respects current table state)
- [ ] Save dashboard layout to localStorage (chart configs + grid positions)
- [ ] Reload page → dashboard restores
- [ ] Clear dashboard button

## Files to Create/Modify
```
src/lib/export/chartExport.ts     # html2canvas → PNG download
src/lib/export/csvExport.ts       # Array of objects → CSV string → download
src/lib/storage/dashboardStorage.ts  # Save/load dashboard from localStorage
```

## Dependencies to Add
```bash
npm install html2canvas @types/html2canvas
```

## Notes
- localStorage is safe here for layout metadata (small JSON), not for CSV row data.
- CSV row data stays only in Zustand (in-memory).

