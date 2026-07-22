# 03 — Reference component code (adapt to codebase style)

Reference implementations written against the real v1 stack (`lucide-react`, `supabase`, `cls`, tokens). Adapt names/paths to project conventions; do not paste blindly. CSS goes in `features.css` (or a new `redesign.css` imported after it) using the classnames below.

## 3.1 CheckInRing — `src/features/attendance/CheckInRing.jsx`

```jsx
import { Camera, CheckCircle2, LogOut, AlertCircle } from "lucide-react";
import { cls } from "../../lib/cls";

// phase: idle | verifying | fail | in | done  (derived in EmployeeToday)
// EmployeeToday keeps ALL security logic; this is presentation only.
export default function CheckInRing({ phase, step, error, elapsed, worked,
  checkoutState, onCheckIn, onCheckOut, onRetry, disabled }) {
  return (
    <div className="ring-wrap">
      {phase === "idle" && (
        <>
          <span className="ring-halo" aria-hidden="true" />
          <button type="button" className="ring-btn ring-primary" disabled={disabled} onClick={onCheckIn}>
            <Camera size={27} aria-hidden="true" />
            <strong>تسجيل حضور</strong>
            <small>الموقع والوجه يتحقّقان تلقائيًا</small>
          </button>
        </>
      )}
      {phase === "verifying" && (
        <div className="ring-btn ring-verify" role="status" aria-live="polite">
          <span className="ring-dots"><i /><i /><i /></span>
          <strong>{step}</strong>
          <small>لا تُحفظ أي صور</small>
        </div>
      )}
      {phase === "fail" && (
        <div className="ring-btn ring-fail" role="alert">
          <AlertCircle size={21} aria-hidden="true" />
          <strong>{error.title}</strong>
          <small>{error.detail}</small>
          <button type="button" className="ring-retry" onClick={onRetry}>إعادة المحاولة</button>
        </div>
      )}
      {phase === "in" && (
        <button type="button" className="ring-btn ring-out" onClick={onCheckOut} disabled={!checkoutState.open}>
          <small>مدة العمل حتى الآن</small>
          <strong className="ring-elapsed" dir="ltr">{elapsed}</strong>
          <span className="ring-out-cta"><LogOut size={15} aria-hidden="true" />{checkoutState.label}</span>
        </button>
      )}
      {phase === "done" && (
        <div className="ring-btn ring-done">
          <CheckCircle2 size={30} aria-hidden="true" />
          <strong>اكتمل اليوم</strong>
          <small dir="ltr">{worked}</small>
        </div>
      )}
    </div>
  );
}
```

Wiring in `EmployeeToday.jsx` (behavior unchanged): `phase` from `todayRecord` + a local `verifying` flag set around `beginCapture/submitDirect`; `step` follows the real stages (GPS sampler started → "تثبيت الموقع (GPS)…", capture sheet / RPC in flight → "التحقق من بصمة الوجه…" when `face_mode!=='off'`); catch block maps `error.code` via `ERROR_MESSAGES` into `{title, detail}` and sets `phase:"fail"` for check-in errors (others keep toast). `dayLocked` and checkout-window logic reuse existing computations (`checkoutWindowState`).

Key CSS (append):

```css
.ring-wrap{position:relative;width:var(--ring-size);height:var(--ring-size);margin:26px auto 8px}
.ring-halo{position:absolute;inset:0;border-radius:50%;border:1.5px solid var(--gold-line);animation:ringPulse 2.8s ease-out infinite}
@keyframes ringPulse{0%{transform:scale(1);opacity:.5}70%,100%{transform:scale(1.18);opacity:0}}
.ring-btn{position:absolute;inset:17px;border-radius:50%;border:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;font-family:inherit;cursor:pointer}
.ring-primary{background:radial-gradient(circle at 34% 26%,#FFDA5C,var(--gold) 62%);color:var(--gold-on);box-shadow:0 20px 50px var(--gold-soft)}
.ring-primary:active{transform:scale(.965)}
.ring-primary strong{font:700 16px/1 var(--font-body)} .ring-btn small{font:500 10px var(--font-body);opacity:.8}
.ring-verify{background:var(--surface);border:1.5px solid var(--gold-line);cursor:default}
.ring-dots i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold);margin:0 2.5px;animation:ringBlink 1s ease-in-out infinite}
.ring-dots i:nth-child(2){animation-delay:.2s}.ring-dots i:nth-child(3){animation-delay:.4s}
@keyframes ringBlink{0%,100%{opacity:1}50%{opacity:.35}}
.ring-fail{background:var(--danger-soft);color:var(--danger);cursor:default;padding:16px}
.ring-retry{margin-top:3px;height:32px;padding:0 18px;border:none;border-radius:999px;background:var(--gold);color:var(--gold-on);font:700 11.5px var(--font-body)}
.ring-out{background:var(--surface);border:1.5px solid var(--line-strong);color:var(--text)}
.ring-elapsed{font:600 24px var(--font-mono)}
.ring-out-cta{display:flex;gap:6px;align-items:center;font:700 13.5px var(--font-body);color:var(--gold-text)}
.ring-done{background:var(--success-soft);color:var(--success);cursor:default}
```

## 3.2 PulseStrip — `src/features/payroll/PulseStrip.jsx`

```jsx
import { useEffect, useState } from "react";
import { supabase, todayIso } from "../../lib/supabase";

// Realtime pulse: seed with a query, then live-update on attendance INSERT/UPDATE.
export function useTodayPulse(expectedCount) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let active = true;
    const load = () => supabase.from("attendance").select("employee_id,check_in,status")
      .eq("work_date", todayIso()).then(({ data }) => { if (active) setRows(data || []); });
    load();
    const ch = supabase.channel("pulse-today")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance",
        filter: `work_date=eq.${todayIso()}` }, load)   // re-pull: cheap at ≤50 rows
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, []);
  return {
    present: rows.filter(r => r.check_in).length,
    late: rows.filter(r => r.status === "late").length,
    absent: rows.filter(r => r.status === "absent").length,
    expected: expectedCount,
  };
}
```

RLS note: owner/hr already read all attendance rows (AdminDashboard does). If realtime isn't enabled for `attendance`, add it to the publication (`alter publication supabase_realtime add table attendance;`) — optional migration, feature degrades to load-on-mount without it.

## 3.3 ApprovalsInbox — `src/features/system/ApprovalsInbox.jsx` (new view id `inbox`)

Register in `registry.js`: `{ id:"inbox", section:"operations", accent:"attendance", ar:"بانتظار قرارك", en:"Approvals", icon:Inbox, capability:capabilities.admin, nav:false }` + `VIEW_LOADERS.inbox` in `App.jsx`. Data source = the SAME pending-requests query + approve/reject RPCs `AdminDashboard.jsx` uses today (extract into `src/lib/approvals.js`, share both). Optimistic status flip, rollback on error, toast on failure. Card/buttons per spec D. Entry points: OwnerDashboard entry card + a "بانتظار قرارك (N)" shortcut atop AdminDashboard.

## 3.4 PayslipCard — `src/features/myrecord/PayslipCard.jsx`

Inputs: `computePayroll({config, salaryRow, attendanceRows, financialTotal})` for the signed-in employee's month (queries mirror OwnerDashboard's, filtered to `employee_id`). Render per spec E-3. Hide entirely when the salary row is not readable (RLS) or config missing — never show zeros as truth.

## 3.5 Offline banner — `src/ui/OfflineBanner.jsx`
Props `{queued, syncing, onSync}`; listens to `online/offline` events; mounts once in `AppShell` under the topbar. Replaces EmployeeToday's inline sync button (keep `syncQueue` logic there, lift trigger via context/prop or a tiny event bus — dev's call).
