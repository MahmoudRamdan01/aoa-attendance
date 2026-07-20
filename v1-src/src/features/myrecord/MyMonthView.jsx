import { useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, Clock3, FileSpreadsheet, History, UserCheck, UserX } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";

import { csvCell, downloadTextFile, fmtTime12 } from "../../lib/format";
import { statusLabels } from "../../lib/labels";
import { Metric, StatusBadge } from "../../ui/legacy";

function weekdayName(date) {
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function Sparkline({ data, width = 120, height = 28 }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const points = data
    .map((value, index) => {
      const x = data.length > 1 ? (index / (data.length - 1)) * width : width / 2;
      const y = height - (value / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} style={{ direction: "ltr", flex: "0 0 auto" }}>
      <polyline fill="none" stroke="#F59E0B" strokeWidth="2" points={points} />
    </svg>
  );
}

function MyMonthView({ context, onToast }) {
  const employee = context?.employee;
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

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
    const deductions = rows.reduce(
      (sum, row) => sum + Number(row.deduction_days || 0) + (row.status === "absent" ? 1 : 0),
      0
    );
    return { present, lateCount: lateRows.length, lateMinutes, absent, leave, deductions };
  }, [rows]);

  const spark = useMemo(() => rows.map((row) => Number(row.late_minutes || 0)), [rows]);

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
      <section className="panel">
        <div className="panel-title between">
          <div><History size={20} /><h2>سجلي الشهري</h2></div>
          <div className="toolbar">
            <input type="month" value={month} max={todayIso().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />
            <button className="secondary" onClick={exportMonthCsv} disabled={loading || rows.length === 0}>
              <FileSpreadsheet size={16} /> Excel
            </button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="أيام حضور" value={summary.present} tone="ok" icon={UserCheck} />
          <Metric label="تأخير" value={summary.lateCount} sub={`${summary.lateMinutes} دقيقة إجمالًا`} tone="warn" icon={Clock3} />
          <Metric label="غياب" value={summary.absent} tone="danger" icon={UserX} />
          <Metric label="أجازة/مأمورية" value={summary.leave} tone="info" icon={CalendarDays} />
          <Metric label="خصومات" value={summary.deductions.toFixed(2)} sub="يوم" tone="gold" icon={Banknote} />
        </div>
        {employee?.leave_balance != null && (
          <p className="muted">رصيد أجازاتك المتبقي: {employee.leave_balance} يوم</p>
        )}
        {spark.some((value) => value > 0) && (
          <p className="muted">
            اتجاه دقائق التأخير خلال الشهر: <Sparkline data={spark} />
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-title"><CalendarDays size={20} /><h2>تفاصيل الأيام</h2></div>
        <div className="table-wrap sticky-table">
          <table>
            <thead>
              <tr><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>تأخير</th><th>خصم</th><th>ملاحظتي</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="8">جارٍ التحميل...</td></tr>}
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

export default MyMonthView;
