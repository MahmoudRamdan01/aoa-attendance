import { useEffect, useState } from "react";
import { supabase, todayIso } from "../../lib/supabase";

// Live "who's in right now" strip (redesign spec C-1). Seeds with a query and
// re-pulls on any attendance change today (cheap at ≤50 rows). If realtime
// isn't enabled for the attendance table the strip simply degrades to
// load-on-mount — no SQL required.
export function useTodayPulse() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let active = true;
    const load = () =>
      supabase
        .from("attendance")
        .select("employee_id,check_in,status")
        .eq("work_date", todayIso())
        .then(({ data }) => {
          if (active) setRows(data || []);
        });
    load();
    let channel = null;
    try {
      channel = supabase
        .channel("pulse-today")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "attendance", filter: `work_date=eq.${todayIso()}` },
          load
        )
        .subscribe();
    } catch {
      channel = null; // realtime unavailable → mount-time snapshot only
    }
    return () => {
      active = false;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* noop */
        }
      }
    };
  }, []);
  return {
    present: rows.filter((r) => r.check_in).length,
    late: rows.filter((r) => r.status === "late").length,
    absent: rows.filter((r) => r.status === "absent").length,
  };
}

function PulseStrip({ expected }) {
  const pulse = useTodayPulse();
  const notIn = Math.max(0, (expected || 0) - pulse.present);
  return (
    <div className="pulse-strip">
      <div className="pulse-mini">
        <span className="pulse-mini-label"><i className="pulse-live-dot" aria-hidden="true" /> بالشركة الآن</span>
        <strong><bdi dir="ltr">{pulse.present}<small>/{expected || 0}</small></bdi></strong>
      </div>
      <div className="pulse-mini">
        <span className="pulse-mini-label"><i className="pulse-dot tone-warn" aria-hidden="true" /> تأخير اليوم</span>
        <strong>{pulse.late}</strong>
      </div>
      <div className="pulse-mini">
        <span className="pulse-mini-label"><i className="pulse-dot tone-danger" aria-hidden="true" /> لم يحضر</span>
        <strong>{notIn}</strong>
      </div>
    </div>
  );
}

export default PulseStrip;
