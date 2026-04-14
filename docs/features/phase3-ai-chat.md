# Feature Plan: Phase 3 — AI Chat (Text + Chart Suggestions)

## Goal
Allow users to ask natural language questions about their CSV data. The AI answers in text and optionally suggests a chart that auto-renders inline in the chat.

## User Story
> As a data analyst, I can type a question like "which month had the highest revenue?" and get an accurate text answer plus a suggested chart that I can add to my dashboard with one click.

## Acceptance Criteria
- [ ] Chat panel with message history
- [ ] User sends a message → AI responds with text answer
- [ ] If AI suggests a chart, it renders inline in the chat message
- [ ] "Add to dashboard" button on AI-suggested charts
- [ ] AI only uses columns that exist in the CSV schema
- [ ] Streaming response (text appears token by token, not all at once)
- [ ] Loading state while waiting for AI
- [ ] Error state if API call fails
- [ ] AI response is grounded: cannot hallucinate column names or values

## Files to Create
```
src/components/ai/ChatPanel.tsx             # Full chat UI (message list + input)
src/components/ai/ChatMessage.tsx           # Single message bubble (user or AI)
src/components/ai/ChatInput.tsx             # Input box + send button
src/lib/ai/systemPrompt.ts                  # Builds system prompt from CSV schema
src/lib/ai/responseParser.ts               # Parses JSON from AI response
src/app/api/chat/route.ts                   # Next.js API route — calls Gemini via AI SDK
```

## Files to Modify
```
src/store/appStore.ts        # Add messages: AIMessage[]
src/types/index.ts           # AIMessage, AIResponse types
src/app/dashboard/page.tsx   # Add ChatPanel to layout
```

## API Route Contract
```typescript
// POST /api/chat
// Request body:
{
  messages: { role: 'user' | 'assistant', content: string }[],
  schema: ColumnSchema[],
  sampleRows: Record<string, string>[],   // first 10 rows
  rowCount: number
}

// Response: streaming text (Vercel AI SDK streamText)
```

## System Prompt Template
The system prompt in `systemPrompt.ts` must include:

```
You are an expert data analyst assistant. The user has uploaded a CSV file.

## Dataset Information
- Total rows: {rowCount}
- Columns: {columnList with types}

## Sample Data (first 10 rows)
{sampleRowsAsMarkdownTable}

## Instructions
1. Answer the user's question accurately based only on the data above.
2. Do not invent column names, values, or statistics not visible in the sample.
3. If the question requires aggregation, describe what you would calculate.
4. Always respond in this exact JSON format:

{
  "answer": "Your text answer here",
  "chart": {   // OPTIONAL — only include if a chart would genuinely help
    "id": "ai-suggested",
    "type": "bar|line|pie|scatter|area",
    "title": "Descriptive chart title",
    "xColumn": "exact_column_name",
    "yColumn": "exact_column_name"
  },
  "insight": "One optional additional insight or follow-up suggestion"
}

5. The xColumn and yColumn values must EXACTLY match one of these column names:
   {columnNameList}
```

## Response Parser Logic
```typescript
// responseParser.ts
// AI sometimes wraps JSON in markdown code blocks
// Strip ```json ... ``` if present, then JSON.parse
// Validate: answer is string, chart.xColumn exists in schema if chart is present
// If parse fails → return { answer: rawText, chart: undefined }
```

## Client-Side AI Call Flow
```
User types message → ChatInput
  → appStore.messages.push({ role: 'user', content })
  → fetch POST /api/chat with messages + schema + sampleRows
  → Streaming response via Vercel AI SDK useChat hook
  → ChatMessage renders streaming text
  → On complete: responseParser extracts JSON
  → If chart present: ChartRenderer renders inline
  → "Add to dashboard" button → appStore.charts.push(chart)
```

## Dependencies to Add
```bash
npm install ai @ai-sdk/google
```

## Environment Variable Required
```
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

## Edge Cases
- No CSV uploaded yet → chat disabled with message "Upload a CSV file to start"
- AI returns malformed JSON → show raw text answer, no chart
- AI suggests a column that doesn't exist → responseParser rejects chart, shows text only
- Very large CSV (50k rows) → only send first 10 rows as sample; note this in prompt
- User asks unrelated questions (e.g. "write me a poem") → AI should politely redirect

## Manual Test Checklist
- [ ] Ask "how many rows are in this dataset?" → correct number in answer
- [ ] Ask "what is the highest value in [numeric column]?" → correct answer
- [ ] Ask "show me revenue by month as a bar chart" → chart renders in chat
- [ ] Click "Add to dashboard" → chart appears in dashboard grid
- [ ] Upload new CSV → chat history clears (or warns user)
- [ ] Ask a question with no CSV → disabled state shown
- [ ] Simulate API failure → error message in chat

