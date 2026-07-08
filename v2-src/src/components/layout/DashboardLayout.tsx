import { useState, type ReactNode } from "react";
import { FlaskConical, Sparkles } from "lucide-react";
import { useLocation } from "react-router";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/providers/AuthProvider";

// Modules that have no backing tables yet — everything on them is sample data.
const demoRoutes = new Set(["/departments", "/recruitment", "/kpi", "/scorecard", "/rewards"]);

interface DashboardLayoutProps {
  children: ReactNode;
}

function getInitialCollapsed() {
  try {
    return localStorage.getItem("aol-side") === "closed";
  } catch {
    return false;
  }
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { context } = useAuthContext();
  const location = useLocation();
  const isDemoRoute = demoRoutes.has(location.pathname);

  function toggleCollapsed() {
    setCollapsed((open) => {
      try {
        localStorage.setItem("aol-side", open ? "open" : "closed");
      } catch {
        /* private mode */
      }
      return !open;
    });
  }

  return (
    <div className="min-h-screen bg-[var(--c-page)]" dir="rtl">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <Topbar collapsed={collapsed} onMobileMenu={() => setMobileOpen(true)} />
      <main
        className={cn(
          "pt-16 min-h-screen transition-all duration-250",
          collapsed ? "lg:pr-[72px]" : "lg:pr-[260px]"
        )}
      >
        <div className="p-4 sm:p-6">
          {context?.migration_required && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border-r-4 border-[var(--c-orange)] bg-[var(--c-orange-bg2)] px-4 py-3 text-sm text-[var(--c-ink)]">
              <Sparkles className="w-4 h-4 text-[var(--c-orange)] flex-shrink-0" />
              <span>{context.setup_message}</span>
            </div>
          )}
          {isDemoRoute && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border-r-4 border-[var(--c-faint)] bg-[var(--c-panel-soft)] px-4 py-3 text-sm text-[var(--c-muted)]">
              <FlaskConical className="w-4 h-4 flex-shrink-0" />
              <span>
                اللوحة دي لسه بيانات تجريبية (Demo) — هتتوصل بقاعدة البيانات في مرحلة قادمة.
              </span>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
