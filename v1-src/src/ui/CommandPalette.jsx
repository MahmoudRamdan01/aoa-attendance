import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Search, UserRound, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { canAccessView } from "../app/registry";
import { useBackClose } from "../app/router";

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ar")
    .normalize("NFKD")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064b-\u065f]/g, "");
}

function matchesQuery(result, normalizedQuery) {
  if (!normalizedQuery) return true;
  return normalizeSearch(`${result.label} ${result.description || ""} ${result.en || ""}`).includes(normalizedQuery);
}

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(
    'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0);
}

export default function CommandPalette({
  open,
  onClose,
  views = [],
  actions = [],
  context,
  onNavigate,
  triggerRef,
}) {
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const optionRefs = useRef([]);
  const listId = useId();
  const canSearchEmployees = context?.role === "hr" || context?.role === "owner";
  useBackClose(open, onClose);

  useEffect(() => {
    if (!open || !canSearchEmployees) {
      setEmployees([]);
      setEmployeesError("");
      setEmployeesLoading(false);
      return undefined;
    }
    let cancelled = false;
    setEmployeesLoading(true);
    setEmployeesError("");
    supabase
      .from("employees")
      .select("id,name,active")
      .eq("active", true)
      .order("id")
      .then(({ data, error }) => {
        if (!cancelled) {
          setEmployees(data || []);
          setEmployeesError(error ? "تعذر تحميل الموظفين. الصفحات والإجراءات ما زالت متاحة." : "");
          setEmployeesLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmployees([]);
          setEmployeesError("تعذر تحميل الموظفين. الصفحات والإجراءات ما زالت متاحة.");
          setEmployeesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, canSearchEmployees]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    restoreFocusRef.current = document.activeElement;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      const restoreTarget = restoreFocusRef.current?.isConnected
        ? restoreFocusRef.current
        : triggerRef?.current;
      window.requestAnimationFrame(() => restoreTarget?.focus?.());
    };
  }, [open, triggerRef]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const groups = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    const pageResults = views
      .filter((view) => !view.capability || canAccessView(view, context))
      .map((view) => ({
        id: `view-${view.id}`,
        kind: "view",
        label: view.ar,
        en: view.en,
        description: view.section === "private" ? "مساحة خاصة بالمالك" : "صفحة في النظام",
        icon: view.icon,
        view: view.id,
      }))
      .filter((result) => matchesQuery(result, normalizedQuery));

    const actionResults = actions
      .filter((action) => !action.capability || action.capability({ context }))
      .map((action) => ({ ...action, kind: "action", id: `action-${action.id}` }))
      .filter((result) => matchesQuery(result, normalizedQuery));

    const employeeResults = employees
      .map((employee) => ({
        id: `employee-${employee.id}`,
        kind: "employee",
        label: employee.name,
        description: "فتح ملف الموظف",
        icon: UserRound,
        view: "team",
        param: employee.id,
      }))
      .filter((result) => matchesQuery(result, normalizedQuery));

    return [
      { id: "actions", label: "إجراءات سريعة", items: actionResults },
      { id: "views", label: "الصفحات", items: pageResults },
      ...(canSearchEmployees ? [{ id: "employees", label: "الموظفين", items: employeeResults }] : []),
    ].filter((group) => group.items.length);
  }, [query, views, actions, employees, canSearchEmployees, context]);

  const flatResults = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, flatResults.length - 1)));
  }, [flatResults.length]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  if (!open || typeof document === "undefined") return null;

  const selectResult = (result) => {
    if (!result) return;
    if (typeof result.onSelect === "function") result.onSelect();
    if (result.view) onNavigate?.(result.view, result.param !== undefined ? [result.param] : []);
    onClose?.();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key === "Tab") {
      const focusables = focusableElements(dialogRef.current);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(1, flatResults.length));
      inputRef.current?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + Math.max(1, flatResults.length)) % Math.max(1, flatResults.length));
      inputRef.current?.focus();
      return;
    }
    if (event.key === "Enter" && event.target === inputRef.current) {
      event.preventDefault();
      selectResult(flatResults[activeIndex]);
    }
  };

  let optionIndex = -1;
  const activeOptionId = flatResults[activeIndex]?.id ? `${listId}-${flatResults[activeIndex].id}` : undefined;

  return createPortal(
    <div
      className="ops-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className="ops-palette"
        role="dialog"
        aria-modal="true"
        aria-label="البحث السريع في النظام"
        onKeyDown={handleKeyDown}
      >
        <div className="ops-palette-search">
          <Search size={20} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            placeholder="دور على صفحة، موظف، أو إجراء…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
          <button className="ops-icon-btn" type="button" onClick={onClose} aria-label="إغلاق البحث">
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div
          className="ops-palette-results"
          id={listId}
          role="listbox"
          aria-label="نتائج البحث"
          aria-busy={employeesLoading || undefined}
        >
          {groups.map((group) => (
            <section className="ops-palette-group" key={group.id} role="group" aria-labelledby={`${listId}-${group.id}`}>
              <h2 className="ops-palette-group-title" id={`${listId}-${group.id}`}>{group.label}</h2>
              {group.items.map((result) => {
                optionIndex += 1;
                const currentIndex = optionIndex;
                const Icon = result.icon;
                return (
                  <button
                    key={result.id}
                    id={`${listId}-${result.id}`}
                    ref={(node) => { optionRefs.current[currentIndex] = node; }}
                    className={`ops-palette-result${currentIndex === activeIndex ? " is-active" : ""}`}
                    type="button"
                    role="option"
                    tabIndex="-1"
                    aria-selected={currentIndex === activeIndex}
                    onMouseMove={() => setActiveIndex(currentIndex)}
                    onClick={() => selectResult(result)}
                  >
                    <span className="ops-palette-result-icon">{Icon ? <Icon size={17} aria-hidden="true" /> : null}</span>
                    <span className="ops-palette-result-copy">
                      <strong>{result.label}</strong>
                      <span>{result.description}</span>
                    </span>
                    {result.en ? <span className="ops-kbd" lang="en" dir="ltr">{result.en}</span> : null}
                  </button>
                );
              })}
            </section>
          ))}

          {!flatResults.length ? (
            <div className="ui-state">
              <span className="ui-state-icon"><Search size={21} aria-hidden="true" /></span>
              <h3>لا توجد نتيجة مطابقة</h3>
              <p>جرّب اسم صفحة أو موظف مختلف.</p>
            </div>
          ) : null}

          {employeesLoading && canSearchEmployees ? <p className="ops-palette-group-title">جارٍ تحميل الموظفين…</p> : null}
          {employeesError && canSearchEmployees ? (
            <p className="ops-palette-inline-error" role="status">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{employeesError}</span>
            </p>
          ) : null}
        </div>

        <footer className="ops-palette-foot" aria-hidden="true">
          <span><span className="ops-kbd">↑↓</span> تنقّل</span>
          <span><span className="ops-kbd">Enter</span> فتح</span>
          <span><span className="ops-kbd">Esc</span> إغلاق</span>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
