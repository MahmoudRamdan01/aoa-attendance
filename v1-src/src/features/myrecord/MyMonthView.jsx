import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, History } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";

import { csvCell, downloadTextFile, fmtTime12 } from "../../lib/format";
import { statusLabels } from "../../lib/labels";
import { StatusBadge } from "../../ui/legacy";
import { SkeletonTableRows } from "../../ui/primitives";
import PayslipCard from "./PayslipCard";

function weekdayName(date) {
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

const monthNameFormat = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" });
function monthLabel(month) {
  try {
    return monthNameFormat.format(new Date(`${month}-01T00:00:00Z`));
  } catch {
    return month;
  }
}

function shiftMonth(month, delta) {
  const [year, mon] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return next.toISOString().slice(0, 7);
}

// Worked duration for a day row ("8:38 س") from the bare time columns.
function workedHours(row) {
  if (!row.check_in || !row.check_out) return "";
  const start = new Date(`${row.work_date}T${String(row.check_in).slice(0, 8)}`);
  const end = new Date(`${row.work_date}T${String(row.check_out).slice(0, 8)}`);
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} س`;
}

function daySubline(row) {
  if (row.status === "late") return `تأخير ${row.late_minutes || 0} دقيقة`;
  if (row.status === "absent") return "غياب";
  if (["leave", "mission", "sick"].includes(row.status)) return statusLabels[row.status] || row.status;
  const worked = workedHours(row);
  return worked ? `يوم كامل · ${worked}` : statusLabels[row.status] || row.status;
}

function MyMonthView({ context, onToast }) {
  const employee = context?.employee;
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentMonth = todayIso().slice(0, 7);

  const range = useMemo(() => {
    const [year, mon] = month.split("-").map(Number);
    return {
      from: `${month}-01`,
      to: new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10),
    };
  }, [month]);

  useEffect(() => {
    if (!employee?.id) return;
    setLoading(true);
    supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("work_date", range.from)
      .lte("work_date", range.to)
      .order("work_date")
      .then(({ data, error }) => {
        if (error) onToast?.("تعذر تحميل سجل الشهر.");
        setRows(data || []);
        setLoading(false);
      });
  }, [employee?.id, range.from, range.to]);

  const summary = useMemo(() => {
    const present = rows.filter((row) => row.check_in).length;
    const lateRows = rows.filter((row) => row.status === "late");
    const absent = rows.filter((row) => row.status === "absent").length;
    const leave = rows.filter((row) => ["leave", "mission", "sick"].includes(row.status)).length;
    const lateMinutes = lateRows.reduce((sum, row) => sum + Number(row.late_minutes || 0), 0);
    return { present, lateCount: lateRows.length, lateMinutes, absent, leave };
  }, [rows]);

  function exportMonthCsv() {
    const header = ["التاريخ", "اليوم", "الحالة", "حضور", "انصراف", "دقائق تأخير", "خصم أيام", "ملاحظتي"];
    const lines = rows.map((row) =>
      [
        row.work_date,
        weekdayName(row.work_date),
        statusLabels[row.status] || row.status,
        row.check_in || "",
        row.check_out || "",
        row.late_minutes || 0,
        row.deduction_days || 0,
        row.employee_note || "",
      ].map(csvCell).join(",")
    );
    downloadTextFile(`my-month-${month}.csv`, "\ufeff" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  return (
    <div className="stack">
      {/* Month selector + summary chips (spec E-1/E-2) */}
      <section className="panel">
        <div className="panel-title between">
          <div><History size={20} /><h2>سجلي الشهري</h2></div>
          <button className="secondary" onClick={exportMonthCsv} disabled={loading || rows.length === 0}>
            <FileSpreadsheet size={16} /> Excel
          </button>
        </div>
        <div className="month-selector">
          <button type="button" className="month-chevron" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="الشهر السابق">
            <ChevronRight size={17} aria-hidden="true" />
          </button>
          <strong>{monthLabel(month)}</strong>
          <button
            type="button"
            className="month-chevron"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= currentMonth}
            aria-label="الشهر التالي"
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="month-chips">
          <MonthChip tone="ok" value={summary.present} label="حضور" />
          <MonthChip tone="warn" value={summary.lateCount} label="تأخير" />
          <MonthChip tone="danger" value={summary.absent} label="غياب" />
          <MonthChip tone="info" value={summary.leave} label="إجازة" />
        </div>
        {employee?.leave_balance != null && (
          <p className="muted">رصيد أجازاتك المتبقي: {employee.leave_balance} يوم</p>
        )}
      </section>

      {/* كشف راتبي (spec E-3) — hides itself when salary isn't readable */}
      <PayslipCard employeeId={employee?.id} month={month} monthLabel={monthLabel(month)} attendanceRows={rows} />

      {/* Day list (spec E-4): cards on mobile, table on wide screens */}
      <section className="panel">
        <div className="panel-title"><CalendarDays size={20} /><h2>تفاصيل الأيام</h2></div>

        <div className="day-list">
          {loading && <p className="muted">جارٍ تحميل السجل…</p>}
          {!loading && rows.length === 0 && <p className="muted">لا توجد سجلات في هذا الشهر.</p>}
          {!loading && rows.map((row) => (
            <div className="day-row" key={row.id || row.work_date}>
              <div className="day-row-copy">
                <strong>{weekdayName(row.work_date)} <bdi dir="ltr">{row.work_date.slice(8)}/{row.work_date.slice(5, 7)}</bdi></strong>
                <span>{daySubline(row)}</span>
              </div>
              {row.check_in ? (
                <span className="day-row-times">
                  {fmtTime12(row.check_in)} {row.check_out ? `← ${fmtTime12(row.check_out)}` : ""}
                </span>
              ) : null}
              <StatusBadge status={row.status} />
            </div>
          ))}
        </div>

        <div className="table-wrap sticky-table day-table">
          <table>
            <thead>
              <tr><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>تأخير</th><th>خصم</th><th>ملاحظتي</th></tr>
            </thead>
            <tbody>
              {loading && <SkeletonTableRows colSpan={8} />}
              {!loading && rows.length === 0 && <tr><td colSpan="8">لا توجد سجلات في هذا الشهر.</td></tr>}
              {!loading && rows.map((row) => (
                <tr key={row.id || row.work_date}>
                  <td dir="ltr">{row.work_date}</td>
                  <td>{weekdayName(row.work_date)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td dir="ltr">{fmtTime12(row.check_in) || "-"}</td>
                  <td dir="ltr">{fmtTime12(row.check_out) || "-"}</td>
                  <td>{row.late_minutes || 0} د</td>
                  <td>{row.deduction_days || 0}</td>
                  <td className="note-cell">{row.employee_note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MonthChip({ tone, value, label }) {
  return (
    <div className={`month-chip tone-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default MyMonthView;
