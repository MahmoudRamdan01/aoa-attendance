# Executive Dashboard Page

## Section: Dashboard Content

### Overview

The main executive dashboard providing a high-level overview of HR metrics, attendance statistics, department performance, and alerts. This is the landing page after login.

### Background

- Page: `#f1f5f9`
- Cards: `#ffffff`

### Layout

- **Grid**: 1-4 columns depending on viewport
- **Gap**: 16px
- **Padding**: 24px

### Elements

#### KPI Summary Cards (Top Row)

4 cards in a row (responsive: 2 on tablet, 1 on mobile):

**Card 1: Overall Attendance Rate**
- Icon: `Users` in `#22c55e` circle
- Value: "94.2%" (32px, bold)
- Target: "Target: 95%" (small, muted)
- Delta: "+1.5% vs last month" (green badge)

**Card 2: Total Employees**
- Icon: `UserCheck` in `#3b82f6` circle
- Value: "156"
- Sub: "Across 8 Departments"
- Delta: "+3 vs last month" (green)

**Card 3: Top Department**
- Icon: `Building2` in `#FCC10E` circle
- Value: "الشحن / Shipping"
- Sub: "96.8% Score"
- Delta: "+2.1% vs last month" (green)

**Card 4: Needs Attention**
- Icon: `AlertTriangle` in `#ef4444` circle
- Value: "الاستقبال / Reception"
- Sub: "78% Score"
- Delta: "-2.5% vs last month" (red)

#### Performance Trends Chart (Middle Left - 2/3 width)

- **Title**: "HR Performance Trends" / "اتجاهات الأداء"
- **Subtitle**: "Monthly attendance trends by department"
- **Chart Type**: Line chart with 4 series
- **X-axis**: Months (Jan-Dec)
- **Y-axis**: Percentage (60-100)
- **Series**: Shipping (blue), Operations (cyan), Finance (teal), Reception (yellow)
- **Legend**: Below chart, clickable to toggle
- **Tooltip**: Shows all series values for hovered month

#### Department Performance (Middle Right - 1/3 width)

- **Title**: "Department Performance" / "أداء الأقسام"
- **Chart Type**: Donut chart
- **Segments**: 5 departments with different colors
- **Center**: Total average score
- **List below**: Department names with scores (colored text)

#### Department Score Comparison (Bottom Left - 1/2 width)

- **Title**: "Department Score Comparison" / "مقارنة درجات الأقسام"
- **Chart Type**: Horizontal bar chart
- **Bars**: Each department with score
- **Arabic labels**: Right-aligned (RTL)

#### Performance Alerts (Bottom Right - 1/2 width)

- **Title**: "Performance Alerts" / "تنبيهات الأداء"
- **Alert items** (scrollable list):
  - Reception attendance below target (red)
  - Operations overtime exceeds threshold (orange)
  - Shipping retention rate improved (green)
  - Finance late arrivals increased (orange)
- Each alert: Icon + Title + Department + Actual/Target values

#### Top Performing Employees (Full Width Bottom)

- **Title**: "Top Performing Employees" / "أفضل الموظفين أداءً"
- **Table columns**: Employee, Department, Role, Score, Target, Status, Trend
- **Rows**: 5 employees with avatar, colored status badges

### Animations

- Cards: Fade up on load, staggered 100ms
- Charts: Animate drawing on load (800ms)
- Table rows: Stagger fade in (50ms each)
