import { useEffect, useMemo, useState } from "react";
import { Camera, ShieldAlert, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

const flagLabels = {
  gps_static: "GPS ثابت",
  gps_teleport: "قفزة GPS",
  impossible_travel: "انتقال مستحيل",
  flat_accuracy: "دقة ثابتة",
  speed_mismatch: "سرعة غير منطقية",
  new_device: "جهاز جديد",
  fingerprint_changed: "بصمة جهاز تغيّرت",
  distance_anomaly: "مسافة غير معتادة",
  face_unavailable: "الوجه غير متاح",
  face_low_similarity: "الوجه غير مطابق",
  face_liveness_failed: "الحيوية فشلت",
  face_no_embedding: "بصمة الوجه ناقصة",
};

function flattenFlags(value) {
  if (!value || typeof value !== "object") return [];
  return [...new Set(Object.values(value).flatMap((item) => Array.isArray(item) ? item : []))];
}

export default function CapturesStrip({ attendance, employees }) {
  const [urls, setUrls] = useState({});
  const [selected, setSelected] = useState(null);
  const names = useMemo(() => new Map(employees.map((employee) => [employee.id, employee.name])), [employees]);
  const captures = useMemo(() => attendance.flatMap((record) => [
    record.photo_path ? { record, path: record.photo_path, kind: "in" } : null,
    record.checkout_photo_path ? { record, path: record.checkout_photo_path, kind: "out" } : null,
  ].filter(Boolean)), [attendance]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(captures.map(async (capture) => {
      const { data } = await supabase.storage.from("attendance-captures").createSignedUrl(capture.path, 300);
      return [capture.path, data?.signedUrl || null];
    })).then((pairs) => {
      if (!cancelled) setUrls(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
  }, [captures]);

  if (!captures.length) return null;

  return (
    <section className="panel captures-strip-panel">
      <div className="panel-title">
        <Camera size={20} />
        <h2>صور اليوم</h2>
        <span className="badge">{captures.length}</span>
      </div>
      <div className="captures-strip">
        {captures.map((capture) => {
          const flags = flattenFlags(capture.record.risk_flags);
          const similarity = capture.kind === "in" ? capture.record.face_similarity_in : capture.record.face_similarity_out;
          return (
            <button key={capture.path} type="button" onClick={() => setSelected({ ...capture, flags, similarity, url: urls[capture.path] })}>
              {urls[capture.path] ? <img src={urls[capture.path]} alt="" /> : <span><Camera /></span>}
              <strong>{names.get(capture.record.employee_id) || `#${capture.record.employee_id}`}</strong>
              <small>{capture.kind === "in" ? "حضور" : "انصراف"} · خطر {capture.record.risk_score || 0}</small>
              {flags.length ? <i><ShieldAlert size={13} /> {flags.length}</i> : null}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="capture-lightbox" role="dialog" aria-modal="true" aria-label="تفاصيل صورة الحضور" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}>
          <article>
            <button type="button" className="capture-lightbox__close" onClick={() => setSelected(null)} aria-label="إغلاق"><X /></button>
            {selected.url ? <img src={selected.url} alt="صورة الحضور المحفوظة" /> : null}
            <div>
              <h3>{names.get(selected.record.employee_id)}</h3>
              <p>{selected.kind === "in" ? "صورة الحضور" : "صورة الانصراف"} · درجة المخاطر {selected.record.risk_score || 0}</p>
              <p>تطابق الوجه: {selected.similarity == null ? "غير مفعل" : `${(Number(selected.similarity) * 100).toFixed(1)}%`}</p>
              <div className="capture-flags">
                {selected.flags.length ? selected.flags.map((flag) => <span key={flag}>{flagLabels[flag] || flag}</span>) : <span>لا توجد مؤشرات خطر</span>}
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
