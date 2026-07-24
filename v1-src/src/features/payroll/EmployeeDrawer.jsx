import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useBackClose } from "../../app/router";
import EmployeeStatement from "./EmployeeStatement";

// Phase 9 (07-desktop-spec.md §Employee drawer): the desktop detail surface,
// opened from every employee row (team / admin / owner payroll).
//
// It renders the REAL `EmployeeStatement` locked to one employee rather than
// re-querying anything, so the drawer's numbers are the statement's numbers
// by construction (spec: "bind to EmployeeStatement's real data — do not
// invent fields"), both payroll modes stay correct, and the CSV export keeps
// working untouched.
export default function EmployeeDrawer({ employee, onClose, onToast }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Browser Back closes the drawer (same helper the sheets use).
  useBackClose(Boolean(employee), onClose);

  useEffect(() => {
    if (!employee) return undefined;
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      // Keep tab order inside the drawer while it is open.
      const focusables = panelRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Focus returns to the row that opened the drawer.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [employee, onClose]);

  if (!employee) return null;

  const name = String(employee.name || "").trim();
  const meta = [employee.role, employee.department, employee.hired_at ? `تعيين ${employee.hired_at}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="emp-drawer-backdrop" onMouseDown={onClose} />
      <aside
        className="emp-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`كشف حساب ${name}`}
      >
        <header className="emp-drawer-head">
          <span className="emp-drawer-avatar" aria-hidden="true">{name.charAt(0) || "؟"}</span>
          <span className="emp-drawer-id">
            <strong>{name}</strong>
            {meta ? <span>{meta}</span> : null}
          </span>
          <button
            type="button"
            className="ops-icon-btn"
            ref={closeRef}
            onClick={onClose}
            aria-label="إغلاق"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="emp-drawer-body">
          <EmployeeStatement
            onToast={onToast}
            fixedEmployeeId={employee.id}
            fixedEmployeeName={name}
          />
        </div>
      </aside>
    </>
  );
}
