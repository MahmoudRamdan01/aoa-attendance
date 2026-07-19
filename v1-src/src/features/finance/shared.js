import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// Current auth uid — used to decide which rows HR can self-void (same-day rule).

// Current auth uid — used to decide which rows HR can self-void (same-day rule).
function useUid() {
  const [uid, setUid] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id || null));
  }, []);
  return uid;
}

async function voidFinancial(kind, id, onToast, reload) {
  const reason = prompt("سبب الإلغاء (إلزامي — يُسجَّل في السجل):");
  if (reason == null) return;
  if (!reason.trim()) {
    onToast("سبب الإلغاء إجباري.");
    return;
  }
  const { data, error } = await supabase.rpc("void_financial_v1", {
    p_kind: kind,
    p_id: id,
    p_reason: reason.trim(),
  });
  if (error || data?.error) onToast(data?.message || "تعذر الإلغاء.");
  else {
    onToast("تم الإلغاء.");
    reload();
  }
}

// The owner's name is hidden from HR wherever it appears as an actor/holder in
// finance entries — HR sees the amount, not that it's the owner's.
const OWNER_MASK_NAME = "محمود";
function maskActor(name, role) {
  if (role !== "owner" && name && name.trim() === OWNER_MASK_NAME) return "الإدارة";
  return name;
}

export { useUid, voidFinancial, maskActor };
