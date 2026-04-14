# AGENTS.md — Project Context for AI Agents

> Read this file first before doing anything. Do not write code until you have summarized your understanding.

---

## Project Overview

**Name:** CSV Data Analyst Web App
**Goal:** A web application that lets data analysts upload CSV files, explore data in an interactive spreadsheet table, create charts and dashboards, and chat with an AI assistant that can answer questions and suggest visualizations based on the uploaded data.

**Inspiration:** [Bricks](https://www.thebricks.com/) — AI-powered spreadsheet + dashboard + chat.

---

## Tech Stack

| Layer            | Technology              |
| ---------------- | ----------------------- |
| Framework        | Next.js 15 (App Router) |
| Language         | TypeScript (strict)     |
| Styling          | Tailwind CSS v4         |
| Table            | TanStack Table v8       |
| CSV Parsing      | PapaParse               |
| Charts           | Recharts                |
| Dashboard layout | react-grid-layout       |
| AI SDK           | Vercel AI SDK           |
| LLM              | Google Gemini 2.0 Flash |
| Deploy           | Vercel                  |

---

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout, fonts, global providers
│   ├── page.tsx                # Landing / home page
│   └── dashboard/
│       └── page.tsx            # Main workspace page
├── components/
│   ├── ui/                     # Generic reusable UI (Button, Modal, Badge...)
│   ├── table/                  # CSV table viewer components
│   │   ├── DataTable.tsx
│   │   ├── ColumnStats.tsx
│   │   └── TableToolbar.tsx
│   ├── chart/                  # Chart components
│   │   ├── ChartRenderer.tsx   # Renders chart based on config JSON
│   │   ├── ChartPicker.tsx     # UI to pick chart type + columns
│   │   └── ChartWidget.tsx     # Wraps chart for dashboard grid
│   ├── dashboard/              # Dashboard grid and widgets
│   │   ├── DashboardGrid.tsx
│   │   └── DashboardWidget.tsx
│   ├── upload/                 # CSV upload and drop zone
│   │   └── CSVUploader.tsx
│   └── ai/                     # AI chat components
│       ├── ChatPanel.tsx
│       ├── ChatMessage.tsx
│       └── ChatInput.tsx
├── lib/
│   ├── csv/
│   │   ├── parser.ts           # PapaParse wrapper, returns ParsedCSV type
│   │   └── schema.ts           # Auto-detect column types (number, date, string, category)
│   ├── ai/
│   │   ├── systemPrompt.ts     # Builds AI system prompt from CSV schema + sample rows
│   │   └── responseParser.ts   # Parses structured AI JSON response
│   └── utils.ts                # Shared helpers
├── hooks/
│   ├── useCSVData.ts           # Manages uploaded CSV state
│   ├── useCharts.ts            # Chart list state
│   └── useDashboard.ts         # Dashboard layout state
├── store/
│   └── appStore.ts             # Zustand global store (CSV data, charts, dashboard)
└── types/
    └── index.ts                # All shared TypeScript types
```

---

## Core Data Types

```typescript
// types/index.ts

export type ColumnType = "number" | "string" | "date" | "category" | "boolean";

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  nullCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  sampleValues: string[];
}

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  schema: ColumnSchema[];
}

export type ChartType = "bar" | "line" | "pie" | "scatter" | "area";

export interface ChartConfig {
  id: string;
  type: ChartType;
  title: string;
  xColumn: string;
  yColumn: string;
  colorColumn?: string;
}

export interface DashboardWidget {
  id: string;
  chartId: string;
  layout: { x: number; y: number; w: number; h: number };
}

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
  chart?: ChartConfig; // If AI suggests a chart, it's attached here
  timestamp: Date;
}

export interface AIResponse {
  answer: string;
  chart?: ChartConfig;
  insight?: string;
}
```

---

## AI Layer — How It Works

The AI layer is the core value of this app. Here is how it works:

1. User uploads CSV → schema is extracted from the data.
2. When user sends a chat message, `systemPrompt.ts` builds a prompt that includes:
   - Column names and detected types
   - 10 sample rows
   - Total row count
   - Instruction to respond in structured JSON
3. The AI responds with a structured JSON `AIResponse`:
   ```json
   {
     "answer": "Month 3 had the highest revenue: 450,000,000",
     "chart": {
       "id": "auto-1",
       "type": "bar",
       "title": "Revenue by Month",
       "xColumn": "month",
       "yColumn": "revenue"
     }
   }
   ```
4. `responseParser.ts` extracts the JSON.
5. If `chart` is present, `ChartRenderer.tsx` automatically renders it inline in the chat.

**Important:** AI must never fabricate column names or row values. It can only reference columns that exist in the schema.

---

## State Management

Zustand is used for global state. Do not use React Context for data that multiple unrelated components need.

```typescript
// store/appStore.ts structure
{
  csv: ParsedCSV | null;
  charts: ChartConfig[];
  dashboardWidgets: DashboardWidget[];
  messages: AIMessage[];
  isLoading: boolean;
}
```

---

## Development Rules for Agent

- **Always read this file and `AGENTS.md` before coding.**
- Do not hardcode column names or data values. Everything derives from the uploaded CSV.
- All chart rendering goes through `ChartRenderer.tsx` — never render charts ad hoc in pages.
- All AI calls go through the `/api/chat` route — never call LLM directly from client components.
- Use existing types in `types/index.ts`. Do not duplicate type definitions.
- Keep components in correct directories (see structure above).
- Server Components for layout/page shells. Client Components for interactive UI.
- Never use `localStorage` for large CSV data — use Zustand in-memory store.
- Tailwind classes only — no inline styles except for `react-grid-layout` dimensions.
- Every component must handle loading, empty, and error states.

---

## Feature Roadmap

See `docs/features/` for individual feature plans.

| Phase | Feature                     | Status         |
| ----- | --------------------------- | -------------- |
| 1     | CSV Upload & Table View     | ✅ Done        |
| 1     | Column schema detection     | ✅ Done        |
| 2     | Manual chart builder        | 🔲 Not started |
| 2     | Dashboard grid layout       | 🔲 Not started |
| 3     | AI chat — text answers      | 🔲 Not started |
| 3     | AI chat — chart suggestions | 🔲 Not started |
| 4     | Export chart as PNG         | 🔲 Not started |
| 4     | Save/load dashboard         | 🔲 Not started |

---

## Environment Variables

```env
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyCLLVznctux9xZfDPAo7xQiJSw9_-ONn_k
```
