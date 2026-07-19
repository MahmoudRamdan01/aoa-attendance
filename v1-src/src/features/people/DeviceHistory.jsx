import { useEffect, useState } from "react";
import { Laptop, Smartphone } from "lucide-react";
import { supabase } from "../../lib/supabase";

export default function DeviceHistory({ employee }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("trusted_devices")
      .select("id,device_id,fingerprint,label,first_seen,last_seen,seen_count")
      .eq("employee_id", employee.id)
      .order("last_seen", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setDevices(data || []);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [employee.id]);

  return (
    <section className="panel">
      <div className="panel-title"><Smartphone size={20} /><h2>الأجهزة المسجلة</h2></div>
      {loading ? <p className="muted">جارٍ التحميل…</p> : null}
      {!loading && !devices.length ? <p className="muted">لا توجد أجهزة مسجلة حتى الآن.</p> : null}
      <div className="device-history">
        {devices.map((device) => (
          <article key={device.id}>
            <span><Laptop size={18} /></span>
            <div>
              <strong>{device.label || `جهاز ${String(device.device_id).slice(0, 8)}`}</strong>
              <small>أول ظهور {new Date(device.first_seen).toLocaleDateString("ar-EG")} · آخر ظهور {new Date(device.last_seen).toLocaleString("ar-EG")}</small>
              {device.fingerprint ? <code dir="ltr">{device.fingerprint}</code> : null}
            </div>
            <bdi dir="ltr">{device.seen_count || 1}×</bdi>
          </article>
        ))}
      </div>
    </section>
  );
}
