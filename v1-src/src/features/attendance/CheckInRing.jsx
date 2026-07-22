import { AlertCircle, Camera, CheckCircle2, Lock, LogOut } from "lucide-react";

// The redesign's flagship control (spec B-3): one ring replaces the two
// check-in/checkout buttons. Pure presentation — EmployeeToday derives
// `phase` and keeps ALL security logic (GPS/face/queue/consent) unchanged.
// phase: idle | verifying | fail | in | done | locked
function CheckInRing({ phase, step, error, elapsed, worked, lockedLabel, checkoutState, onCheckIn, onCheckOut, onRetry, disabled }) {
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
          <span className="ring-dots" aria-hidden="true"><i /><i /><i /></span>
          <strong>{step}</strong>
          <small>لا تُحفظ أي صور</small>
        </div>
      )}
      {phase === "fail" && (
        <div className="ring-btn ring-fail" role="alert">
          <AlertCircle size={21} aria-hidden="true" />
          <strong>{error?.title}</strong>
          <small>{error?.detail}</small>
          <button type="button" className="ring-retry" onClick={onRetry}>إعادة المحاولة</button>
        </div>
      )}
      {phase === "in" && (
        <button type="button" className="ring-btn ring-out" onClick={onCheckOut} disabled={!checkoutState?.open}>
          <small>مدة العمل حتى الآن</small>
          <strong className="ring-elapsed" dir="ltr">{elapsed}</strong>
          <span className="ring-out-cta">
            <LogOut size={15} aria-hidden="true" />
            {checkoutState?.label}
          </span>
        </button>
      )}
      {phase === "done" && (
        <div className="ring-btn ring-done">
          <CheckCircle2 size={30} aria-hidden="true" />
          <strong>اكتمل اليوم</strong>
          <small dir="ltr">{worked}</small>
        </div>
      )}
      {phase === "locked" && (
        <div className="ring-btn ring-locked">
          <Lock size={22} aria-hidden="true" />
          <strong>{lockedLabel}</strong>
          <small>لا يمكن تسجيل حضور اليوم من التطبيق</small>
        </div>
      )}
    </div>
  );
}

export default CheckInRing;
