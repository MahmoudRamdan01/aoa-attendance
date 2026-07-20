import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Info,
  RotateCcw,
  X,
} from "lucide-react";
import { useBackClose } from "../app/router";

export function Panel({
  as: Component = "section",
  variant = "default",
  padded = true,
  className = "",
  children,
  ...props
}) {
  return (
    <Component
      className={["ui-panel", padded && "ui-panel-pad", className].filter(Boolean).join(" ")}
      data-variant={variant}
      {...props}
    >
      {children}
    </Component>
  );
}

export function PageHeader({ eyebrow, title, description, actions, icon: Icon, className = "" }) {
  return (
    <header className={["ui-page-header", className].filter(Boolean).join(" ")}>
      <div className="ui-page-heading">
        {eyebrow ? (
          <p className="ui-page-eyebrow">
            {Icon ? <Icon size={15} aria-hidden="true" /> : null}
            <span>{eyebrow}</span>
          </p>
        ) : null}
        <h1 className="ui-page-title">{title}</h1>
        {description ? <p className="ui-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = "accent",
  icon: Icon,
  valueDir = "ltr",
  className = "",
}) {
  return (
    <article className={["ui-metric", className].filter(Boolean).join(" ")} data-tone={tone}>
      <div>
        <div className="ui-metric-label">{label}</div>
        <bdi className="ui-metric-value" dir={valueDir}>{value}</bdi>
      </div>
      {Icon ? <span className="ui-metric-icon"><Icon size={19} aria-hidden="true" /></span> : null}
      {sub ? <div className="ui-metric-sub">{sub}</div> : null}
    </article>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
  live = false,
  dot = true,
  className = "",
  ...props
}) {
  return (
    <span
      className={["ui-status-pill", className].filter(Boolean).join(" ")}
      data-tone={tone}
      data-live={live ? "true" : undefined}
      {...props}
    >
      {dot ? <span className="ui-status-dot" aria-hidden="true" /> : null}
      <span>{children}</span>
    </span>
  );
}

export function Skeleton({ width = "100%", height = 16, radius, className = "", ...props }) {
  const style = {
    inlineSize: typeof width === "number" ? `${width}px` : width,
    blockSize: typeof height === "number" ? `${height}px` : height,
    ...(radius ? { borderRadius: typeof radius === "number" ? `${radius}px` : radius } : {}),
  };

  return <span className={["ui-skeleton", className].filter(Boolean).join(" ")} style={style} aria-hidden="true" {...props} />;
}

export function EmptyState({
  title = "لا توجد بيانات بعد",
  description = "أول ما البيانات تتسجل هتظهر في المكان ده.",
  action,
  icon: Icon = Inbox,
  compact = false,
}) {
  return (
    <div className="ui-state" data-compact={compact ? "true" : undefined}>
      <span className="ui-state-icon"><Icon size={22} aria-hidden="true" /></span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action || null}
    </div>
  );
}

export function ErrorState({
  title = "حصلت مشكلة في تحميل البيانات",
  description = "جرّب تاني، ولو المشكلة مستمرة راجع اتصال الإنترنت.",
  onRetry,
  action,
  compact = false,
}) {
  return (
    <div className="ui-state" data-kind="error" data-compact={compact ? "true" : undefined} role="alert">
      <span className="ui-state-icon"><AlertCircle size={22} aria-hidden="true" /></span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action || (onRetry ? (
        <button className="ui-action" type="button" onClick={onRetry}>
          <RotateCcw size={16} aria-hidden="true" />
          أعد المحاولة
        </button>
      ) : null)}
    </div>
  );
}

function LoadingTable({ columns, rows = 5 }) {
  return (
    <div className="ui-table-scroll" aria-busy="true" aria-label="جارٍ تحميل الجدول">
      <table className="ui-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, columnIndex) => (
                <td key={column.key}>
                  <Skeleton width={`${Math.max(38, 88 - columnIndex * 7)}%`} height={12} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataTable({
  columns = [],
  rows = [],
  getRowKey = (row, index) => row?.id ?? index,
  loading = false,
  error = null,
  empty = null,
  loadingSlot = null,
  errorSlot = null,
  emptySlot = null,
  mobileCard = null,
  caption,
  className = "",
  onRetry,
  skeletonRows = 5,
}) {
  const hasMobileCards = typeof mobileCard === "function";

  if (loading) {
    return (
      <div className={["ui-table-shell", className].filter(Boolean).join(" ")}>
        {loadingSlot || <LoadingTable columns={columns} rows={skeletonRows} />}
      </div>
    );
  }

  if (error) {
    return (
      <div className={["ui-table-shell", className].filter(Boolean).join(" ")}>
        <div className="ui-table-state">
          {errorSlot || <ErrorState description={typeof error === "string" ? error : undefined} onRetry={onRetry} compact />}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className={["ui-table-shell", className].filter(Boolean).join(" ")}>
        <div className="ui-table-state">
          {emptySlot || empty || <EmptyState compact />}
        </div>
      </div>
    );
  }

  return (
    <div className={["ui-table-shell", className].filter(Boolean).join(" ")}>
      <div className={["ui-table-scroll", hasMobileCards && "has-mobile-cards"].filter(Boolean).join(" ")}>
        <table className="ui-table">
          {caption ? <caption>{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.headerClassName || column.className || undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={getRowKey(row, rowIndex)}>
                {columns.map((column) => {
                  const content = column.cell ? column.cell(row, rowIndex) : row?.[column.key];
                  return (
                    <td
                      key={column.key}
                      className={[
                        column.numeric && "ui-table-cell-num",
                        column.className,
                      ].filter(Boolean).join(" ") || undefined}
                    >
                      {column.numeric ? <bdi dir="ltr">{content}</bdi> : content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMobileCards ? (
        <div className="ui-mobile-cards has-mobile-cards">
          {rows.map((row, rowIndex) => (
            <article className="ui-mobile-card" key={getRowKey(row, rowIndex)}>
              {mobileCard(row, rowIndex)}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title = "تأكيد الإجراء",
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
  children,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  busyRef.current = busy;
  onCancelRef.current = onCancel;

  useBackClose(open, () => {
    if (!busyRef.current) onCancelRef.current?.();
  });

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    returnFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const initialTarget = cancelRef.current?.disabled ? dialogRef.current : cancelRef.current;
      initialTarget?.focus();
    });
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((node) => node.getAttribute("aria-hidden") !== "true" && !node.hasAttribute("hidden"));

      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const activeIsFocusable = focusable.includes(active);
      if (event.shiftKey && (active === first || !activeIsFocusable)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !activeIsFocusable)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected) returnTarget.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ui-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel?.();
      }}
    >
      <section
        ref={dialogRef}
        className="ui-dialog"
        role="alertdialog"
        tabIndex={-1}
        aria-modal="true"
        aria-busy={busy || undefined}
        aria-labelledby={titleId}
        aria-describedby={message ? descriptionId : undefined}
      >
        <h2 id={titleId}>{title}</h2>
        {message ? <p id={descriptionId}>{message}</p> : null}
        {children}
        <div className="ui-dialog-actions">
          <button ref={cancelRef} className="ui-action" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className="ui-action"
            data-variant={tone === "danger" ? "danger" : "primary"}
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "جارٍ التنفيذ…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

// Text-input variant of ConfirmDialog — the in-app replacement for prompt().
// Reuses ConfirmDialog's whole skeleton (portal, trap, Esc, Back, backdrop).
export function PromptDialog({
  open,
  title = "إدخال",
  message,
  label = "القيمة",
  placeholder = "",
  initialValue = "",
  required = false,
  multiline = false,
  confirmLabel = "حفظ",
  cancelLabel = "إلغاء",
  tone = "primary",
  busy = false,
  onSubmit,
  onCancel,
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  // Focus the field after ConfirmDialog's own initial-focus frame runs.
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const submit = () => {
    const trimmed = value.trim();
    if (required && !trimmed) {
      inputRef.current?.focus();
      return;
    }
    onSubmit?.(trimmed);
  };

  const Field = multiline ? "textarea" : "input";
  return (
    <ConfirmDialog
      open={open}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      tone={tone}
      busy={busy}
      onConfirm={submit}
      onCancel={onCancel}
    >
      <label className="ui-dialog-field">
        <span>{label}{required ? "" : " (اختياري)"}</span>
        <Field
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          rows={multiline ? 3 : undefined}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (!multiline && event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </label>
    </ConfirmDialog>
  );
}

export function Tabs({ items = [], active, onChange, label = "التبويبات", className = "" }) {
  const activeIndex = items.findIndex((item) => item.id === active && !item.disabled);
  const selectedIndex = activeIndex >= 0 ? activeIndex : items.findIndex((item) => !item.disabled);
  const refs = useRef([]);

  const onKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabledIndexes = items.reduce((indexes, item, index) => {
      if (!item.disabled) indexes.push(index);
      return indexes;
    }, []);
    if (!enabledIndexes.length) return;

    let nextIndex = selectedIndex >= 0 ? selectedIndex : enabledIndexes[0];
    if (event.key === "Home") nextIndex = enabledIndexes[0];
    if (event.key === "End") nextIndex = enabledIndexes[enabledIndexes.length - 1];
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const rtl = window.getComputedStyle(event.currentTarget).direction === "rtl";
      const visualDelta = event.key === "ArrowLeft" ? -1 : 1;
      const domDelta = rtl ? -visualDelta : visualDelta;
      let candidate = nextIndex;
      do {
        candidate = (candidate + domDelta + items.length) % items.length;
      } while (items[candidate]?.disabled && candidate !== nextIndex);
      nextIndex = candidate;
    }
    const next = items[nextIndex];
    if (next && !next.disabled) {
      onChange?.(next.id);
      refs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className={["ui-tabs", className].filter(Boolean).join(" ")} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => { refs.current[index] = node; }}
          className="ui-tab"
          type="button"
          role="tab"
          aria-selected={index === selectedIndex}
          aria-controls={item.controls || undefined}
          tabIndex={index === selectedIndex ? 0 : -1}
          disabled={item.disabled}
          onClick={() => onChange?.(item.id)}
        >
          {item.label}
          {item.count !== undefined ? <bdi dir="ltr"> ({item.count})</bdi> : null}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ children, className = "", label = "فلاتر البيانات", ...props }) {
  return (
    <section className={["ui-filter-bar", className].filter(Boolean).join(" ")} aria-label={label} {...props}>
      {children}
    </section>
  );
}

const toastIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
};

export function Toast({ toast, onDismiss, duration = 4200 }) {
  const normalized = useMemo(() => {
    if (!toast) return null;
    if (typeof toast === "string") return { message: toast, tone: "info" };
    return {
      message: toast.message ?? toast.body ?? "تم تنفيذ الإجراء",
      tone: toast.tone ?? "info",
      id: toast.id,
    };
  }, [toast]);

  useEffect(() => {
    if (!normalized || !duration) return undefined;
    const timer = window.setTimeout(() => onDismiss?.(), duration);
    return () => window.clearTimeout(timer);
  }, [normalized, duration, onDismiss]);

  if (!normalized) return null;
  const Icon = toastIcons[normalized.tone] || Info;

  return createPortal(
    <div className="ui-toast-region" role="region" aria-label="التنبيهات">
      <div className="ui-toast" data-tone={normalized.tone} role={normalized.tone === "danger" ? "alert" : "status"}>
        <Icon className="ui-toast-icon" size={19} aria-hidden="true" />
        <span className="ui-toast-message">{normalized.message}</span>
        <button className="ui-toast-close" type="button" onClick={onDismiss} aria-label="إغلاق التنبيه">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
