# 06 — Hybrid map direction (Phase 8) — APPROVED FINAL for اليوم

Supersedes the ring-only layout in `02-screens-spec.md §B` (items 3–5). Everything else in `02` stands. Reference: `reference/hybrid-*.png` + prototype section at the top of `AOI Attendance Redesign.dc.html`.

Rationale: the brand identity (navy + gold) stays primary; the map-first idea from the Uber study is adopted because location IS the trust story of this app. Gold remains reserved for action + pin; zone state speaks in semantic colors only.

## New order on اليوم (EmployeeToday)
1. Date line + clock — clock reduced to `600 32px/1.1 Alexandria` (was 46px) so the map leads.
2. Status card (حضور/انصراف) — unchanged.
3. **Map card** (NEW) — see below.
4. **Check-in ring** — unchanged spec, but sits BELOW the map (`margin-top: 18px`), no overlap. Failure/success circles are now SOLID fills (`#241A22` + `1px rgba(255,107,112,.3)` / `#16302B` + `1px rgba(67,217,160,.3)`) instead of translucent, so they read cleanly.
5. Note field — unchanged.
6. **REMOVED**: standalone location chip (now inside the map) and the "تسجيل آمن — بدون صور" card (its 3 lines move into the More screen → "أمان الحضور", and the ring already says "لا تُحفظ أي صور"). Also **removed**: the "اختصاراتك" grid (duplicated bottom nav) and the requests FAB (replaced by the type grid, §F below).

## Map card spec
- Container: `height: 200px; border-radius: 16px; border: 1px solid var(--line); background: #0F1B28; overflow: hidden; margin-top: 12px;`
- **Production implementation**: real map, not decoration. Use **Leaflet + a dark raster tile source** (CARTO dark_matter or equivalent free tiles; if outbound tiles are undesirable for privacy, keep the vector-street placeholder — the prototype's grid — behind the same component API). Non-interactive gestures: `zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, keyboard: false, tap: false` → the card is a *status view*, not a pannable map (avoids stealing scroll on mobile). Tapping the card recenters on the user.
- Layers, bottom→top:
  1. tiles (or placeholder streets)
  2. **geofence circle**: center = company location, radius = configured meters. In-zone: `fill rgba(67,217,160,.08)`, `stroke rgba(67,217,160,.35)` 1.5px. Out-of-zone: `fill rgba(255,107,112,.07)`, `stroke rgba(255,107,112,.4)`. Transition color over `.45s`.
  3. **user pin**: 25px circle `var(--gold)` with `#0B1621` 8px dot + 3px×9px gold stem, `box-shadow: 0 6px 18px var(--gold-soft)`; animates position over `.55s ease` as fixes arrive.
  4. **status chip** top-right: `rgba(14,25,38,.88) + blur(8px)`, 1px border, `600 10.5px`, dot + text, colors:
     | State | text | color |
     |---|---|---|
     | in zone, good fix | `داخل نطاق الشركة · دقة ±{acc} م` | `#43D9A0` |
     | in zone, poor accuracy | `دقة GPS ضعيفة · ±{acc} م` | `#FFB84D` |
     | outside | `خارج نطاق الشركة · ~{dist} م` | `#FF6B70` |
     | no fix yet | `جارٍ تحديد موقعك…` | `var(--text-muted)` |
  5. bottom scrim `linear-gradient(180deg, transparent, rgba(11,22,33,.55))` 56px.
- Data: the EXISTING GPS sampler (`useGpsSampler` / current watcher in `EmployeeToday`) — no new geolocation calls, no new permissions. Derive `inZone`/`distance` from the SAME helper the RPC path uses so UI and server agree; never compute a second radius rule.
- The prototype's "اضغط على الخريطة لمحاكاة موقعك" hint is a **prototype-only affordance — do NOT ship it**.

## Check-in gating (must mirror server truth)
- Outside zone: the ring's primary button stays enabled but pressing it goes straight to the failure state — title `خارج نطاق الشركة`, detail `أنت على بُعد ~{dist} م — اقترب من الموقع وأعد المحاولة`, gold "إعادة المحاولة". No RPC call is fired for a known-outside fix (saves a round-trip); every OTHER failure keeps coming from the server response as before.
- Poor accuracy: existing behavior/threshold, rendered in the ring (title `دقة GPS غير كافية`).
- Never invent a distance in copy — use the computed one, rounded to 10m.

## §F Requests — type grid replaces the FAB
Above the list: heading `طلب جديد` `700 13px`, then a 4-up grid (`gap: 9px`) of buttons `padding: 13px 0; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; font: 600 10px`, icon 19px in the status color, label under it:
اعتيادية `#7DD3FC` · عارضة `#FFB84D` · مرضية `#FF6B70` · مأمورية `#B49CFF`.
Each opens the existing create-request flow with `type` preselected. Then heading `طلباتي السابقة` + the existing filtered list. (Types must be read from the app's real request-type enum; if a 5th type exists, wrap to a second row rather than hiding it.)

## §C Payroll rows — Uber-style row
Avatar becomes a **circle** (34px, `var(--surface-raised)`, Alexandria 13) and each row gains a trailing chevron (14px `var(--text-disabled)`) → opens EmployeeStatement for that employee. Row content otherwise unchanged.

## Acceptance
- Map shows the real fix; pin/chip/circle state matches what the server would decide (test: stand outside the radius → chip red, check-in blocked with the same distance the RPC would report).
- No new permission prompts; sampler lifecycle unchanged (no leaked watchers on tab switch — views stay mounted).
- Tiles fail (offline / blocked) → placeholder streets render, chip + circle + pin still correct; card never blank or spinner-locked.
- Scrolling the Today screen with a finger starting on the map still scrolls the page.
- Reduced-motion: pin/circle transitions disabled.
- `prefers-color-scheme` light theme: light tiles + same semantic colors.
