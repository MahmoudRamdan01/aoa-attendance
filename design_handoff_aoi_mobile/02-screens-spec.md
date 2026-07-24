# 02 — Screens spec (mobile, RTL, dark values)

All cards unless noted: `background: var(--surface); border: 1px solid var(--line); border-radius: 16px;`. Screen padding `16px`, bottom padding clears the bottom nav (`~110px`). Targets ≥ 44px.

## A. Bottom nav (AppShell)
5 slots — change `MOBILE_PRIMARY` to render **4 primary tabs + المزيد** (today owner-aware):
- employee: `today, month, requests` + المزيد
- owner: `today, owner, month, requests` + المزيد (owner ALSO has employee portal when linked; if no employee record: `owner, admin, team` as now)
- Style: bar `rgba(14,25,38,.92)` + `backdrop-filter: blur(14px)`, top hairline `var(--line-subtle)`, tab = icon 21px + label `600 10px`, active color `var(--nav-active)`, idle `var(--nav-idle)`, safe-area padding bottom.

## B. اليوم (EmployeeToday) — the flagship change
Vertical flow, centered:
1. **Date line** `400 12px var(--text-muted)` + **live clock** `600 46px Alexandria` (digits LTR span, meridiem `600 15px` muted beside).
2. **Status card**: two halves حضور/انصراف split by hairline; each: 9px status dot (`var(--success)` when set, `#3C4E5F` empty), label `400 11px muted`, value `600 14px JetBrains Mono` (time or "لم يُسجَّل").
3. **Check-in ring** 186px, centered, 26px top margin. States (replace the two buttons; same `attendance(kind)` entrypoints):
   - **idle**: pulsing halo ring (`1.5px var(--gold-line)`, keyframe scale 1→1.18 fade, 2.8s), inner 152px circle button `radial-gradient(circle at 34% 26%, #FFDA5C, var(--gold) 62%)`, text `var(--gold-on)`: camera icon 27px, "تسجيل حضور" `700 16px`, sub "الموقع والوجه يتحقّقان تلقائيًا" `500 10px @75%`. Press: scale .965.
   - **verifying**: inner circle `var(--surface)` + `1.5px var(--gold-line)` border; 3 blinking gold dots (staggered 0/.2s/.4s), step label `700 12.5px` — "تثبيت الموقع (GPS)…" → "التحقق من بصمة الوجه…" (bind to the real capture/GPS promise stages, not timers), sub "لا تُحفظ أي صور".
   - **failure** (GPS accuracy / outside / window): circle bg `rgba(255,107,112,.07)`, alert icon, title `700 12.5px var(--danger)` (e.g. "دقة GPS غير كافية"), detail `400 10px var(--text-secondary)` (reuse `ERROR_MESSAGES`), gold pill button "إعادة المحاولة" h32. Errors move FROM toast INTO the ring; toast stays for non-check-in errors.
   - **checked-in**: outline circle (`1.5px var(--line-strong)`, bg `var(--surface)`): "مدة العمل حتى الآن" `500 10.5px muted`, live `h:mm:ss` `600 24px mono`, gold row (logout icon + "تسجيل انصراف") — tap = checkout. Respect the existing checkout-window gating text states.
   - **done**: bg `rgba(67,217,160,.1)`, check icon, "اكتمل اليوم" `700 15px var(--success)`, total worked mono.
4. **Location chip** (after a fix exists): pill `600 11.5px var(--success)` bg `.1`/border `.28` — "داخل نطاق الشركة · دقة ±14 م"; outside → muted pill with distance.
5. **Note field** (existing input restyled): row card h≈46, message icon, placeholder "ملاحظة اليوم (اختياري)…". QR field stays but collapsed behind a small "إدخال كود QR" link when `qr` empty (it's optional per current copy).
6. **Security card**: title row (shield icon `var(--info)` + "تسجيل آمن — بدون صور" `700 12.5px`), 3 bullets `400 11.5px/1.6 var(--text-secondary)` (keep current copy, trimmed to 3).
7. **Offline**: persistent amber banner directly under the app topbar when `!navigator.onLine || queued>0`: wifi-off icon, "بدون اتصال — تُحفظ العمليات وتُزامَن تلقائيًا" `600 11px var(--warning)`, chip "N بالانتظار". Replaces the current inline sync button; tapping banner triggers `syncQueue()`.

## C. الرواتب والتقارير (OwnerDashboard)
Order top→bottom:
1. **Pulse strip** (NEW, above period tabs): 3 equal mini-cards — بالشركة الآن `6/8` (live green dot, blink 1.6s), تأخير اليوم, لم يحضر. Value `600 17px Alexandria`. Data: today's attendance rows (Phase 5 realtime).
2. **"بانتظار قرارك" entry card** (NEW): full-width button, bg `var(--surface-hero)`, border `var(--gold-line)`; inbox icon in gold-soft 34px tile; title `700 13px`, sub `400 11px muted` "N طلبات معلقة — اضغط للمراجعة"; chevron. → approvals inbox (D). Hidden count=0 → sub "لا توجد طلبات معلقة".
3. **Period segmented** (restyle existing tabs): pill container `var(--surface)` p4, 4 items h34, active `bg var(--surface-overlay)` text `--text`, idle muted.
4. **Hero card**: bg `var(--surface-hero)`; label "صافي المرتبات — {month}" `500 11.5px muted`; value `600 32px Alexandria var(--gold-text)` + "ج.م" `15px secondary`; sub "قبل الخصومات X ج · N موظفين نشطين" (`white-space:nowrap`); amber chip "خصومات −Y%".
5. **KPI grid 2×2** (replaces 9-metric wall; the rest moves into CompanyReports collapsible): التغطية % (green dot) / تأخيرات (amber) / بدون انصراف (red) / خصومات الفترة ج (amber). Card: dot 7px + label `500 10.5px muted`, value `600 21px Alexandria` LTR.
6. **Trend card**: keep Recharts AreaChart, restyle: single series حضور `var(--gold)` stroke 2 / fill 12%, grid `var(--line-subtle)`, last-point dot. Title `700 12.5px` "اتجاه الحضور — آخر 30 يوم", legend chip. Axis dates row `direction:ltr`.
7. **Payroll list → cards** (mobile): card list replaces the table (<640px; keep table ≥640px). Row: 34px initial tile (`var(--surface-raised)`, Alexandria 13), name `600 13px` + flags `400 10.5px/1.6 muted`, left: net `600 14px mono` + deduction label `600 10px` (`مكتمل` green / `خصم X ج` amber). Footer row `var(--surface-nested)`: "الإجمالي بعد الخصومات" + gold mono total. Loading = 3 skeleton rows (pulse, shapes match).
8. **أعلى التأخيرات**: rank tile 22px amber-soft mono, name, "N مرات · M د" mono LTR.
9. Export buttons + EmployeeStatement + AccountManager: keep, restyled to tokens.

## D. Approvals inbox (NEW view `inbox`, owner/hr)
Full screen (navigated, not popover; bell keeps notifications popover). Header: back button 36px (chevron-right) + "الإشعارات والطلبات" `600 18px Alexandria`. Section label "بانتظار قرارك". Item card: type `700 13px` + requester `600 11px secondary`; range `400 11.5px/1.6 muted`; optional note block bg `var(--surface-nested)` r10 p9-12; actions row: **قبول** solid `var(--success)`/`#0B1621` h40 r11 flex1, **رفض** ghost `1px rgba(255,107,112,.34)` text danger. Resolved → chip "تمت الموافقة ✓"/"تم الرفض". Data: pending `requests` (existing admin approval RPCs) + missing-checkout fixes; optimistic update, badge count decrements. Employee sees read-only notifications list here (or keep bell popover — dev's call, note in PR).

## E. سجلي (MyMonthView)
1. Month selector row (chevrons + "يوليو 2026" `600 12.5px`).
2. Summary chips grid ×4: حضور (green) / تأخير (amber) / غياب (red) / إجازة (blue) — value `600 18px Alexandria`, label `500 10px muted`.
3. **كشف راتبي card** (NEW, employee's own, from `computePayroll`): bg `var(--surface-hero)`; title `700 13px` + chip "تقديري"; rows label/amount (`500 12px mono`, deduction amber, amounts `white-space:nowrap; flex:none`); divider; "الصافي التقديري" + `600 20px Alexandria var(--gold-text)`. Show only if salary row visible to the user (RLS already scopes; hide on null).
4. Day list card: rows — weekday+date `600 12.5px`, subline `400 10.5px/1.6 muted` (e.g. "يوم كامل · 8:38 س", "تأخير 26 دقيقة"), times `500 11.5px mono` "8:54 ص ← 5:32 م", status chip.

## F. طلباتي (RequestsView)
Segmented الكل/المعلّقة (pill, like periods). Request cards: type `700 13px` + status chip w/ dot; range `400 11.5px/1.6 muted`; note block like D. FAB "+" 52px r18 gold, bottom-left (RTL), above nav, shadow gold-soft — opens existing create-request flow.

## G. App header (mobile topbar content)
Avatar tile 38px r12 (`var(--surface-raised)` + gold initial Alexandria), greeting "صباح/مساء الخير، {first name}" `600 14px` + role chip gold-soft `600 9.5px` (مالك/HR/موظف), subline "{company} · {weekday day month}" `400 11px muted`. Bell 42px tile + red count badge (17px, mono 10, 2px canvas ring). Keep search/refresh/theme in the more-sheet on mobile to declutter (desktop topbar unchanged).
