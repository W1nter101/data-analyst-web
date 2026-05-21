# Design System — CSV Analyst

> Tài liệu này định nghĩa toàn bộ ngôn ngữ thiết kế cho ứng dụng CSV Analyst,
> lấy cảm hứng từ **Happy Hues Palette #3** (dark, calm purple).
> Agent đọc file này trước khi thực hiện bất kỳ thay đổi UI nào.

---

## 1. Triết lý thiết kế

**Tone:** Calm, focused, professional — công cụ phân tích dữ liệu cần cảm giác tin cậy, không
phô trương. Màu tối tạo sự tập trung; accent tím-violet làm nổi bật các action quan trọng.

**Nguyên tắc:**
- **Neutral foundation** — phần lớn giao diện là dark surfaces, màu sắc chỉ xuất hiện có chủ đích
- **One accent** — chỉ dùng `--color-accent` cho CTA, active state, highlight
- **Depth through layers** — phân cấp không gian bằng surface màu khác nhau, không phải border
- **Readable data** — font monospace cho số liệu, đủ contrast cho text trên nền tối

---

## 2. Color Palette (Happy Hues #3)

### CSS Variables

```css
:root {
  /* === SURFACES === */
  --color-bg:           #16161a;   /* Background toàn trang */
  --color-surface:      #242629;   /* Card, sidebar, panel */
  --color-surface-2:    #2c2d31;   /* Input, table row hover */
  --color-border:       #383a3f;   /* Divider, table border */

  /* === TEXT === */
  --color-text:         #fffffe;   /* Heading, primary text */
  --color-text-muted:   #94a1b2;   /* Body text, placeholder */
  --color-text-faint:   #4a4e58;   /* Disabled, decorative */

  /* === ACCENT (Purple-Violet) === */
  --color-accent:       #7f5af0;   /* Button primary, active tab, highlight */
  --color-accent-hover: #6b46e0;   /* Hover state */
  --color-accent-muted: #2d2a40;   /* Accent background subtle (badge, tag) */

  /* === SEMANTIC === */
  --color-success:      #2cb67d;   /* Success state, positive value */
  --color-error:        #ef4565;   /* Error, negative value */
  --color-warning:      #f4c430;   /* Warning */

  /* === CHART COLORS (dùng cho dataviz, không dùng trong UI) === */
  --chart-1:  #7f5af0;
  --chart-2:  #2cb67d;
  --chart-3:  #ef4565;
  --chart-4:  #f4c430;
  --chart-5:  #3da9fc;
  --chart-6:  #ff8906;
}
```

### Vai trò từng màu

| Token | Hex | Dùng ở đâu |
|---|---|---|
| `--color-bg` | `#16161a` | Background toàn trang, nền app |
| `--color-surface` | `#242629` | Card dashboard, sidebar, panel chat |
| `--color-surface-2` | `#2c2d31` | Input field, table row alt, dropdown |
| `--color-border` | `#383a3f` | Đường kẻ bảng, divider, border input |
| `--color-text` | `#fffffe` | Tiêu đề, text quan trọng |
| `--color-text-muted` | `#94a1b2` | Body text, label, placeholder |
| `--color-accent` | `#7f5af0` | Button primary, tab active, cell selected |
| `--color-success` | `#2cb67d` | Profit dương, success toast |
| `--color-error` | `#ef4565` | Lỗi, profit âm, error state |

---

## 3. Typography

### Font Stack

```css
:root {
  --font-body:    'Inter', 'Segoe UI', sans-serif;
  --font-display: 'Inter', sans-serif;          /* Hoặc 'DM Sans' nếu muốn softer */
  --font-mono:    'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
}
```

> **Load via Google Fonts:**
> ```html
> <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
> ```

### Scale

```css
:root {
  --text-xs:   0.75rem;   /* 12px — label nhỏ, metadata */
  --text-sm:   0.875rem;  /* 14px — body text, button */
  --text-base: 1rem;      /* 16px — body chính */
  --text-lg:   1.125rem;  /* 18px — heading section */
  --text-xl:   1.25rem;   /* 20px — heading page */
  --text-2xl:  1.5rem;    /* 24px — title lớn */
}
```

### Quy tắc

- **Numbers trong bảng** → `font-family: var(--font-mono)`, `text-align: right`
- **Heading** → `font-weight: 600`, màu `--color-text`
- **Body/label** → `font-weight: 400`, màu `--color-text-muted`
- **Button text** → `font-weight: 500`, `font-size: var(--text-sm)`

---

## 4. Spacing

```css
:root {
  --space-1:  0.25rem;   /*  4px */
  --space-2:  0.5rem;    /*  8px */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-6:  1.5rem;    /* 24px */
  --space-8:  2rem;      /* 32px */
  --space-12: 3rem;      /* 48px */
}
```

---

## 5. Border Radius & Shadow

```css
:root {
  --radius-sm:  4px;
  --radius-md:  8px;
  --radius-lg:  12px;
  --radius-xl:  16px;
  --radius-full: 9999px;

  --shadow-sm: 0 1px 3px rgba(0,0,0,0.4);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.5);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.6);
}
```

---

## 6. Component Specs

### Button

```
Primary:
  background:   var(--color-accent)
  color:        #fffffe
  border-radius: var(--radius-md)
  padding:      8px 16px
  font-size:    var(--text-sm)
  font-weight:  500
  hover:        background → var(--color-accent-hover)

Secondary/Ghost:
  background:   transparent
  border:       1px solid var(--color-border)
  color:        var(--color-text-muted)
  hover:        background → var(--color-surface-2), color → var(--color-text)

Danger:
  background:   var(--color-error)
  hover:        opacity 0.85
```

### Input / Filter field

```
background:     var(--color-surface-2)
border:         1px solid var(--color-border)
border-radius:  var(--radius-sm)
color:          var(--color-text)
placeholder:    var(--color-text-faint)
padding:        6px 10px
font-size:      var(--text-sm)

focus:
  border-color: var(--color-accent)
  outline:      none
  box-shadow:   0 0 0 2px rgba(127,90,240,0.25)
```

### Card / Panel

```
background:     var(--color-surface)
border:         1px solid var(--color-border)
border-radius:  var(--radius-lg)
padding:        var(--space-4) var(--space-6)
box-shadow:     var(--shadow-sm)
```

### Tab (Board / Data)

```
Inactive:
  color:        var(--color-text-muted)
  background:   transparent
  border-bottom: 2px solid transparent

Active:
  color:        var(--color-text)
  border-bottom: 2px solid var(--color-accent)
  font-weight:  600
```

### Table (DataTable)

```
Header row:
  background:       var(--color-surface)
  color:            var(--color-text-muted)
  font-size:        var(--text-xs)
  font-weight:      600
  text-transform:   uppercase
  letter-spacing:   0.05em
  border-bottom:    1px solid var(--color-border)
  position:         sticky; top: 0

Data row:
  background:       var(--color-bg)
  border-bottom:    1px solid var(--color-border)

  :hover
    background:     var(--color-surface-2)

Row number cell:
  background:       var(--color-surface)
  color:            var(--color-text-faint)
  font-family:      var(--font-mono)
  font-size:        var(--text-xs)
  width:            48px
  text-align:       center

Cell (editable) — normal:
  color:            var(--color-text)
  font-size:        var(--text-sm)
  padding:          8px 12px

Cell — editing mode:
  outline:          2px solid var(--color-accent)
  background:       var(--color-accent-muted)
  border-radius:    var(--radius-sm)

Number cell:
  font-family:      var(--font-mono)
  text-align:       right
  color:            var(--color-text)
```

### Chart Widget (Dashboard)

```
Container:
  background:       var(--color-surface)
  border:           1px solid var(--color-border)
  border-radius:    var(--radius-lg)
  padding:          var(--space-4)

Title:
  font-size:        var(--text-sm)
  font-weight:      600
  color:            var(--color-text)
  margin-bottom:    var(--space-3)

Chart colors:      dùng --chart-1 đến --chart-6 theo thứ tự
Grid lines:        color: var(--color-border), opacity: 0.5
Axis text:         color: var(--color-text-muted), font-size: 11px
```

### Chat Bubble

```
User message:
  background:       var(--color-accent-muted)
  border:           1px solid rgba(127,90,240,0.3)
  color:            var(--color-text)
  border-radius:    var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)
  align-self:       flex-end

AI message:
  background:       var(--color-surface)
  border:           1px solid var(--color-border)
  color:            var(--color-text-muted)
  border-radius:    var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)
  align-self:       flex-start

Success indicator (✅):
  color:            var(--color-success)

Error indicator (❌):
  color:            var(--color-error)
```

---

## 7. Layout Tổng Thể

```
┌─────────────────────────────────────────────────────────┐
│  Header: Logo + Upload CSV button          (height: 56px)│
├──────────────────────────────────┬──────────────────────┤
│                                  │                       │
│   Main Content Area              │   Chat Panel          │
│   (Board tab / Data tab)         │   (fixed 280px)       │
│                                  │                       │
│   Board: Chart type selector     │   Message list        │
│          Dashboard grid          │   Input box           │
│                                  │                       │
│   Data:  DataTable editable      │                       │
│                                  │                       │
└──────────────────────────────────┴──────────────────────┘
```

### Chi tiết layout

```
--sidebar-width: 280px   (chat panel)
--header-height: 56px

Header:
  background:       var(--color-surface)
  border-bottom:    1px solid var(--color-border)
  padding:          0 var(--space-6)
  display:          flex; align-items: center; justify-content: space-between

Chat panel:
  background:       var(--color-surface)
  border-left:      1px solid var(--color-border)
  width:            var(--sidebar-width)
  height:           calc(100vh - var(--header-height))
  overflow-y:       auto

Main content:
  background:       var(--color-bg)
  flex: 1
  overflow-y:       auto
  padding:          var(--space-6)
```

---

## 8. Trạng thái & Feedback

### Toast / Notification

```
Success:  background #1a2e25, border-left 3px solid var(--color-success)
Error:    background #2e1a1f, border-left 3px solid var(--color-error)
Màu text: var(--color-text)
border-radius: var(--radius-md)
padding: var(--space-3) var(--space-4)
```

### Empty State

```
Icon:   color var(--color-text-faint), size 48px
Title:  var(--color-text-muted), var(--text-base)
Desc:   var(--color-text-faint), var(--text-sm)
```

### Loading Skeleton

```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg,
    var(--color-surface) 25%,
    var(--color-surface-2) 50%,
    var(--color-surface) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
```

---

## 9. Checklist cho Agent

Trước khi apply design:

- [ ] Thêm CSS variables vào `globals.css` hoặc `theme.css`
- [ ] Load font Inter + JetBrains Mono qua Google Fonts
- [ ] Xóa toàn bộ màu hardcode (`#fff`, `black`, `gray-*` Tailwind) — thay bằng CSS variables
- [ ] Kiểm tra contrast: text trên background tối phải đạt WCAG AA (4.5:1)
- [ ] Number columns trong DataTable dùng `font-mono` + `text-right`
- [ ] Chart colors dùng đúng thứ tự `--chart-1` → `--chart-6`
- [ ] Không dùng `border-left` màu accent trên card (AI aesthetic anti-pattern)
- [ ] Không dùng gradient button

---

## 10. Yêu cầu bổ sung từ developer

> Điền vào đây nếu có yêu cầu thêm (ví dụ: thay đổi font, muốn light mode, v.v.)

