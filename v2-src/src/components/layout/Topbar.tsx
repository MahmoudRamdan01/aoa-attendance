import { Bell, LogOut, Menu, Moon, RefreshCcw, Sun } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { nameInitials, roleNames } from "@/lib/attendance";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const pageTitles: Record<string, { ar: string; en: string }> = {
  "/": { ar: "لوحة التحكم التنفيذية", en: "Executive Dashboard" },
  "/departments": { ar: "لوحة الأقسام", en: "Department Dashboard" },
  "/employees": { ar: "لوحة الموظفين", en: "Employee Dashboard" },
  "/recruitment": { ar: "لوحة التوظيف", en: "Recruitment Dashboard" },
  "/workforce": { ar: "لوحة القوى العاملة", en: "Workforce Dashboard" },
  "/kpi": { ar: "إدارة المؤشرات", en: "KPI Management" },
  "/scorecard": { ar: "نظام البطاقات", en: "Scorecard System" },
  "/rewards": { ar: "المكافآت والجزاءات", en: "Rewards & Penalties" },
  "/reports": { ar: "التقارير", en: "Reports" },
  "/attendance/today": { ar: "اليوم", en: "Today" },
  "/attendance/month": { ar: "سجلي", en: "My Record" },
  "/attendance/requests": { ar: "الطلبات", en: "Requests" },
  "/notifications": { ar: "الإشعارات", en: "Alerts" },
  "/training": { ar: "التدريب", en: "Training" },
  "/attendance/admin": { ar: "إدارة الحضور", en: "Attendance Admin" },
  "/owner": { ar: "لوحة Owner", en: "Owner Dashboard" },
};

interface TopbarProps {
  collapsed: boolean;
  onMobileMenu: () => void;
}

export default function Topbar({ collapsed, onMobileMenu }: TopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { displayName, role, unread, refresh, logout } = useAuth();
  const { theme, toggle } = useTheme();

  const title = pageTitles[location.pathname] || {
    ar: "لوحة التحكم",
    en: "Dashboard",
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 h-16 bg-[var(--c-panel)] border-b border-[var(--c-line)] z-[800] flex items-center justify-between px-4 sm:px-6 transition-all duration-250",
        collapsed ? "lg:mr-[72px]" : "lg:mr-[260px]"
      )}
    >
      {/* Start: mobile menu + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMobileMenu}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--c-page)] transition-colors flex-shrink-0"
        >
          <Menu className="w-5 h-5 text-[var(--c-muted)]" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-[var(--c-ink)] truncate">{title.ar}</h1>
          <p className="text-xs text-[var(--c-muted)] truncate">{title.en}</p>
        </div>
      </div>

      {/* End: actions */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Refresh context */}
        <button
          onClick={() => refresh()}
          title="تحديث"
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--c-page)] transition-colors"
        >
          <RefreshCcw className="w-4 h-4 text-[var(--c-muted)]" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === "dark" ? "الوضع الفاتح" : "الوضع الغامق"}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--c-page)] transition-colors"
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5 text-[var(--c-muted)]" />
          ) : (
            <Moon className="w-5 h-5 text-[var(--c-muted)]" />
          )}
        </button>

        {/* Notifications */}
        <button
          onClick={() => navigate("/notifications")}
          title="الإشعارات"
          className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--c-page)] transition-colors"
        >
          <Bell className="w-5 h-5 text-[var(--c-muted)]" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 bg-[var(--c-red)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 pr-1.5 sm:pr-3 border-r border-[var(--c-line)] mr-0.5 sm:mr-0 outline-none">
              <div className="w-9 h-9 rounded-full bg-[#FCC10E] flex items-center justify-center text-[#383737] font-bold text-xs">
                {nameInitials(displayName)}
              </div>
              <div className="hidden lg:block text-right">
                <div className="text-sm font-medium text-[var(--c-ink)] max-w-[140px] truncate">
                  {displayName}
                </div>
                <div className="text-[10px] text-[var(--c-muted)]">
                  {roleNames[role] || role}
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()} className="text-[var(--c-red)] focus:text-[var(--c-red)]">
              <LogOut className="w-4 h-4 ml-2" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
