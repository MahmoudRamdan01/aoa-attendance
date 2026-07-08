import { useCallback, useMemo } from "react"
import { useNavigate } from "react-router"
import { LOGIN_PATH } from "@/const"
import { useAuthContext } from "@/providers/AuthProvider"

export function useAuth() {
  const navigate = useNavigate()
  const auth = useAuthContext()

  const logout = useCallback(async () => {
    await auth.signOut()
    navigate(LOGIN_PATH)
  }, [auth, navigate])

  return useMemo(
    () => ({
      user: auth.session?.user ?? null,
      context: auth.context,
      role: auth.role,
      isAdmin: auth.isAdmin,
      hasEmployeePortal: auth.hasEmployeePortal,
      displayName: auth.displayName,
      unread: auth.unread,
      isAuthenticated: !!auth.session,
      isLoading: auth.loading,
      refresh: auth.refreshContext,
      refreshUnread: auth.refreshUnread,
      logout,
    }),
    [auth, logout],
  )
}
