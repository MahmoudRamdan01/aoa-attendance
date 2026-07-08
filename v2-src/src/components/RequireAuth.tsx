import type { ReactNode } from "react"
import { Navigate } from "react-router"
import Splash from "@/components/Splash"
import { useAuthContext } from "@/providers/AuthProvider"
import type { Role } from "@/types/attendance"

/** Wraps everything that needs a signed-in user with a loaded context. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, context, loading } = useAuthContext()
  if (loading || (session && !context)) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Restricts a route to the given roles; others land on their home. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { role, hasEmployeePortal } = useAuthContext()
  if (!roles.includes(role)) {
    return <Navigate to={hasEmployeePortal ? "/attendance/today" : "/notifications"} replace />
  }
  return <>{children}</>
}

/** Employee-portal routes need an employee record; admins without one go to attendance admin. */
export function RequireEmployeePortal({ children }: { children: ReactNode }) {
  const { hasEmployeePortal, isAdmin } = useAuthContext()
  if (!hasEmployeePortal) {
    return <Navigate to={isAdmin ? "/attendance/admin" : "/notifications"} replace />
  }
  return <>{children}</>
}

/** "/" welcomes admins with the executive dashboard; employees go to Today. */
export function HomeGate({ children }: { children: ReactNode }) {
  const { isAdmin, hasEmployeePortal } = useAuthContext()
  if (!isAdmin) {
    return <Navigate to={hasEmployeePortal ? "/attendance/today" : "/notifications"} replace />
  }
  return <>{children}</>
}
