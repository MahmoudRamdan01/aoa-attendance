import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw, Save, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { ConfirmDialog } from "../../ui/primitives";

const modeLabels = {
  off: "متوقف",
  warn: "مراقبة وتنبيه",
  enforce: "منع عند الفشل",
};

export default function SecuritySettings({ onToast }) {
  const [settings, setSettings] = useState({});
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [nextMode, setNextMode] = useState("");
  const [lateTiers, setLateTiers] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_security_settings_v1");
    if (error || data?.error) {
      onToast(data?.message || "تعذر تحميل إعدادات الأمان.");
      setLoading(false);
      return;
    }
    setSettings(data.settings || {});
    setMetrics(data);
    setLateTiers(JSON.stringify(data.settings?.late_tiers || [], null, 2));
    setLoading(false);
  }

  async function save(key, value) {
    setBusy(key);
    const { data, error } = await supabase.rpc("admin_set_setting", {
      p_key: key,
      p_value: value,
    });
    if (error || data?.error) onToast(data?.message || "تعذر حفظ الإعداد.");
    else {
      setSettings((current) => ({ ...current, [key]: value }));
      onToast("تم حفظ الإعداد وتسجيله في Audit Log.");
    }
    setBusy("");
  }

  async function saveLateTiers() {
    try {
      const parsed = JSON.parse(lateTiers);
      if (!Array.isArray(parsed)) throw new Error();
      await save("late_tiers", parsed);
    } catch {
      onToast("صيغة شرائح التأخير لازم تكون JSON array صحيحة.");
    }
  }

  if (loading) return <section className="panel"><p className="muted">جاري تحميل إعدادات الأمان…</p></section>;

  return (
    <div className="stack security-settings">
      <section className="panel">
        <div className="panel-title between">
          <div><ShieldCheck size={20} /><h2>أمان الحضور</h2></div>
          <button className="secondary" type="button" onClick={load}><RefreshCcw size={16} /> تحديث</button>
        </div>
        <p className="muted">كل تغيير هنا Owner-only ويتسجل في Audit Log. الانتقال الموصى به: Off ← Warn لمدة أسبوعين ← Enforce.</p>
        <div className="security-metrics">
          <div><span>تحققات وجه · 30 يوم</span><strong>{metrics.face_attempts_30d || 0}</strong></div>
          <div><span>عدم تطابق الوجه</span><strong>{metrics.face_mismatches_30d || 0}</strong></div>
          <div><span>معدل عدم التطابق</span><strong>{(Number(metrics.face_mismatch_rate || 0) * 100).toFixed(1)}%</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><ShieldCheck size={20} /><h2>وضع بصمة الوجه</h2></div>
        <div className="face-mode-options">
          {["off", "warn", "enforce"].map((mode) => (
            <button
              key={mode}
              type="button"
              data-active={settings.face_mode === mode ? "true" : undefined}
              onClick={() => setNextMode(mode)}
            >
              <strong>{modeLabels[mode]}</strong>
              <small>{mode === "off" ? "GPS فقط — بدون كاميرا" : mode === "warn" ? "يسجل ويرسل تنبيه" : "يرفض عدم التطابق"}</small>
            </button>
          ))}
        </div>
        <div className="settings-grid">
          <NumberSetting label="حد تطابق الوجه" value={settings.face_match_threshold} step="0.01" min="0" max="1" onSave={(value) => save("face_match_threshold", value)} busy={busy === "face_match_threshold"} />
          <NumberSetting label="أدنى Anti-spoof" value={settings.antispoof_min} step="0.01" min="0" max="1" onSave={(value) => save("antispoof_min", value)} busy={busy === "antispoof_min"} />
          <ToggleSetting label="اختبار الحيوية مطلوب" value={settings.liveness_required} onSave={(value) => save("liveness_required", value)} />
        </div>
        <p className="muted">لا يتم حفظ أي صور نهائيًا — التحقق ببصمة رقمية مشفرة فقط، والتسجيل المرجعي من ملف الموظف.</p>
      </section>

      <section className="panel">
        <div className="panel-title"><AlertTriangle size={20} /><h2>GPS والجهاز</h2></div>
        <div className="settings-grid">
          <NumberSetting label="حد الرفض القوي" value={settings.risk_block_threshold} min="60" step="5" onSave={(value) => save("risk_block_threshold", value)} busy={busy === "risk_block_threshold"} />
          <NumberSetting label="سقف الإشارات المتوسطة" value={settings.risk_medium_cap} min="0" max="59" step="5" onSave={(value) => save("risk_medium_cap", value)} busy={busy === "risk_medium_cap"} />
          <NumberSetting label="أقصى خطأ GPS (متر)" value={settings.max_gps_accuracy_m} min="10" step="5" onSave={(value) => save("max_gps_accuracy_m", value)} busy={busy === "max_gps_accuracy_m"} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><Save size={20} /><h2>التأخير والانصراف</h2></div>
        <div className="settings-grid">
          <NumberSetting label="فترة السماح (دقيقة)" value={settings.grace_mins} min="0" step="1" onSave={(value) => save("grace_mins", value)} busy={busy === "grace_mins"} />
          <label className="setting-control">
            <span>بداية اعتبار الانصراف طبيعيًا</span>
            <input type="time" value={String(settings.checkout_grace_to || "").slice(0, 5)} onChange={(event) => setSettings((current) => ({ ...current, checkout_grace_to: event.target.value }))} />
            <button type="button" onClick={() => save("checkout_grace_to", settings.checkout_grace_to)} disabled={busy === "checkout_grace_to"}><Save size={15} /> حفظ</button>
          </label>
        </div>
        <label className="field">
          شرائح التأخير (JSON)
          <textarea dir="ltr" rows="8" value={lateTiers} onChange={(event) => setLateTiers(event.target.value)} />
        </label>
        <button className="secondary" type="button" onClick={saveLateTiers} disabled={busy === "late_tiers"}><Save size={16} /> حفظ الشرائح</button>
      </section>

      <section className="panel security-lockout">
        <div>
          <strong>إيقاف تسجيل النسخة القديمة v1</strong>
          <span>فعّله فقط بعد أسبوع نظيف من Enforce وتأكد أن كل الأجهزة حدثت التطبيق.</span>
        </div>
        <button
          type="button"
          className={settings.v1_action_disabled ? "danger-link" : "secondary"}
          onClick={() => save("v1_action_disabled", !settings.v1_action_disabled)}
        >
          {settings.v1_action_disabled ? "إعادة فتح v1" : "إيقاف v1"}
        </button>
      </section>

      <ConfirmDialog
        open={Boolean(nextMode)}
        title="تأكيد تغيير وضع بصمة الوجه"
        message={nextMode ? `سيتم تغيير الوضع من «${modeLabels[settings.face_mode]}» إلى «${modeLabels[nextMode]}». وضع المنع قد يرفض حضورًا حقيقيًا لو لم تكتمل المعايرة.` : ""}
        confirmLabel="تأكيد التغيير"
        tone={nextMode === "enforce" ? "danger" : "primary"}
        busy={busy === "face_mode"}
        onCancel={() => setNextMode("")}
        onConfirm={async () => {
          await save("face_mode", nextMode);
          setNextMode("");
          load();
        }}
      />
    </div>
  );
}

function NumberSetting({ label, value, onSave, busy, ...inputProps }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <label className="setting-control">
      <span>{label}</span>
      <input type="number" value={draft} onChange={(event) => setDraft(event.target.value)} {...inputProps} />
      <button type="button" onClick={() => onSave(Number(draft))} disabled={busy || draft === ""}><Save size={15} /> حفظ</button>
    </label>
  );
}

function ToggleSetting({ label, value, onSave }) {
  return (
    <label className="setting-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={Boolean(value)} onChange={(event) => onSave(event.target.checked)} />
    </label>
  );
}
