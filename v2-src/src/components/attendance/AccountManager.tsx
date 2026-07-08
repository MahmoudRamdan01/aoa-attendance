import { useEffect, useState } from "react"
import { UserPlus } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { roleNames, roleOptions } from "@/lib/attendance"
import type { EmployeeAccountRow, EmployeeRow, RpcResult } from "@/types/attendance"
import Panel from "./Panel"
import StatusBadge from "./StatusBadge"
import { btnPrimary, inputCls, labelCls, selectCls, tdCls, thCls, trCls } from "./styles"

export default function AccountManager() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [accounts, setAccounts] = useState<EmployeeAccountRow[]>([])
  const [form, setForm] = useState({ employeeId: "", email: "", role: "employee" })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAccounts() {
    const [emp, acc] = await Promise.all([
      supabase.from("employees").select("id,name,active").eq("active", true).order("id"),
      supabase.rpc("owner_list_employee_accounts_v1"),
    ])
    setEmployees((emp.data as EmployeeRow[]) || [])
    setAccounts((acc.data as EmployeeAccountRow[]) || [])
    const firstEmployee = (emp.data as EmployeeRow[] | null)?.[0]
    if (firstEmployee) {
      setForm((current) =>
        current.employeeId ? current : { ...current, employeeId: String(firstEmployee.id) }
      )
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc("owner_link_employee_account_v1", {
      p_employee_id: Number(form.employeeId),
      p_email: form.email,
      p_role: form.role,
    })
    setBusy(false)
    const result = data as RpcResult | null
    if (error || result?.error) {
      toast.error(result?.message || "تعذر ربط الحساب.")
      return
    }
    setForm((current) => ({ ...current, email: "" }))
    toast.success("تم ربط حساب الموظف.")
    loadAccounts()
  }

  return (
    <Panel icon={UserPlus} title="حسابات الموظفين" subtitle="ربط إيميلات الدخول بسجلات الموظفين">
      <form className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end mb-5" onSubmit={submit}>
        <label className={labelCls}>
          الموظف
          <select
            className={selectCls}
            value={form.employeeId}
            onChange={(e) => setForm((current) => ({ ...current, employeeId: e.target.value }))}
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          إيميل الحساب
          <input
            dir="ltr"
            type="email"
            className={inputCls}
            value={form.email}
            onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
            required
            placeholder="employee@airocean.com"
          />
        </label>
        <label className={labelCls}>
          الدور
          <select
            className={selectCls}
            value={form.role}
            onChange={(e) => setForm((current) => ({ ...current, role: e.target.value }))}
          >
            {roleOptions.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <button className={btnPrimary} disabled={busy}>
          {busy ? "جاري الربط..." : "ربط الحساب"}
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--c-line-soft)]">
              <th className={thCls}>الموظف</th>
              <th className={thCls}>الإيميل</th>
              <th className={thCls}>الدور</th>
              <th className={thCls}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((row) => (
              <tr key={row.employee_id} className={trCls}>
                <td className={tdCls}>{row.employee_name}</td>
                <td className={tdCls} dir="ltr">
                  {row.email || "-"}
                </td>
                <td className={tdCls}>
                  {roleNames[row.admin_role || row.role || ""] || row.admin_role || row.role || "-"}
                </td>
                <td className={tdCls}>
                  {row.user_id ? <StatusBadge status="approved" /> : "غير مربوط"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
