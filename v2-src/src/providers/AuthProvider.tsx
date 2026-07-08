import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { MyContext, Role } from "@/types/attendance"

interface AuthContextValue {
  session: Session | null
  context: MyContext | null
  loading: boolean
  role: Role
  isAdmin: boolean
  hasEmployeePortal: boolean
  displayName: string
  unread: number
  refreshContext: () => Promise<void>
  refreshUnread: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [context, setContext] = useState<MyContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadContext = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const activeSession = sessionData.session
    if (!activeSession) {
      setContext(null)
      return
    }
    setLoading(true)
    const { data, error } = await supabase.rpc("get_my_context_v1")
    if (!error && data) {
      setContext(data as MyContext)
      setLoading(false)
      return
    }

    const uid = activeSession.user.id
    const { data: admin } = await supabase
      .from("app_admins")
      .select("role,name")
      .eq("user_id", uid)
      .maybeSingle()
    setContext({
      role: (admin?.role as Role) || "employee",
      admin_name: admin?.name || activeSession.user.email,
      employee: null,
      migration_required: true,
      setup_message:
        "شغّل migration v1 عشان employee portal وGPS والـ notifications يشتغلوا بالكامل.",
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session) {
      setContext(null)
      return
    }
    loadContext()
  }, [session, loadContext])

  // Daily QR auto-broadcast for hr/owner (server decides if it already ran today).
  useEffect(() => {
    if (!session || !context || context.migration_required) return
    let cancelled = false
    supabase
      .rpc("broadcast_daily_qr_v1")
      .then(({ data }) => {
        const result = data as { sent?: boolean; count?: number } | null
        if (!cancelled && result?.sent && (context.role === "hr" || context.role === "owner")) {
          toast.success(`تم إرسال QR اليوم تلقائيًا إلى ${result.count || 0} من الفريق.`)
        }
      })
      .then(undefined, () => {})
    return () => {
      cancelled = true
    }
  }, [session?.user?.id, context?.role, context?.employee?.id, context?.migration_required])

  const refreshUnread = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
    setUnread(count || 0)
  }, [])

  useEffect(() => {
    if (!session || !context || context.migration_required) return
    refreshUnread()
  }, [session?.user?.id, context?.role, refreshUnread, context?.migration_required])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setContext(null)
    setUnread(0)
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const role: Role = context?.role || "employee"
    return {
      session,
      context,
      loading,
      role,
      isAdmin: role === "hr" || role === "owner",
      hasEmployeePortal: !!context?.employee,
      displayName:
        context?.employee?.name || context?.admin_name || session?.user?.email || "",
      unread,
      refreshContext: loadContext,
      refreshUnread,
      signOut,
    }
  }, [session, context, loading, unread, loadContext, refreshUnread, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider")
  return ctx
}
