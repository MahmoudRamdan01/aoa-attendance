import { useMemo } from "react";
import {
  Gauge, Sparkles, CalendarRange, Trophy, Wallet, ShieldCheck, Inbox,
  TrendingUp, TrendingDown, Minus, AlertTriangle, ScanFace,
} from "lucide-react";
import { money } from "../../lib/format";
import { datesBetween } from "../../lib/dates";
import { Bar as ReBar, BarChart as ReBarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

// One compliance formula, applied to the current month AND to each historical
// month so the Pulse arrow compares like-for-like. Inputs are the raw monthly
// aggregates from owner_reports_v1; headcount = active non-exempt employees.
function complianceScore(h, headcount) {
  if (!h) return 0;
  const expected = (h.workdays || 0) * (headcount || 0);
  const present = h.present || 0;
  const late = h.late || 0;
  const absent = h.absent || 0;
  const leave = h.leave || 0;
  const coverage = expected ? Math.min(1, (present + leave) / expected) : 0;
  const punctuality = present ? Math.max(0, 1 - late / present) : 1;
  const attendanceQ = expected ? Math.max(0, 1 - absent / expected) : 1;
  return Math.round(100 * (0.5 * coverage + 0.3 * punctuality + 0.2 * attendanceQ));
}

function scoreTone(score) {
  if (score >= 85) return "ok";
  if (score >= 65) return "warn";
  return "danger";
}

const STATUS_CELL = {
  present: { cls: "hm-present", label: "حضور" },
  late: { cls: "hm-late", label: "تأخير" },
  absent: { cls: "hm-absent", label: "غياب" },
  leave: { cls: "hm-leave", label: "إجازة" },
  mission: { cls: "hm-leave", label: "مأمورية" },
  sick: { cls: "hm-leave", label: "مرضي" },
};

export default function CompanyReports({ report, rows, employees, salaries, stats, range, loading }) {
  const headcount = report?.security?.faceTotal || employees.filter((e) => !e.attendance_exempt).length;

  const pulse = useMemo(() => {
    const history = report?.history || [];
    const cur = history[history.length - 1];
    const prev = history[history.length - 2];
    const score = complianceScore(cur, headcount);
    const prevScore = prev ? complianceScore(prev, headcount) : null;
    const expected = (cur?.workdays || 0) * headcount;
    return {
      score,
      prevScore,
      delta: prevScore == null ? null : score - prevScore,
      coverage: expected ? Math.round(Math.min(1, ((cur?.present || 0) + (cur?.leave || 0)) / expected) * 100) : 0,
      punctuality: cur?.present ? Math.round(Math.max(0, 1 - (cur.late || 0) / cur.present) * 100) : 100,
      attendanceQ: expected ? Math.round(Math.max(0, 1 - (cur?.absent || 0) / expected) * 100) : 100,
    };
  }, [report, headcount]);

  // Deduction breakdown by cause (amounts, using each employee's own salary/30).
  const breakdown = useMemo(() => {
    let attendanceCost = 0;
    let absentCost = 0;
    rows.forEach((r) => {
      const per = (salaries[r.employee_id] || 0) / 30;
      attendanceCost += Number(r.deduction_days || 0) * per;
      if (r.status === "absent") absentCost += per;
    });
    const financialCost = stats.financialTotal || 0;
    const total = attendanceCost + absentCost + financialCost;
    return { attendanceCost, absentCost, financialCost, total };
  }, [rows, salaries, stats.financialTotal]);

  // Generated Arabic "story" — plain templates, no AI.
  const story = useMemo(() => {
    const facts = [];
    if (pulse.delta != null) {
      if (pulse.delta > 0) facts.push({ icon: "📈", text: `تحسّن الالتزام بمقدار ${pulse.delta} نقطة عن الشهر الماضي (${pulse.score}/100).` });
      else if (pulse.delta < 0) facts.push({ icon: "📉", text: `انخفض الالتزام بمقدار ${Math.abs(pulse.delta)} نقطة عن الشهر الماضي (${pulse.score}/100).` });
      else facts.push({ icon: "➖", text: `الالتزام ثابت مقارنةً بالشهر الماضي (${pulse.score}/100).` });
    }
    const ranked = (stats.payrollRows || []).filter((r) => !r.exempt && r.present > 0);
    const best = [...ranked].sort((a, b) => (b.present - b.late * 0.5 - b.absent) - (a.present - a.late * 0.5 - a.absent))[0];
    if (best) facts.push({ icon: "🏆", text: `${best.name} الأكثر التزامًا هذا الشهر — ${best.present} يوم حضور و${best.late} حالة تأخير.` });
    // Worst weekday for lateness
    const byDow = new Array(7).fill(0);
    rows.forEach((r) => { if (r.status === "late") byDow[new Date(`${r.work_date}T00:00:00Z`).getUTCDay()] += 1; });
    const maxDow = byDow.indexOf(Math.max(...byDow));
    if (byDow[maxDow] > 0) facts.push({ icon: "📅", text: `${WEEKDAYS_AR[maxDow]} هو الأكثر تأخيرًا خلال الشهر (${byDow[maxDow]} مرة).` });
    // "الخصومات" here = attendance penalties only (تأخير/غياب/انصراف مبكر).
    // Loan installments/canteen are repayments/other and are NOT penalties.
    const penalties = breakdown.attendanceCost + breakdown.absentCost;
    if (penalties > 0) facts.push({ icon: "💸", text: `إجمالي خصومات التأخير والغياب هذا الشهر نحو ${money(penalties)} ج.` });
    const late = stats.late || 0;
    const worst = [...ranked].sort((a, b) => b.late - a.late)[0];
    if (worst && worst.late >= 3) facts.push({ icon: "⚠️", text: `${worst.name} لديه ${worst.late} حالة تأخير هذا الشهر — يحتاج إلى متابعة.` });
    return facts;
  }, [pulse, stats, rows, breakdown]);

  // Attendance heatmap: employee × workday matrix for the period.
  const heatmap = useMemo(() => {
    const days = datesBetween(range.from, range.to).filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 5);
    const byKey = new Map();
    rows.forEach((r) => byKey.set(`${r.employee_id}|${r.work_date}`, r));
    const people = employees.filter((e) => !e.attendance_exempt);
    return { days, people, byKey };
  }, [rows, employees, range.from, range.to]);

  const historyChart = useMemo(
    () => (report?.history || []).map((h) => ({
      month: h.month.slice(5),
      "الصافي": Math.round(h.net),
      "الخصومات": Math.round((h.deductionAmount || 0) + (h.financial || 0)),
    })),
    [report]
  );

  const ranking = useMemo(() => {
    const ranked = (stats.payrollRows || []).filter((r) => !r.exempt);
    const best = [...ranked].sort((a, b) => (b.present - b.late * 0.5 - b.absent) - (a.present - a.late * 0.5 - a.absent)).slice(0, 3);
    const worst = [...ranked].filter((r) => r.late > 0 || r.absent > 0)
      .sort((a, b) => (b.late + b.absent * 2) - (a.late + a.absent * 2)).slice(0, 3);
    return { best, worst };
  }, [stats.payrollRows]);

  if (loading && !report) {
    return <section className="panel"><p className="muted">جارٍ تحميل نبض الشركة…</p></section>;
  }

  const req = report?.requests || {};
  const fin = report?.financial || {};
  const sec = report?.security || {};
  const DeltaIcon = pulse.delta == null || pulse.delta === 0 ? Minus : pulse.delta > 0 ? TrendingUp : TrendingDown;

  return (
    <div className="stack company-reports">
      <div className="grid two">
        {/* Company Pulse */}
        <section className="panel pulse-panel">
          <div className="panel-title"><Gauge size={20} /><h2>نبض الشركة</h2></div>
          <div className={`pulse-score tone-${scoreTone(pulse.score)}`}>
            <strong>{pulse.score}</strong><span>/100</span>
          </div>
          {pulse.delta != null && (
            <p className={`pulse-delta tone-${pulse.delta > 0 ? "ok" : pulse.delta < 0 ? "danger" : "muted"}`}>
              <DeltaIcon size={16} /> {pulse.delta > 0 ? "+" : ""}{pulse.delta} نقطة عن الشهر الماضي
            </p>
          )}
          <div className="pulse-bars">
            <PulseBar label="التغطية" value={pulse.coverage} />
            <PulseBar label="الانضباط (المواعيد)" value={pulse.punctuality} />
            <PulseBar label="الحضور (قلة الغياب)" value={pulse.attendanceQ} />
          </div>
          <p className="muted">درجة مركّبة: 50% تغطية + 30% مواعيد + 20% حضور.</p>
        </section>

        {/* Month Story */}
        <section className="panel">
          <div className="panel-title"><Sparkles size={20} /><h2>قصة الشهر</h2></div>
          <div className="story-list">
            {story.length === 0 && <p className="muted">لا توجد بيانات كافية لهذا الشهر بعد.</p>}
            {story.map((fact, i) => (
              <div className="story-item" key={i}><span className="story-emoji">{fact.icon}</span><p>{fact.text}</p></div>
            ))}
          </div>
        </section>
      </div>

      {/* Summary cards: financial + requests + security */}
      <div className="report-cards">
        <ReportCard icon={Wallet} tone="gold" label="مصاريف الشهر" value={`${money(fin.expensesMonth)} ج`} sub={`كانتين ${money(fin.canteenMonth)} ج`} />
        <ReportCard icon={Inbox} tone={(req.leavePending + req.permPending) > 0 ? "warn" : "ok"} label="طلبات معلقة" value={(req.leavePending || 0) + (req.permPending || 0)} sub={`متوسط الرد ${req.avgResponseHours || 0} ساعة`} />
        <ReportCard icon={ScanFace} tone={sec.faceApproved >= sec.faceTotal ? "ok" : "warn"} label="بصمات الوجه" value={`${sec.faceApproved || 0}/${sec.faceTotal || 0}`} sub="جاهزية التفعيل" />
        <ReportCard icon={AlertTriangle} tone={(sec.riskFlagsMonth || 0) > 0 ? "warn" : "ok"} label="مؤشرات مشبوهة" value={sec.riskFlagsMonth || 0} sub={`${sec.newDevicesMonth || 0} جهاز جديد`} />
      </div>

      {/* 6-month payroll history */}
      <section className="panel">
        <div className="panel-title"><CalendarRange size={20} /><h2>الصافي والخصومات — آخر 6 شهور</h2></div>
        {historyChart.length > 0 ? (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <ReBarChart data={historyChart} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} />
                <ChartTooltip formatter={(v) => `${money(v)} ج`} />
                <ReBar dataKey="الصافي" fill="#FCC107" radius={[6, 6, 0, 0]} barSize={16} />
                <ReBar dataKey="الخصومات" fill="#EF4444" radius={[6, 6, 0, 0]} barSize={16} />
              </ReBarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="muted">لا توجد بيانات.</p>}
      </section>

      {/* Deductions by cause */}
      <section className="panel">
        <div className="panel-title"><TrendingDown size={20} /><h2>الخصومات حسب السبب — {range.label}</h2></div>
        <BreakdownBar label="تأخير / انصراف مبكر" value={breakdown.attendanceCost} total={breakdown.total} tone="warn" />
        <BreakdownBar label="غياب" value={breakdown.absentCost} total={breakdown.total} tone="danger" />
        <BreakdownBar label="استقطاعات مالية (سلف/كانتين/أخرى)" value={breakdown.financialCost} total={breakdown.total} tone="gold" />
        {breakdown.total === 0 && <p className="muted">لا توجد خصومات في هذه الفترة — ممتاز 👏</p>}
      </section>

      {/* Attendance heatmap */}
      <section className="panel">
        <div className="panel-title"><CalendarRange size={20} /><h2>خريطة الحضور</h2></div>
        {heatmap.people.length > 0 && heatmap.days.length > 0 ? (
          <div className="heatmap-scroll">
            <table className="heatmap">
              <thead>
                <tr>
                  <th className="hm-name">الموظف</th>
                  {heatmap.days.map((d) => <th key={d} title={d}>{d.slice(8)}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmap.people.map((emp) => (
                  <tr key={emp.id}>
                    <td className="hm-name">{emp.name}</td>
                    {heatmap.days.map((d) => {
                      const rec = heatmap.byKey.get(`${emp.id}|${d}`);
                      const cfg = rec ? (STATUS_CELL[rec.status] || (rec.check_in ? STATUS_CELL.present : null)) : null;
                      return <td key={d} className={`hm-cell ${cfg ? cfg.cls : "hm-none"}`} title={`${emp.name} · ${d}${cfg ? " · " + cfg.label : ""}`} />;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">لا توجد بيانات في الفترة.</p>}
        <div className="heatmap-legend">
          <span><i className="hm-present" /> حضور</span>
          <span><i className="hm-late" /> تأخير</span>
          <span><i className="hm-absent" /> غياب</span>
          <span><i className="hm-leave" /> إجازة</span>
          <span><i className="hm-none" /> لم يسجل</span>
        </div>
      </section>

      {/* Compliance ranking */}
      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><Trophy size={20} /><h2>الأكثر التزامًا</h2></div>
          <div className="list">
            {ranking.best.length === 0 && <p className="muted">لا توجد بيانات.</p>}
            {ranking.best.map((r, i) => (
              <div className="list-row compact-row" key={r.employee_id}>
                <div><strong>{["🥇", "🥈", "🥉"][i]} {r.name}</strong><span>{r.present} حضور · {r.late} تأخير</span></div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title"><AlertTriangle size={20} /><h2>محتاج متابعة</h2></div>
          <div className="list">
            {ranking.worst.length === 0 && <p className="muted">لا يوجد تأخير أو غياب — 👏</p>}
            {ranking.worst.map((r) => (
              <div className="list-row compact-row" key={r.employee_id}>
                <div><strong>{r.name}</strong><span>{r.late} تأخير · {r.absent} غياب · خصم {money(r.deductionAmount + r.financialDeduction)} ج</span></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PulseBar({ label, value }) {
  return (
    <div className="pulse-bar">
      <div className="pulse-bar-head"><span>{label}</span><strong>{value}%</strong></div>
      <div className="pulse-bar-track"><div className={`pulse-bar-fill tone-${scoreTone(value)}`} style={{ width: `${Math.min(100, value)}%` }} /></div>
    </div>
  );
}

function BreakdownBar({ label, value, total, tone }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="breakdown-bar">
      <div className="breakdown-head"><span>{label}</span><strong>{money(value)} ج · {pct}%</strong></div>
      <div className="breakdown-track"><div className={`breakdown-fill tone-${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function ReportCard({ icon: Icon, tone, label, value, sub }) {
  return (
    <div className={`report-card tone-${tone}`}>
      <Icon size={20} />
      <div><span>{label}</span><strong>{value}</strong>{sub ? <small>{sub}</small> : null}</div>
    </div>
  );
}
