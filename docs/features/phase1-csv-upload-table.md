# Feature Plan: Phase 1 — CSV Upload & Table View

## Goal
Allow users to upload a CSV file and immediately see it as an interactive table with column statistics and auto-detected schema.

## User Story
> As a data analyst, I upload a CSV file and I can explore the data in a spreadsheet-like table, see column types detected automatically, sort/filter columns, and see quick stats per column (min, max, nulls, unique count).

## Acceptance Criteria
- [ ] User can drag-and-drop or click to upload a CSV file
- [ ] File is parsed client-side using PapaParse (no server upload)
- [ ] Table shows all rows and columns using TanStack Table
- [ ] Columns are sortable and filterable
- [ ] Column type is auto-detected: number, date, string, category
- [ ] Column stats panel shows: null count, unique count, min/max for numbers, sample values
- [ ] Loading state while parsing large files
- [ ] Empty state before upload
- [ ] Error state for invalid/non-CSV files
- [ ] Max file size warning: 50MB

## Files to Create
```
src/components/upload/CSVUploader.tsx       # Drag-drop upload zone
src/components/table/DataTable.tsx          # TanStack Table wrapper
src/components/table/ColumnStats.tsx        # Stats panel per column
src/components/table/TableToolbar.tsx       # Search + column toggle controls
src/lib/csv/parser.ts                       # PapaParse wrapper → ParsedCSV
src/lib/csv/schema.ts                       # Column type detection logic
src/hooks/useCSVData.ts                     # Manages CSV state in Zustand
```

## Files to Modify
```
src/app/dashboard/page.tsx                  # Add CSVUploader + DataTable
src/store/appStore.ts                       # Add csv field
src/types/index.ts                          # ParsedCSV, ColumnSchema, ColumnType types
```

## Data Flow
```
User drops file
  → CSVUploader receives File object
  → parser.ts (PapaParse) → raw rows + headers
  → schema.ts detects column types + stats
  → Zustand store: appStore.csv = ParsedCSV
  → DataTable reads from store and renders
  → ColumnStats reads schema from store and renders
```

## Column Type Detection Logic
```
- If >80% of non-null values parse as float → 'number'
- If >80% parse as valid date (Date.parse) → 'date'
- If unique count / total < 0.1 AND total > 10 → 'category'
- Otherwise → 'string'
```

## Edge Cases
- Empty CSV (headers only)
- CSV with inconsistent row lengths
- Very wide tables (50+ columns) — TanStack column visibility toggle needed
- Numbers formatted with commas: "1,000,000" → strip commas before parsing
- Dates in various formats: dd/mm/yyyy, yyyy-mm-dd, ISO

## Dependencies to Add
```bash
npm install papaparse @types/papaparse
npm install @tanstack/react-table
```

## Manual Test Checklist
- [ ] Upload a normal CSV (10 columns, 1000 rows) → table renders correctly
- [ ] Upload a CSV with empty cells → null count shown correctly
- [ ] Upload an image file → error state shown
- [ ] Upload 40MB CSV → loading spinner shows during parse
- [ ] Sort a number column ascending/descending
- [ ] Filter text column
- [ ] Check column stats panel for a number column (min/max shown)
- [ ] Check column stats panel for a category column (top values shown)

## Phase 2 Dependency
This phase must be complete before Phase 2 (Charts) because ChartPicker uses `ParsedCSV.schema` to populate column selectors.

