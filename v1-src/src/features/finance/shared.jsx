import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ConfirmDialog, PromptDialog } from "../../ui/primitives";

// Owner edit modal, reused by every finance view. `fields` describe the
// inputs; onSubmit gets a { name: value } object. Wraps ConfirmDialog so it
// inherits the focus trap, Esc/Back dismissal and backdrop.
function FinanceEditModal({ open, title, fields = [], busy = false, onSubmit, onCancel }) {
  const [values, setValues] = useState({});
  useEffect(() => {
    if (open) setValues(Object.fromEntries(fields.map((f) => [f.name, f.value ?? ""])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  return (
    <ConfirmDialog
      open={open}
      title={title}
      confirmLabel="حفظ التعديل"
      cancelLabel="إلغاء"
      busy={busy}
      onConfirm={() => onSubmit?.(values)}
      onCancel={onCancel}
    >
      <div className="form" style={{ marginBlock: "6px 14px" }}>
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.type === "select" ? (
              <select value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)}>
                {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                type={f.type || "text"}
                value={values[f.name] ?? ""}
                min={f.min}
                step={f.step}
                placeholder={f.placeholder}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
          </label>
        ))}
      </div>
    </ConfirmDialog>
  );
}

// Current auth uid — used to decide which rows HR can self-void (same-day rule).
function useUid() {
  const [uid, setUid] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id || null));
  }, []);
  return uid;
}

// In-app replacement for the old prompt()-based voidFinancial helper. Views
// call requestVoid(kind, id) and render {voidDialog} once in their tree.
function useVoidDialog(onToast, reload) {
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const requestVoid = (kind, id) => setTarget({ kind, id });

  async function submit(reason) {
    if (!target) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("void_financial_v1", {
      p_kind: target.kind,
      p_id: target.id,
      p_reason: reason,
    });
    setBusy(false);
    if (error || data?.error) {
      onToast(data?.message || "تعذر الإلغاء.");
      return;
    }
    setTarget(null);
    onToast("تم الإلغاء.");
    reload();
  }

  const voidDialog = (
    <PromptDialog
      open={Boolean(target)}
      title="إلغاء القيد"
      message="سبب الإلغاء إلزامي ويُسجَّل في سجل المراجعة."
      label="سبب الإلغاء"
      required
      multiline
      tone="danger"
      confirmLabel="تأكيد الإلغاء"
      cancelLabel="رجوع"
      busy={busy}
      onSubmit={submit}
      onCancel={() => { if (!busy) setTarget(null); }}
    />
  );

  return { requestVoid, voidDialog };
}

// The owner's name is hidden from HR wherever it appears as an actor/holder in
// finance entries — HR sees the amount, not that it's the owner's.
// The owner records finance entries under a few name spellings (Arabic
// «محمود», Latin «Mahmoud», and the linked-account label «الإدارة»). Any of
// them must read as «الإدارة» for non-owners so HR never sees it's the owner.
const OWNER_MASK_NAMES = new Set(["محمود", "mahmoud", "الإدارة"]);
function maskActor(name, role) {
  if (role !== "owner" && name && OWNER_MASK_NAMES.has(name.trim().toLowerCase())) return "الإدارة";
  return name;
}

export { useUid, useVoidDialog, maskActor, FinanceEditModal };
