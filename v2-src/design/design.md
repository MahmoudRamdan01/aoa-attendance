# AOI HR & Attendance System - Design Document

## Project Info

- **Name**: AOI HR & Attendance Dashboard
- **Category**: HR Management / Attendance System
- **Style Tags**: Professional, Corporate, Data-Dense, Bilingual (Arabic/English)
- **Interaction Complexity**: High (multi-page dashboard with charts, tables, forms, filters)
- **Language**: Arabic (primary), English (secondary) - RTL layout

## Design Overview

A comprehensive HR and attendance management dashboard for Air Ocean Line (AOI). The design follows a professional corporate aesthetic with a dark sidebar navigation and light content area. The interface is data-dense with multiple chart types, KPI cards, data tables, and form elements. The visual hierarchy prioritizes quick information scanning through color-coded metrics, progress indicators, and clear typographic scale.

The design balances density with clarity - each page presents substantial data while maintaining readable spacing and clear section boundaries through card-based layouts.

## Site Structure

| Page | Description | File |
|------|-------------|------|
| Login | Authentication page | login.md |
| Executive Dashboard | Main dashboard with KPIs, charts | dashboard-executive.md |
| Department Dashboard | Department performance view | dashboard-department.md |
| Employee Dashboard | Employee directory and details | dashboard-employee.md |
| Recruitment Dashboard | Hiring pipeline and metrics | dashboard-recruitment.md |
| Workforce Dashboard | Attendance and scheduling | dashboard-workforce.md |
| KPI Management | Performance indicators setup | kpi-management.md |
| Scorecard System | Employee scorecards | scorecard-system.md |
| Rewards & Penalties | Incentives and disciplinary | rewards-penalties.md |
| Reports | Report generation interface | reports.md |

---

## Colors

### Primary Palette

| Name | Hex | Usage |
|------|-----|-------|
| **Primary Yellow** | `#FCC10E` | Brand color, sidebar accent, active states, buttons, highlights |
| **Primary Dark** | `#383737` | Sidebar background, text on yellow, dark accents |
| **Dark Navy** | `#1e293b` | Sidebar header, topbar, dark UI elements |
| **Content BG** | `#f1f5f9` | Page background (light gray-blue) |
| **Card White** | `#ffffff` | Card backgrounds, content areas |

### Chart Colors (Sequential)

| Name | Hex | Usage |
|------|-----|-------|
| Chart Blue | `#1e40af` | Primary chart color |
| Chart Cyan | `#0ea5e9` | Secondary chart color |
| Chart Teal | `#14b8a6` | Tertiary chart color |
| Chart Yellow | `#FCC10E` | Quaternary chart color |
| Chart Red | `#ef4444` | Alerts, negative trends |
| Chart Green | `#22c55e` | Positive trends, success |
| Chart Orange | `#f97316` | Warnings |

### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| Success | `#22c55e` | Positive KPI change, success states |
| Danger | `#ef4444` | Negative KPI change, alerts |
| Warning | `#f97316` | Warnings, needs attention |
| Info | `#3b82f6` | Informational elements |

### Text Colors

| Name | Hex | Usage |
|------|-----|-------|
| Text Primary | `#1e293b` | Headings, primary text |
| Text Secondary | `#64748b` | Labels, secondary text |
| Text Muted | `#94a3b8` | Placeholders, hints |
| Text White | `#ffffff` | Text on dark backgrounds |

### Background Colors

| Name | Hex | Usage |
|------|-----|-------|
| Page BG | `#f1f5f9` | Main content background |
| Card BG | `#ffffff` | Card/container background |
| Sidebar BG | `#383737` | Dark sidebar |
| Hover BG | `#f8fafc` | Table row hover |
| Selected BG | `#fef9e7` | Selected row (light yellow tint) |

---

## Typography

### Font Stack

- **Primary**: `Cairo`, `Tahoma`, `Segoe UI`, sans-serif (Arabic-optimized)
- **English/Numbers**: `Inter`, `Segoe UI`, sans-serif
- **Code/Data**: `SF Mono`, `Monaco`, monospace

### Type Scale

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Page Title | 24px | 700 | 1.2 | Page headings |
| Section Title | 18px | 600 | 1.3 | Card titles, section headers |
| Card Label | 14px | 500 | 1.4 | Card subtitles, labels |
| Body | 14px | 400 | 1.5 | Standard text, descriptions |
| Small | 12px | 400 | 1.4 | Timestamps, secondary info |
| Caption | 11px | 500 | 1.3 | Badges, tags, KPI labels |
| KPI Value | 32px | 700 | 1.1 | Large metric numbers |
| KPI Delta | 14px | 600 | 1.2 | Change indicators (+/-) |

---

## Spacing

### Base Unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon padding, tight gaps |
| sm | 8px | Inline spacing, small gaps |
| md | 16px | Card padding, section gaps |
| lg | 24px | Card margins, section spacing |
| xl | 32px | Page padding, large gaps |

### Layout Dimensions

| Element | Width | Notes |
|---------|-------|-------|
| Sidebar (expanded) | 260px | Full navigation |
| Sidebar (collapsed) | 72px | Icons only |
| Content max-width | 100% | Fluid layout |
| Card grid gap | 16px | Between cards |
| Page padding | 24px | Content area padding |

---

## Layout

### Grid System

- **Primary**: CSS Grid with responsive columns
- **Dashboard grid**: `repeat(auto-fit, minmax(280px, 1fr))`
- **Charts grid**: 2-3 columns depending on complexity
- **Tables**: Full-width with horizontal scroll on mobile

### Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| >= 1280px | Full layout, 3-4 column grids |
| >= 1024px | 2-3 column grids, expanded sidebar |
| >= 768px | 2 column grids, collapsible sidebar |
| < 768px | Single column, hidden sidebar (hamburger) |

### Z-Index Hierarchy

| Layer | Z-Index | Usage |
|-------|---------|-------|
| Modal/Dialog | 1000 | Overlays |
| Dropdown/Popover | 900 | Floating menus |
| Topbar | 800 | Fixed header |
| Sidebar | 700 | Fixed navigation |
| Content | 1 | Main area |

---

## Shared Components

### Sidebar Navigation

**Expanded State:**
- **Width**: 260px
- **Background**: `#383737`
- **Direction**: RTL (right-aligned in RTL layout)
- **Position**: Fixed, full height

**Structure:**
1. **Header Section**:
   - Logo (AOI logo - yellow on dark)
   - Brand name: "AIR OCEAN LINE" in white, 16px, weight 600
   - Subtitle: "نظام الحضور والموارد البشرية" in `#94a3b8`, 12px
   - Collapse toggle button (chevron icon)

2. **Navigation Items** (scrollable):
   - Each item: Icon (20px) + Label + Optional badge
   - **Height**: 44px per item
   - **Padding**: 12px 16px
   - **Default state**: Text `#cbd5e1`, icon `#94a3b8`
   - **Hover**: Background `#4a4a4a`, text white
   - **Active**: 
     - Background: `#FCC10E`
     - Text: `#383737`
     - Icon: `#383737`
     - Left border: 3px solid `#FCC10E`
   - **Border radius**: 8px
   - **Margin**: 4px horizontal

3. **Navigation Groups**:
   - Group label: uppercase, 11px, `#64748b`, letter-spacing 0.5px
   - Padding: 16px 16px 8px

**Navigation Items (in order):**
1. 📊 لوحة التحكم التنفيذية / Executive Dashboard
2. 🏢 لوحة الأقسام / Department Dashboard
3. 👥 لوحة الموظفين / Employee Dashboard
4. 🎯 لوحة التوظيف / Recruitment Dashboard
5. 📋 لوحة القوى العاملة / Workforce Dashboard
6. 📈 إدارة المؤشرات / KPI Management
7. 📝 نظام البطاقات / Scorecard System
8. ⚖️ المكافآت والجزاءات / Rewards & Penalties
9. 📄 التقارير / Reports

**Collapsed State:**
- Width: 72px
- Icons only, centered
- Tooltip on hover showing label
- Active indicator: yellow dot or background

### Topbar

- **Height**: 64px
- **Background**: `#ffffff`
- **Border bottom**: 1px solid `#e2e8f0`
- **Position**: Fixed, top, right of sidebar
- **Padding**: 0 24px

**Left Side (in RTL - actually right side visually):**
- Page title: 20px, weight 700, `#1e293b`
- Breadcrumb: Small text, `#64748b`

**Right Side (in RTL - actually left side visually):**
- Search bar: 280px width, rounded-full, gray background
- Notification bell: Icon button with badge (red dot for unread)
- Settings gear: Icon button
- User avatar: 36px circle with initials

### KPI Card

- **Background**: `#ffffff`
- **Border radius**: 12px
- **Padding**: 20px
- **Shadow**: `0 1px 3px rgba(0,0,0,0.08)`

**Structure:**
1. **Header Row**:
   - Label (uppercase, 11px, `#64748b`, letter-spacing 0.5px)
   - Icon (32px container, rounded, light background tint)

2. **Value Row**:
   - Main value: 32px, weight 700, `#1e293b`
   - Unit/subtext: 14px, `#64748b`

3. **Delta Row**:
   - Change indicator: pill/badge
   - Positive: `#22c55e` background, green text
   - Negative: `#ef4444` background, red text
   - Text: "+2.3% vs last month"

### Data Table

- **Background**: `#ffffff`
- **Border radius**: 12px
- **Header**: Background `#f8fafc`, text `#64748b`, 12px uppercase
- **Row height**: 52px
- **Row border**: 1px solid `#f1f5f9`
- **Hover**: Background `#f8fafc`
- **Selected**: Background `#fef9e7`

**Status Badges:**
- Active/Success: `#22c55e` bg, white text, rounded-full
- Inactive: `#94a3b8` bg, white text
- Warning: `#f97316` bg, white text
- Danger: `#ef4444` bg, white text

### Chart Container

- **Background**: `#ffffff`
- **Border radius**: 12px
- **Padding**: 20px
- **Header**: Title (16px, weight 600) + optional filter dropdown
- **Chart area**: Responsive, min-height 300px

### Button Styles

**Primary:**
- Background: `#FCC10E`
- Text: `#383737`
- Border radius: 8px
- Padding: 10px 20px
- Font: 14px, weight 600
- Hover: Background `#e5ad0d`, slight scale

**Secondary:**
- Background: transparent
- Border: 1px solid `#e2e8f0`
- Text: `#1e293b`
- Hover: Background `#f8fafc`

**Danger:**
- Background: `#ef4444`
- Text: white
- Hover: Background `#dc2626`

**Ghost:**
- Background: transparent
- Text: `#64748b`
- Hover: Background `#f1f5f9`

### Form Elements

**Input:**
- Height: 42px
- Border: 1px solid `#e2e8f0`
- Border radius: 8px
- Padding: 0 12px
- Focus: Border `#FCC10E`, shadow `0 0 0 3px rgba(252, 193, 14, 0.1)`

**Select/Dropdown:**
- Same as input
- Dropdown icon on left (RTL)

**Checkbox:**
- Size: 18px
- Checked: Background `#FCC10E`, border `#FCC10E`
- Checkmark: `#383737`

---

## Shared Assets

### Logo

| Asset | Description |
|-------|-------------|
| [logo.png] | Air Ocean Line logo - yellow circle icon with box symbol, "AOI" text, on transparent background |
| [logo-tile.png] | AOI logo on yellow background, dark gray text, square format |

### Icons

Use `lucide-react` icons throughout:
- Dashboard: `LayoutDashboard`
- Department: `Building2`
- Employee: `Users`
- Recruitment: `Target`
- Workforce: `ClipboardList`
- KPI: `BarChart3`
- Scorecard: `FileText`
- Rewards: `Scale`
- Reports: `PieChart`
- Search: `Search`
- Bell: `Bell`
- Settings: `Settings`
- User: `User`
- Chevron: `ChevronLeft` / `ChevronRight`
- Trend Up: `TrendingUp`
- Trend Down: `TrendingDown`
- Alert: `AlertTriangle`
- Check: `CheckCircle2`
- More: `MoreHorizontal`

---

## Global Interactions

### Sidebar Behavior

- **Hover on nav item**: Background transitions to `#4a4a4a`, 150ms ease
- **Click nav item**: Background snaps to `#FCC10E`, text to `#383737`, 100ms
- **Collapse/Expand**: Width animates 260px <-> 72px, 250ms ease-in-out
- **Tooltip (collapsed)**: Appears after 300ms hover delay

### Page Transitions

- **Route change**: Content fades out (100ms) -> new content fades in (200ms)
- **Loading state**: Skeleton screens match card shapes

### Chart Interactions

- **Hover on data point**: Tooltip appears with formatted value
- **Legend click**: Toggle series visibility
- **Brush/Zoom**: Available on line charts (drag to zoom)

### Table Interactions

- **Row hover**: Background `#f8fafc`, 100ms transition
- **Row click**: Selects row, highlights with `#fef9e7`
- **Sort click**: Icon rotates, column sorts
- **Pagination**: Smooth page transition

### Button Interactions

- **Hover**: Scale 1.02, background darkens, 150ms ease
- **Active/Press**: Scale 0.98, 50ms
- **Focus**: Ring outline `#FCC10E`

### Form Interactions

- **Input focus**: Border color transition to `#FCC10E`, 150ms
- **Validation error**: Border `#ef4444`, shake animation (300ms)
- **Success**: Checkmark icon appears

---

## RTL (Right-to-Left) Considerations

- All layouts mirror for Arabic RTL
- Sidebar on right side
- Text alignment: right
- Icons: may need `transform: scaleX(-1)` for directional icons
- Charts: legends and labels RTL-aware
- Tables: actions column on leftmost side
- Flex direction: `row-reverse` where applicable

---

## Animations

### Entrance Animations

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| KPI Cards | Fade up (translateY: 20px -> 0) | 400ms | ease-out |
| Charts | Fade in + scale (0.95 -> 1) | 500ms | ease-out |
| Table rows | Stagger fade in (50ms delay each) | 300ms | ease-out |
| Sidebar | Slide in from right | 250ms | ease-in-out |

### Micro-interactions

| Element | Trigger | Animation | Duration |
|---------|---------|-----------|----------|
| Button | Hover | Scale 1.02 | 150ms |
| Card | Hover | Shadow deepen, translateY -2px | 200ms |
| Badge | Appear | Scale pop (0 -> 1) | 200ms |
| Toast | Enter | Slide from top + fade | 300ms |

---

## State Management

### Loading States
- Skeleton screens for cards (pulsing gray rectangles)
- Spinner for buttons during async actions
- Chart loading: gray placeholder with pulse animation

### Empty States
- Centered icon (48px, `#cbd5e1`)
- Message: "لا توجد بيانات" / "No data available"
- Optional action button

### Error States
- Red border on inputs
- Error message below input
- Toast notification for global errors
