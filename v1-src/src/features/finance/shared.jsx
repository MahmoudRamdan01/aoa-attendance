import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { PromptDialog } from "../../ui/primitives";

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
const OWNER_MASK_NAME = "محمود";
function maskActor(name, role) {
  if (role !== "owner" && name && name.trim() === OWNER_MASK_NAME) return "الإدارة";
  return name;
}

export { useUid, useVoidDialog, maskActor };
