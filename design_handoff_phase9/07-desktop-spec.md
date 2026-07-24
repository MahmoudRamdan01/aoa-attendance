# 07 — Desktop workspace (Phase 9)

The owner/HR desktop is NOT a stretched mobile app. Same tokens, same semantics, different information density: persistent sidebar, one topbar, tables where tables belong, and a slide-over drawer for detail. Reference: `reference/desktop-*.png` + the prototype's DESKTOP section.

Target files: `src/app/AppShell.jsx` (chrome), `src/app/registry.js` (nav), plus the per-view files listed per screen. Breakpoint: `min-width: 1024px` = this layout; 768–1023px keeps the current single-column with the sidebar collapsed to icons; below 768px the mobile design (phases 1–8) is unchanged.

## Shell
- Grid `246px 1fr`, full height, no page scroll — only the content column scrolls (`overflow-y:auto`, hidden scrollbar).
- **Sidebar** (`background: var(--chrome)`, left hairline): brand tile 36px + `COMPANY.opsTitle` (JetBrains 700 12.5px, ls .06em) + subtitle; nav rendered from `groupViewsBySection(allowedViews(...))` — group header `700 9.5px var(--text-disabled)` ls .05em, item h38 r9 mx10, 6px section-accent dot + label `500 12.5px`, hover `#16283A`; **active** = `background: gold-soft; border: 1px solid gold-line; color: var(--gold-text)`. Badge (pending count) `600 9.5px` on `--danger`, mono, and a lock glyph on `private` views. Footer: avatar 32px + name + live sync line (green dot + "متصل · مزامنة الآن" / amber when offline).
- **Topbar** h62 (`var(--chrome)`, bottom hairline): view title `700 15px` + breadcrumb `الرئيسية / {section} / {view}` `400 10.5px var(--text-disabled)`; spacer; search field 250px h38 (`var(--surface)`, r10, magnifier + "بحث سريع…" + ⌘K chip) — wire to the existing command palette if present, else focus-jump between nav items; bell 40px tile with count badge → `inbox`; avatar tile 36px → account menu.
- Never render the mobile bottom nav on desktop; never render the sidebar on mobile.

## Content patterns (use these four, nothing else)
1. **Metric row** — 4 cards, `repeat(4,1fr)`, gap 12, card p14/16 r14: dot + label `500 11px muted`, value `600 24px Alexandria`.
2. **Hero + KPI card** — `--surface-hero`, big figure `600 30–32px Alexandria var(--gold-text)`, sub line, nested 4-up KPI tiles on `var(--surface-nested)`.
3. **Table** — header row `var(--surface-nested)`, `600 10px muted`; body rows h≈44 with hairline separators, hover `#16283A`, circular 30px avatar in the first cell, mono for numbers/times, status chips per `01-theme-tokens.md`. Row click → drawer. Totals row on `var(--surface-nested)` with the gold net.
4. **Right rail** — 340px column for queues, quick actions and alerts beside the main panel (`grid-template-columns: 1fr 340px`).

## Screens
| View | Layout |
|---|---|
| `today` | 1fr / 380px: map card (h340, spec 06) + status trio; right rail = clock card with the check-in **bar** (h52, not a ring — desktop is pointer-driven; same 5 phases) + آخر ٣ أيام |
| `admin` (لوحة الحضور) | Filter pills (الكل / بالشركة / يحتاج انتباه) + live chip + date meta; table: الموظف، القسم، الحالة، حضور، انصراف، الموقع، مدة. Row → drawer |
| `owner` (الرواتب) | Metric row (pulse + pending) → hero+KPI → trend (Recharts, gold single series) → detailed payroll table (الأساسي، خصم أيام، قيمة الخصم، استقطاعات، الصافي، مؤشرات + totals) with right rail = approvals queue, أعلى التأخيرات, exports |
| `inbox` | Single column max 820px; wide rows: avatar + type + requester + range + note, actions inline (قبول solid success / رفض ghost danger), resolved chip. Footer note "القرار يُسجَّل باسمك وتاريخه" |
| `team` (الموظفون) | Table: الموظف، القسم، الصفة، الأساسي، تاريخ التعيين، الحالة (نشط/موقوف) + "إضافة موظف" primary. Row → drawer |
| `treasury` / `expenses` / `partner` / `deductions` | ONE shared component (`FinanceWorkspace`): hero + 4 KPIs + "الحركات" list + right rail (إجراء سريع: تسجيل حركة، تسوية، تصدير · تنبيهات). Each view supplies title/label/kpis/rows/actions — do not fork four layouts |
| `security` | Settings rows (label + description + control) : نطاق الموقع (slider + meters), التحقق من الوجه (segmented مغلق/إلزامي), نافذة الحضور & الانصراف (two time fields each), العمل دون اتصال (switch) + save/reset; right rail = محاولات مرفوضة اليوم + بطاقة الخصوصية |
| `training` | 2-up course cards: title + إلزامي/اختياري/جديد chip, units/duration, progress bar (gold; success at 100%), "أنجز n من m" + % |
| `assistant` | 1fr / 300px: chat column h520 (bubbles: user `--surface-nested` hairline, assistant `rgba(196,167,255,.09)` + violet hairline, typing dots) + composer; right rail = أسئلة مقترحة |
| `ownerbook` (دفتر شخصي) | Centered 380px PIN gate: lock tile, 4 code boxes (active box gold border), "فتح الدفتر" primary, reset hint. Never render ledger data before unlock |
| `month` / `requests` (owner's own) | month: table (اليوم، الوصف، الأوقات، الحالة) + right rail payslip card · requests: max 820px wide rows + "طلب جديد" primary |

## Employee drawer (كشف حساب) — the desktop's detail surface
Opens from every employee row (`team`, `admin`, `owner` payroll). Overlay `rgba(6,12,20,.55)` + blur(2px); panel 520px, full height, LEFT side (RTL), `var(--chrome)`, left hairline, `box-shadow: -30px 0 70px rgba(0,0,0,.4)`, enter 220ms translate+fade. Esc / overlay click / X closes; the route gets `?emp=<id>` so a drawer is linkable and browser-back closes it (`useBackClose`).

Header: avatar 48px, name `700 15px`, meta `{role} · {dept} · تعيين {hired_at}`. Tabs pill: نظرة عامة / الحضور / المالية / الأمان.

**Bind to `EmployeeStatement`'s real data — do not invent fields.** Reuse that component's queries (`salaries`, `attendance`, `emp_loan_installments`, `canteen_entries`, `other_deductions`) and `computePayroll`; ideally extract them into `useEmployeeStatement(employeeId, from, to)` and let both the drawer and the existing page consume it.
- **نظرة عامة**: 3 tiles — التزام الحضور % (present / working days), تأخيرات (`late`, sub `${lateMinutes} دقيقة`), متوسط اليوم; hero = `net` with the deduction chip; آخر النشاط = last check-in (time + accuracy), latest late/deduction, latest request; actions "كشف حساب كامل" (opens the full `EmployeeStatement` with `fixedEmployeeId`, keeps CSV export) + "إرسال إشعار".
- **الحضور**: period-scoped day list (date, status chip, in/out `fmtTime12`, late minutes, deduction days, note) — times `white-space:nowrap`; row → **تصحيح إداري** panel (in/out fields + note) posting through the SAME admin correction path `AdminDashboard` uses, with the audit line "كل تصحيح يُسجَّل باسمك ووقته".
- **المالية**: salary breakdown honoring BOTH payroll modes (monthly: الأساسي → خصم أيام → استقطاعات → الصافي; daily-allowance: base + بدل الانتظام المكتسب (`creditedDays × dayRate`) + بدلات/مكافآت → gross → deductions → net), then `financialItems` verbatim (قسط سلفة (seq) — أصل السلفة X ج / كانتين — item / category+note) with the financial total; "إضافة" opens the existing deductions/loan forms.
- **الأمان**: face enrollment state + "إعادة تسجيل" (existing `FaceEnrollment`), trusted devices from `DeviceHistory` with "إلغاء الثقة", permission switches bound to real columns `employees.assistant_enabled` and `attendance_exempt`, then "إيقاف الحساب" (`active=false`) behind a confirm.

## Acceptance
- Every allowed view reachable from the sidebar; active state and breadcrumb correct; capability guards identical to registry (an HR user must not see `team`/`security`/`ownerbook`).
- Drawer numbers equal `EmployeeStatement` for the same employee+period (assert with one test), both payroll modes rendered correctly, and CSV export still byte-identical.
- Approving in the desktop inbox updates the bell count and the owner queue without reload (shared approvals layer).
- No horizontal page scroll at 1024/1280/1440/1920; tables degrade to the mobile card lists below 640px.
- Keyboard: Esc closes drawer, tab order stays inside it while open, focus returns to the invoking row.
- Dark + light + airocean pass; `prefers-reduced-motion` disables drawer/marker transitions.
