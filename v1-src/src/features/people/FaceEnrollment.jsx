import { useEffect, useState } from "react";
import { Camera, Check, Loader2, ScanFace, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import CaptureSheet, { requestCaptureSession } from "../attendance/CaptureSheet";
import { ConfirmDialog } from "../../ui/primitives";

// Enrollment is done live by HR in the employee's presence: the camera feeds
// the on-device face engine only. No photo is captured or stored anywhere —
// the server keeps just an encrypted mathematical template.
export default function FaceEnrollment({ employee, onToast }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [capture, setCapture] = useState(null);

  useEffect(() => { load(); }, [employee.id]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("face_profiles")
      .select("id,employee_id,approved,source,created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false });
    setProfiles(error ? [] : data || []);
    setLoading(false);
  }

  async function startEnrollment() {
    setBusy("camera");
    try {
      const captureSession = await requestCaptureSession({ faceMode: "warn", requireGps: false });
      setCapture(captureSession);
    } catch (error) {
      onToast(error.message || "تعذر تشغيل الكاميرا.");
    } finally {
      setBusy("");
    }
  }

  async function saveEnrollment(data) {
    if (!data.faceEmbedding?.length) throw new Error("تعذر استخراج بصمة الوجه. أعد المحاولة.");
    setBusy("save");
    try {
      const { data: result, error } = await supabase.rpc("admin_face_profile_action_v1", {
        p_action: "create",
        p_employee_id: employee.id,
        p_profile_id: null,
        p_embedding: JSON.stringify(data.faceEmbedding),
        p_photo_path: null,
      });
      if (error || result?.error) throw new Error(result?.message || error?.message || "تعذر حفظ البصمة.");
      setCapture(null);
      onToast("تمت إضافة بصمة وجه معتمدة (مشفرة — بدون أي صور).");
      await load();
    } finally {
      setBusy("");
    }
  }

  const [deleteTarget, setDeleteTarget] = useState(null);

  async function action(actionName, profile) {
    if (actionName === "delete" && deleteTarget?.id !== profile.id) {
      setDeleteTarget(profile);
      return;
    }
    setDeleteTarget(null);
    setBusy(`${actionName}:${profile.id}`);
    const { data, error } = await supabase.rpc("admin_face_profile_action_v1", {
      p_action: actionName,
      p_employee_id: employee.id,
      p_profile_id: profile.id,
      p_embedding: null,
      p_photo_path: null,
    });
    if (error || data?.error) onToast(data?.message || "تعذر تحديث بصمة الوجه.");
    else {
      onToast(actionName === "approve" ? "تم اعتماد بصمة الوجه." : "تم حذف بصمة الوجه.");
      await load();
    }
    setBusy("");
  }

  const approved = profiles.filter((profile) => profile.approved).length;

  return (
    <section className="panel face-enrollment">
      <div className="panel-title between">
        <div><ScanFace size={20} /><h2>بصمة الوجه</h2></div>
        <button className="secondary" type="button" onClick={startEnrollment} disabled={busy || approved >= 3}>
          {busy === "camera" ? <Loader2 className="spin" size={16} /> : <Camera size={16} />}
          تسجيل بصمة
        </button>
      </div>
      <p className="muted">
        <ShieldCheck size={15} /> المعتمد حاليًا: {approved} من 3 بصمات موصى بها لتقليل الرفض الخاطئ.
        سجّلها بحضور الموظف شخصيًا — لا يتم حفظ أي صور، فقط بصمة رقمية مشفرة.
      </p>
      {loading ? <p className="muted">جارٍ تحميل بصمات الوجه…</p> : null}
      {!loading && !profiles.length ? <p className="muted">لا توجد بصمة مسجلة للموظف.</p> : null}
      <div className="face-profile-grid">
        {profiles.map((profile) => (
          <article key={profile.id} className="face-profile-card" data-approved={profile.approved ? "true" : undefined}>
            <div className="face-profile-placeholder"><ScanFace /></div>
            <div>
              <strong>{profile.approved ? "معتمدة" : "بانتظار الاعتماد"}</strong>
              <small>{profile.source === "hr_capture" ? "التقاط HR" : "أول حضور"} · {new Date(profile.created_at).toLocaleDateString("ar-EG")}</small>
            </div>
            <div className="face-profile-actions">
              {!profile.approved ? (
                <button type="button" onClick={() => action("approve", profile)} disabled={busy}>
                  <Check size={15} /> اعتماد
                </button>
              ) : null}
              <button type="button" className="danger-link" onClick={() => action("delete", profile)} disabled={busy}>
                <Trash2 size={15} /> حذف
              </button>
            </div>
          </article>
        ))}
      </div>
      {capture ? (
        <CaptureSheet
          kind="enroll"
          session={capture}
          faceMode="warn"
          requireGps={false}
          onCapture={saveEnrollment}
          onCancel={() => setCapture(null)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="حذف بصمة الوجه"
        message="سيتم حذف بصمة الوجه هذه نهائيًا ولن يمكن استرجاعها."
        tone="danger"
        confirmLabel="حذف نهائيًا"
        onConfirm={() => action("delete", deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
