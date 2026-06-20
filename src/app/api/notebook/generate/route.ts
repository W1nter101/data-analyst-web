import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSession } from "@/lib/session";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

interface SchemaItem {
  column_name: string;
  data_type: string;
}

interface GenerateRequestBody {
  prompt?: string;
  question?: string;
  schema: SchemaItem[] | string;
  columnNames?: string[];
  previousContext?: {
    question: string;
    resultSummary: string;
  };
  useQwen?: boolean;
  selfCorrection?: {
    originalCode: string;
    errorType: string;
    errorDetail: string;
  };
}

interface OllamaResponse {
  message?: {
    content?: string;
  };
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function validateQwenCode(code: string): { valid: boolean; reason?: string } {
  // Kiểm tra 1: Có biến _result không
  if (!code.includes('_result')) {
    return { valid: false, reason: 'missing_result_var' };
  }
  // Kiểm tra 2: Số ngoặc () cân bằng
  const open = (code.match(/\(/g) || []).length;
  const close = (code.match(/\)/g) || []).length;
  if (open !== close) {
    return { valid: false, reason: 'unbalanced_parentheses' };
  }
  // Kiểm tra 3: Số ngoặc [] cân bằng
  const openSq = (code.match(/\[/g) || []).length;
  const closeSq = (code.match(/\]/g) || []).length;
  if (openSq !== closeSq) {
    return { valid: false, reason: 'unbalanced_brackets' };
  }
  return { valid: true };
}

function buildSelfCorrectionPrompt(
  originalCode: string,
  errorType: string,
  errorDetail: string,
  originalQuestion: string,
  columnNames: string[]
): string {
  return `Câu hỏi gốc: "${originalQuestion}"

Code bạn sinh ra bị lỗi khi chạy:
\`\`\`
${errorType}: ${errorDetail}
\`\`\`

Code bị lỗi:
\`\`\`python
${originalCode}
\`\`\`

Hãy phân tích lỗi và sinh lại code mới đúng hoàn toàn.
Quy tắc sửa lỗi quan trọng:
1. Chỉ được dùng các cột thực tế có sẵn dưới đây:
Available columns: ${JSON.stringify(columnNames)}
2. Nếu là KeyError về tên cột: kiểm tra lại tên cột sau .agg() và đảm bảo sort_values dùng đúng tên đó.
3. Khi dùng groupby + agg, LUÔN LUÔN dùng named aggregation (ví dụ: df.groupby('col').agg(NewName=('OldCol', 'func')).reset_index()) và đảm bảo sort_values dùng đúng NewName đó.
4. MANDATORY Python syntax rules:
   - NEVER use assignment inside parentheses: _result = (x = value) is INVALID.
   - Assignment must be a standalone statement:
       df['NewCol'] = df['OldCol'] * 2  # ✅ correct
       _result = (df['NewCol'] = ...)   # ❌ SyntaxError
5. DATETIME CONVERSION — CONDITIONAL RULE:
   - ONLY add datetime conversion code if the user question contains keywords: "quý", "quarter", "tháng", "month", "năm", "year", "ngày", "date", "theo thời gian", "xu hướng", "trend", "so sánh kỳ".
   - If the question is about: Category, Customer, Region, Product, Sub-Category, Segment, Ship Mode → DO NOT add any datetime code whatsoever.
   - When datetime IS needed, use ONLY standalone statement (never inside parentheses):
     df['Order Date'] = pd.to_datetime(df['Order Date'], format='mixed')
6. MANDATORY: Before converting DataFrame to JSON/dict, convert all datetime/Timestamp columns to string first: df['date_col'] = df['date_col'].astype(str) or use df['date_col'] = df['date_col'].dt.strftime('%Y-%m-%d'). NEVER pass raw Timestamp objects to json.dumps().
7. If the question requires multiple analysis steps (e.g., "find X, then in X find Y"), you MUST complete ALL steps in one code block and return ALL requested columns. Do NOT return partial results silently.
8. Đảm bảo tuân thủ đầy đủ PANDAS SAFETY RULES.`;
}

async function callQwenLocal(systemPrompt: string, userPrompt: string): Promise<string> {
  const baseEndpoint = process.env.QWEN_ENDPOINT || "http://localhost:1234";
  const model = process.env.QWEN_MODEL || "qwen2.5-coder-7b-instruct.Q4_K_M";

  let targetUrl = baseEndpoint;
  let isOllama = false;

  if (targetUrl.includes("/api/chat")) {
    isOllama = true;
  } else if (targetUrl.includes("/v1/chat/completions")) {
    isOllama = false;
  } else {
    if (targetUrl.includes("11434")) {
      targetUrl = `${targetUrl.replace(/\/$/, "")}/api/chat`;
      isOllama = true;
    } else {
      targetUrl = `${targetUrl.replace(/\/$/, "")}/v1/chat/completions`;
      isOllama = false;
    }
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      isOllama
        ? { model, messages, stream: false }
        : { model, messages, stream: false, temperature: 0.1 }
    ),
  });

  if (!response.ok) {
    throw new Error(`Qwen HTTP Error: ${response.status} ${response.statusText}`);
  }

  if (isOllama) {
    const data = (await response.json()) as OllamaResponse;
    if (!data?.message?.content) {
      throw new Error("Invalid response format from Ollama");
    }
    return data.message.content;
  } else {
    const data = (await response.json()) as OpenAIResponse;
    if (!data?.choices?.[0]?.message?.content) {
      throw new Error("Invalid response format from LM Studio / OpenAI compatible API");
    }
    return data.choices[0].message.content;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check authorization
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
    }

    const body = (await req.json()) as GenerateRequestBody;
    const promptText = body.prompt || body.question;
    const rawSchema = body.schema;
    const previousContext = body.previousContext;
    const useQwen = body.useQwen !== false; // Default to true unless explicitly false

    if (!promptText || !rawSchema) {
      return NextResponse.json({ error: "Missing prompt or schema" }, { status: 400 });
    }

    const schemaText = Array.isArray(rawSchema)
      ? rawSchema.map((col: SchemaItem) => `- ${col.column_name} (${col.data_type})`).join("\n")
      : String(rawSchema);

    const columnNames = Array.isArray(rawSchema)
      ? rawSchema.map((col: SchemaItem) => col.column_name)
      : [];

    let code = "";
    let usedFallback = false;

    if (useQwen) {
      try {
        if (body.selfCorrection) {
          const qwenSystemPrompt = `Bạn là lập trình viên Python Pandas chuyên nghiệp.
DataFrame df đã sẵn sàng với các cột:
${schemaText}
Available columns: ${JSON.stringify(columnNames)}
Chỉ trả về code Python trong cặp thẻ \`\`\`python ... \`\`\`.
Không giải thích. Không import. Chỉ dùng biến df.
Biến kết quả cuối PHẢI là _result (list of dict hoặc scalar wrap).

PANDAS SAFETY RULES:
- MANDATORY Python syntax rules:
  * NEVER use assignment inside parentheses: _result = (x = value) is INVALID.
  * Assignment must be a standalone statement:
      df['NewCol'] = df['OldCol'] * 2  # ✅ correct
      _result = (df['NewCol'] = ...)   # ❌ SyntaxError
- DATETIME CONVERSION — CONDITIONAL RULE:
  * ONLY add datetime conversion code if the user question contains keywords: "quý", "quarter", "tháng", "month", "năm", "year", "ngày", "date", "theo thời gian", "xu hướng", "trend", "so sánh kỳ".
  * If the question is about: Category, Customer, Region, Product, Sub-Category, Segment, Ship Mode → DO NOT add any datetime code whatsoever.
  * When datetime IS needed, use ONLY standalone statement (never inside parentheses):
    df['Order Date'] = pd.to_datetime(df['Order Date'], format='mixed')
- MANDATORY: When using groupby + agg, ALWAYS use named aggregation:
  df.groupby('col').agg(NewName=('OldCol', 'func')).reset_index()
- ALWAYS sort_values using the EXACT same name defined in .agg().
- ONLY use columns from: ${JSON.stringify(columnNames)}
- MANDATORY: Before converting DataFrame to JSON/dict:
  * Convert all datetime/Timestamp columns to string first: df['date_col'] = df['date_col'].astype(str)
  * Or use: df['date_col'] = df['date_col'].dt.strftime('%Y-%m-%d')
  * NEVER pass raw Timestamp objects to json.dumps().
- If the question requires multiple analysis steps (e.g., "find X, then in X find Y"), you MUST complete ALL steps in one code block and return ALL requested columns. Do NOT return partial results silently.
- LUÔN gọi .reset_index() trước khi gọi .to_dict(orient='records') nếu có groupby, agg, size, sum hoặc bất cứ thao tác nhóm nào.
- KHÔNG bao giờ gọi .to_dict(orient=...) trực tiếp trên một Series (như groupby().sum() hoặc groupby().size() mà không reset_index()). Series không hỗ trợ tham số orient.
- Đảm bảo kết quả là một DataFrame trước khi gọi .to_dict(orient='records').
  * Ví dụ đúng: df.groupby('Region')['Sales'].sum().reset_index().to_dict(orient='records')
- NEVER use df.assign(Col Name=...) with column names containing spaces. Instead, use df.assign(**{'Col Name': value}).
- ALWAYS wrap long method chains in parentheses ().
- ONLY use columns from the Available columns list above. NEVER assume columns like 'Quantity', 'Profit', 'Discount' exist.`;

          const qwenUserPrompt = buildSelfCorrectionPrompt(
            body.selfCorrection.originalCode,
            body.selfCorrection.errorType,
            body.selfCorrection.errorDetail,
            promptText,
            columnNames
          );

          const qwenCodeRaw = await callQwenLocal(qwenSystemPrompt, qwenUserPrompt);
          const codeMatch = qwenCodeRaw.match(/```python\n([\s\S]*?)```/);
          code = codeMatch ? codeMatch[1].trim() : qwenCodeRaw.trim();
        } else {
          // Step 1: Gemini Planner
          const geminiPlannerSystemPrompt = `Bạn là Data Analysis Planner. Nhiệm vụ: Đọc câu hỏi người dùng và schema CSV,
trả về ĐÚNG định dạng sau — KHÔNG viết code, KHÔNG giải thích:

STEPS:
[Hành động pandas kỹ thuật, ví dụ: Filter df['Region'] == 'South']
[Hành động tiếp theo, ví dụ: groupby('Product Name')['Quantity'].sum()]
[Kết quả cuối: reset_index().rename(columns=...).to_dict(orient='records')]

Quy tắc bắt buộc:
Mỗi bước PHẢI dùng tên hàm Pandas thực (groupby, agg, sort_values, diff, shift...)
Bước cuối LUÔN kết thúc bằng .to_dict(orient='records') hoặc [{"result": value}] nếu scalar
Tối đa 6 bước

PANDAS SAFETY RULES:
- MANDATORY Python syntax rules:
  * NEVER use assignment inside parentheses: _result = (x = value) is INVALID.
  * Assignment must be a standalone statement:
      df['NewCol'] = df['OldCol'] * 2  # ✅ correct
      _result = (df['NewCol'] = ...)   # ❌ SyntaxError
- DATETIME CONVERSION — CONDITIONAL RULE:
  * ONLY add datetime conversion code if the user question contains keywords: "quý", "quarter", "tháng", "month", "năm", "year", "ngày", "date", "theo thời gian", "xu hướng", "trend", "so sánh kỳ".
  * If the question is about: Category, Customer, Region, Product, Sub-Category, Segment, Ship Mode → DO NOT add any datetime code whatsoever.
  * When datetime IS needed, use ONLY standalone statement (never inside parentheses):
    df['Order Date'] = pd.to_datetime(df['Order Date'], format='mixed')
- MANDATORY: When using groupby + agg, ALWAYS use named aggregation:
  df.groupby('col').agg(NewName=('OldCol', 'func')).reset_index()
- ALWAYS sort_values using the EXACT same name defined in .agg().
- ONLY use columns from: ${JSON.stringify(columnNames)}
- MANDATORY: Before converting DataFrame to JSON/dict:
  * Convert all datetime/Timestamp columns to string first: df['date_col'] = df['date_col'].astype(str)
  * Or use: df['date_col'] = df['date_col'].dt.strftime('%Y-%m-%d')
  * NEVER pass raw Timestamp objects to json.dumps().
- If the question requires multiple analysis steps (e.g., "find X, then in X find Y"), you MUST complete ALL steps in one code block and return ALL requested columns. Do NOT return partial results silently.
- LUÔN gọi .reset_index() trước khi gọi .to_dict(orient='records') nếu có groupby, agg, size, sum hoặc bất cứ thao tác nhóm nào.
- KHÔNG bao giờ gọi .to_dict(orient=...) trực tiếp trên một Series (như groupby().sum() hoặc groupby().size() mà không reset_index()). Series không hỗ trợ tham số orient.
- Đảm bảo kết quả là một DataFrame trước khi gọi .to_dict(orient='records').
  * Ví dụ đúng: df.groupby('Region')['Sales'].sum().reset_index().to_dict(orient='records')
- NEVER use df.assign(Col Name=...) with column names containing spaces. Instead, use df.assign(**{'Col Name': value}).
- ALWAYS wrap long method chains in parentheses ().
- ONLY reference columns from the injected schema list. NEVER assume columns like 'Quantity', 'Profit', 'Discount' exist.
Available columns: ${JSON.stringify(columnNames)}`;

          const contextBlock = previousContext
            ? `\n\nNgữ cảnh tham khảo (KHÔNG dùng làm biến Python):\n- Câu hỏi trước: "${previousContext.question}"\n- Kết quả trước (chỉ để hiểu ngữ cảnh): ${previousContext.resultSummary}\nQUAN TRỌNG: Biến "df" luôn luôn là DataFrame gốc đầy đủ (chứa tất cả các cột ban đầu như ${JSON.stringify(columnNames)}). Biến "df" KHÔNG bị thay thế hay ghi đè bởi kết quả của câu hỏi trước. Khi thực hiện yêu cầu mới, hãy bắt đầu tính toán lại từ các cột gốc của "df" chứ không giả định "df" chỉ có các cột từ kết quả trước.`
            : "";

          const finalPlannerPrompt = geminiPlannerSystemPrompt + contextBlock;

          const plannerResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: [{ role: "user", parts: [{ text: `${finalPlannerPrompt}\n\nYêu cầu: ${promptText}\n\nSchema:\n${schemaText}` }] }],
          });

          const plannerText = plannerResponse.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          const stepsMatch = plannerText.match(/STEPS:\n([\s\S]+)/);
          const steps = stepsMatch ? stepsMatch[1].trim() : plannerText.trim();

          // Step 2: Qwen Coder
          const qwenSystemPrompt = `Bạn là lập trình viên Python Pandas chuyên nghiệp.
DataFrame df đã sẵn sàng với các cột:
${schemaText}
Available columns: ${JSON.stringify(columnNames)}
Chỉ trả về code Python trong cặp thẻ \`\`\`python ... \`\`\`.
Không giải thích. Không import. Chỉ dùng biến df.
Biến kết quả cuối PHẢI là _result (list of dict hoặc scalar wrap).

PANDAS SAFETY RULES:
- MANDATORY Python syntax rules:
  * NEVER use assignment inside parentheses: _result = (x = value) is INVALID.
  * Assignment must be a standalone statement:
      df['NewCol'] = df['OldCol'] * 2  # ✅ correct
      _result = (df['NewCol'] = ...)   # ❌ SyntaxError
- DATETIME CONVERSION — CONDITIONAL RULE:
  * ONLY add datetime conversion code if the user question contains keywords: "quý", "quarter", "tháng", "month", "năm", "year", "ngày", "date", "theo thời gian", "xu hướng", "trend", "so sánh kỳ".
  * If the question is about: Category, Customer, Region, Product, Sub-Category, Segment, Ship Mode → DO NOT add any datetime code whatsoever.
  * When datetime IS needed, use ONLY standalone statement (never inside parentheses):
    df['Order Date'] = pd.to_datetime(df['Order Date'], format='mixed')
- MANDATORY: When using groupby + agg, ALWAYS use named aggregation:
  df.groupby('col').agg(NewName=('OldCol', 'func')).reset_index()
- ALWAYS sort_values using the EXACT same name defined in .agg().
- ONLY use columns from: ${JSON.stringify(columnNames)}
- MANDATORY: Before converting DataFrame to JSON/dict:
  * Convert all datetime/Timestamp columns to string first: df['date_col'] = df['date_col'].astype(str)
  * Or use: df['date_col'] = df['date_col'].dt.strftime('%Y-%m-%d')
  * NEVER pass raw Timestamp objects to json.dumps().
- If the question requires multiple analysis steps (e.g., "find X, then in X find Y"), you MUST complete ALL steps in one code block and return ALL requested columns. Do NOT return partial results silently.
- LUÔN gọi .reset_index() trước khi gọi .to_dict(orient='records') nếu có groupby, agg, size, sum hoặc bất cứ thao tác nhóm nào.
- KHÔNG bao giờ gọi .to_dict(orient=...) trực tiếp trên một Series (như groupby().sum() || groupby().size() mà không reset_index()). Series không hỗ trợ tham số orient.
- Đảm bảo kết quả là một DataFrame trước khi gọi .to_dict(orient='records').
  * Ví dụ đúng: df.groupby('Region')['Sales'].sum().reset_index().to_dict(orient='records')
  * Ví dụ sai: df.groupby('Region')['Sales'].sum().to_dict(orient='records') (Sẽ lỗi Series.to_dict orient)
- NEVER use df.assign(Col Name=...) with column names containing spaces. Instead, use df.assign(**{'Col Name': value}).
- ALWAYS wrap long method chains in parentheses ().
- ONLY use columns from the Available columns list above. NEVER assume columns like 'Quantity', 'Profit', 'Discount' exist.`;

          const qwenUserPrompt = `Viết code Python thực thi chính xác các bước sau:\n${steps}`;

          let qwenCodeRaw = await callQwenLocal(qwenSystemPrompt, qwenUserPrompt);

          // Parse Qwen output
          let codeMatch = qwenCodeRaw.match(/```python\n([\s\S]*?)```/);
          let parsedCode = codeMatch ? codeMatch[1].trim() : qwenCodeRaw.trim();

          // Validate code
          let validation = validateQwenCode(parsedCode);
          if (!validation.valid) {
            // Retry Qwen once
            const retryUserPrompt = `Mã Python trước đó có lỗi: ${validation.reason}.
Vui lòng viết lại mã Python chuẩn xác, đảm bảo gán kết quả cuối cùng vào biến _result và đóng mở ngoặc (), [] cân bằng.
Các bước cần thực hiện:\n${steps}`;
            
            qwenCodeRaw = await callQwenLocal(qwenSystemPrompt, retryUserPrompt);
            codeMatch = qwenCodeRaw.match(/```python\n([\s\S]*?)```/);
            parsedCode = codeMatch ? codeMatch[1].trim() : qwenCodeRaw.trim();
            validation = validateQwenCode(parsedCode);
          }

          if (validation.valid) {
            code = parsedCode;
          } else {
            console.warn(`Qwen code validation failed: ${validation.reason}. Falling back to Gemini.`);
            usedFallback = true;
          }
        }
      } catch (qwenErr) {
        console.warn("Qwen pipeline failed, falling back to Gemini:", qwenErr);
        usedFallback = true;
      }
    }

    // Fallback to Gemini-only if Qwen disabled or failed
    if (!useQwen || usedFallback) {
      const systemPrompt = `Bạn là data analyst chuyên Python/pandas.
Người dùng có DataFrame tên là \`df\` với các cột sau:
${schemaText}
Available columns: ${JSON.stringify(columnNames)}

Nhiệm vụ: Sinh/sửa Python code để trả lời yêu cầu của user.
Rules bắt buộc:
1. Biến df đã được load sẵn — KHÔNG dùng pd.read_csv() hoặc tự tạo dữ liệu giả.
2. Gán kết quả cuối vào biến _result (string, number, list hoặc dict).
3. KHÔNG sử dụng matplotlib hay bất kỳ thư viện vẽ biểu đồ nào khác (như seaborn).
4. Nếu người dùng yêu cầu vẽ biểu đồ (chart/graph/plot/visualize), bạn phải sinh mã Python gán vào biến _result một dict có cấu trúc chính xác như sau:
   _result = {
       "type": "chart",
       "chartType": "bar", # hoặc "line", "pie", "area"
       "data": [
           {"name": <nhãn trục X hoặc key>, "value": <số liệu trục Y hoặc giá trị>},
           ...
       ],
       "xLabel": "tên trục X",
       "yLabel": "tên trục Y"
   }
5. Đối với các câu hỏi tìm kiếm phần tử bán chạy nhất, lớn nhất, nhỏ nhất, tốt nhất (câu hỏi dạng max/min/best/worst), bạn KHÔNG được chỉ trả về chuỗi tên phần tử đơn lẻ. Bạn PHẢI trả về một dictionary đầy đủ thông tin gán cho _result. Ví dụ:
   _result = {
       "product": df.loc[df['Sales'].idxmax()]['Product Name'], # Tên đối tượng
       "sales": float(df['Sales'].max()),                       # Giá trị của đối tượng đó
       "total_sales": float(df['Sales'].sum()),                 # Tổng giá trị toàn bộ
       "share_pct": round(df['Sales'].max() / df['Sales'].sum() * 100, 1) # Tỷ lệ phần trăm
   }
   (Thay thế 'Sales' và 'Product Name' bằng tên các cột tương ứng phù hợp trong schema của dữ liệu hiện tại).
6. Khi trả về dữ liệu dạng bảng, LUÔN dùng .reset_index().to_dict(orient="records") để _result là list of dict. KHÔNG dùng orient="index".
7. PANDAS SAFETY RULES:
   - MANDATORY Python syntax rules:
     * NEVER use assignment inside parentheses: _result = (x = value) is INVALID.
     * Assignment must be a standalone statement:
         df['NewCol'] = df['OldCol'] * 2  # ✅ correct
         _result = (df['NewCol'] = ...)   # ❌ SyntaxError
   - DATETIME CONVERSION — CONDITIONAL RULE:
     * ONLY add datetime conversion code if the user question contains keywords: "quý", "quarter", "tháng", "month", "năm", "year", "ngày", "date", "theo thời gian", "xu hướng", "trend", "so sánh kỳ".
     * If the question is about: Category, Customer, Region, Product, Sub-Category, Segment, Ship Mode → DO NOT add any datetime code whatsoever.
     * When datetime IS needed, use ONLY standalone statement (never inside parentheses):
       df['Order Date'] = pd.to_datetime(df['Order Date'], format='mixed')
   - MANDATORY: When using groupby + agg, ALWAYS use named aggregation:
     df.groupby('col').agg(NewName=('OldCol', 'func')).reset_index()
   - ALWAYS sort_values using the EXACT same name defined in .agg().
   - ONLY use columns from: ${JSON.stringify(columnNames)}
   - MANDATORY: Before converting DataFrame to JSON/dict:
     * Convert all datetime/Timestamp columns to string first: df['date_col'] = df['date_col'].astype(str)
     * Or use: df['date_col'] = df['date_col'].dt.strftime('%Y-%m-%d')
     * NEVER pass raw Timestamp objects to json.dumps().
   - If the question requires multiple analysis steps (e.g., "find X, then in X find Y"), you MUST complete ALL steps in one code block and return ALL requested columns. Do NOT return partial results silently.
   - LUÔN gọi .reset_index() trước khi gọi .to_dict(orient='records') nếu có groupby, agg, size, sum hoặc bất cứ thao tác nhóm nào.
   - KHÔNG bao giờ gọi .to_dict(orient=...) trực tiếp trên một Series (như groupby().sum() hoặc groupby().size() mà không reset_index()). Series không hỗ trợ tham số orient.
   - Đảm bảo kết quả là một DataFrame trước khi gọi .to_dict(orient='records').
     * Ví dụ đúng: df.groupby('Region')['Sales'].sum().reset_index().to_dict(orient='records')
     * Ví dụ sai: df.groupby('Region')['Sales'].sum().to_dict(orient='records') (Sẽ lỗi Series.to_dict orient)
   - NEVER use df.assign(Col Name=...) with column names containing spaces. Instead, use df.assign(**{'Col Name': value}).
   - ALWAYS wrap long method chains in parentheses ().
   - ONLY use columns from the Available columns list above. NEVER assume columns like 'Quantity', 'Profit', 'Discount' exist.
8. Chỉ trả về code Python thuần — không có markdown (không bắt đầu bằng \`\`\`python và kết thúc bằng \`\`\`), không có giải thích.
9. Không dùng print() — chỉ gán vào _result.`;

      const contextBlock = previousContext
        ? `\n\nNgữ cảnh tham khảo (KHÔNG dùng làm biến Python):\n- Câu hỏi trước: "${previousContext.question}"\n- Kết quả trước (chỉ để hiểu ngữ cảnh): ${previousContext.resultSummary}\nQUAN TRỌNG: Biến "df" luôn luôn là DataFrame gốc đầy đủ (chứa tất cả các cột ban đầu như ${JSON.stringify(columnNames)}). Biến "df" KHÔNG bị thay thế hay ghi đè bởi kết quả của câu hỏi trước. Khi thực hiện yêu cầu mới, hãy bắt đầu tính toán lại từ các cột gốc của "df" chứ không giả định "df" chỉ có các cột từ kết quả trước.`
        : '';

      const finalSystemPrompt = systemPrompt + contextBlock;

      const userPrompt = body.selfCorrection
        ? buildSelfCorrectionPrompt(
            body.selfCorrection.originalCode,
            body.selfCorrection.errorType,
            body.selfCorrection.errorDetail,
            promptText,
            columnNames
          )
        : `Yêu cầu: ${promptText}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [{ role: "user", parts: [{ text: `${finalSystemPrompt}\n\n${userPrompt}` }] }],
      });

      const rawCode = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      code = rawCode.replace(/^```python\n?/, "").replace(/\n?```$/, "").trim();
    }

    return NextResponse.json({ code });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Error generating notebook code:", error);
    return NextResponse.json(
      { success: false, error: error.message || String(err), traceback: error.stack },
      { status: 500 }
    );
  }
}
