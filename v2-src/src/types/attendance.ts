export type Role = "employee" | "hr" | "owner"

export interface EmployeeRow {
  id: number
  name: string
  active?: boolean
  leave_balance?: number | null
}

export interface AttendanceRow {
  id?: number
  employee_id: number
  work_date: string
  status: string
  check_in?: string | null
  check_out?: string | null
  late_minutes?: number | null
  deduction_days?: number | null
  employee_note?: string | null
  hr_note?: string | null
}

export interface MyContextLocation {
  label?: string
  lat?: number | string
  lng?: number | string
  radius_m?: number | string
  radiusMeters?: number | string
}

export interface MyContextEmployee {
  id: number
  name: string
  leave_balance?: number | null
}

export interface MyContext {
  role: Role
  admin_name?: string | null
  employee: MyContextEmployee | null
  location?: MyContextLocation | null
  migration_required?: boolean
  setup_message?: string
}

export interface PermissionRow {
  id: number
  employee_id?: number
  perm_date: string
  hours?: number | null
  hours_requested?: number | null
  hours_approved?: number | null
  reason?: string | null
  status: string
  decision_note?: string | null
  decided_at?: string | null
  employees?: { name?: string } | null
}

export interface LeaveRow {
  id: number
  employee_id?: number
  from_date: string
  to_date: string
  days?: number | null
  reason?: string | null
  status: string
  decision_note?: string | null
  decided_at?: string | null
  employees?: { name?: string } | null
  cover?: { name?: string } | null
}

export interface NotificationRow {
  id: number
  title?: string | null
  body?: string | null
  category?: string | null
  priority?: string | null
  created_at: string
  created_by?: string | null
  group_id?: string | null
  read_at?: string | null
}

export interface QueuedAction {
  id: string
  kind: "in" | "out"
  qr: string
  note?: string
  location: { lat: number; lng: number; accuracy: number } | null
  deviceId: string
  at: string
}

export interface EmployeeAccountRow {
  employee_id: number
  employee_name?: string | null
  email?: string | null
  admin_role?: string | null
  role?: string | null
  user_id?: string | null
}

export interface RpcResult {
  error?: boolean | string
  message?: string
  label?: string
  count?: number
  processed?: number
  sent?: boolean
  code?: string
  [key: string]: unknown
}
