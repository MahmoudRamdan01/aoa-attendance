import { supabase } from "./supabase";

// Shared approvals data layer (redesign 3.3): AdminDashboard and the
// ApprovalsInbox view MUST issue identical queries and RPC calls, so both go
// through these helpers. Server-side authorization is unchanged — decide_*_v1
// are owner-guarded RPCs.
export function pendingPermissionsQuery() {
  return supabase.from("permissions").select("*, employees(name)").eq("status", "pending").order("perm_date");
}

export function pendingLeavesQuery() {
  return supabase
    .from("leave_requests")
    .select("*, employees!leave_requests_employee_id_fkey(name), cover:employees!leave_requests_cover_employee_id_fkey(name)")
    .eq("status", "pending")
    .order("from_date");
}

export function decidePermissionRpc({ id, approve, hoursApproved, note }) {
  return supabase.rpc("decide_permission_v1", {
    p_id: id,
    p_approve: approve,
    p_hours_approved: hoursApproved,
    p_note: approve ? "تمت الموافقة" : (note || "تم الرفض"),
  });
}

export function decideLeaveRpc({ id, approve, note }) {
  return supabase.rpc("decide_leave_v1", {
    p_id: id,
    p_approve: approve,
    p_note: approve ? "تمت الموافقة" : (note || "تم الرفض"),
  });
}
