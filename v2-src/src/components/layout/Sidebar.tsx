import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Building2,
  Users,
  Target,
  ClipboardList,
  BarChart3,
  FileText,
  Scale,
  PieChart,
  ChevronRight,
  ChevronLeft,
  Clock3,
  History,
  CalendarDays,
  Bell,
  GraduationCap,
  UserCog,
  ShieldCheck,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type Audience = "all" | "employeePortal" | "admin" | "owner";

interface NavItem {
  icon: React.ElementType;
  labelAr: string;
  labelEn: string;
  path: string;
  audience: Audience;
}

interface NavGroup {
  titleAr: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    titleAr: "الحضور اليومي",
    items: [
      { icon: Clock3, labelAr: "اليوم", labelEn: "Today", path: "/attendance/today", audience: "employeePortal" },
      { icon: History, labelAr: "سجلي", labelEn: "My Record", path: "/attendance/month", audience: "employeePortal" },
      { icon: CalendarDays, labelAr: "الطلبات", labelEn: "Requests", path: "/attendance/requests", audience: "employeePortal" },
      { icon: Bell, labelAr: "الإشعارات", labelEn: "Alerts", path: "/notifications", audience: "all" },
      { icon: GraduationCap, labelAr: "التدريب", labelEn: "Training", path: "/training", audience: "all" },
      { icon: UserCog, labelAr: "إدارة الحضور", labelEn: "Attendance Admin", path: "/attendance/admin", audience: "admin" },
      { icon: ShieldCheck, labelAr: "لوحة Owner", labelEn: "Owner", path: "/owner", audience: "owner" },
    ],
  },
  {
    titleAr: "لوحات القيادة",
    items: [
      { icon: LayoutDashboard, labelAr: "لوحة التحكم التنفيذية", labelEn: "Executive Dashboard", path: "/", audience: "admin" },
      { icon: Building2, labelAr: "لوحة الأقسام", labelEn: "Department Dashboard", path: "/departments", audience: "admin" },
      { icon: Users, labelAr: "لوحة الموظفين", labelEn: "Employee Dashboard", path: "/employees", audience: "admin" },
      { icon: Target, labelAr: "لوحة التوظيف", labelEn: "Recruitment Dashboard", path: "/recruitment", audience: "admin" },
      { icon: ClipboardList, labelAr: "لوحة القوى العاملة", labelEn: "Workforce Dashboard", path: "/workforce", audience: "admin" },
      { icon: BarChart3, labelAr: "إدارة المؤشرات", labelEn: "KPI Management", path: "/kpi", audience: "admin" },
      { icon: FileText, labelAr: "نظام البطاقات", labelEn: "Scorecard System", path: "/scorecard", audience: "admin" },
      { icon: Scale, labelAr: "المكافآت والجزاءات", labelEn: "Rewards & Penalties", path: "/rewards", audience: "admin" },
      { icon: PieChart, labelAr: "التقارير", labelEn: "Reports", path: "/reports", audience: "admin" },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { role, isAdmin, hasEmployeePortal, logout } = useAuth();

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.audience === "all" ||
          (item.audience === "employeePortal" && hasEmployeePortal) ||
          (item.audience === "admin" && isAdmin) ||
          (item.audience === "owner" && role === "owner")
      ),
    }))
    .filter((group) => group.items.length > 0);

  function go(path: string) {
    navigate(path);
    onMobileClose();
  }

  const content = (isMobile: boolean) => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 h-16">
        {(!collapsed || isMobile) && (
          <div className="flex items-center gap-3 overflow-hidden">
            <img
              src="./logo.png"
              alt="AOI"
              className="w-8 h-8 object-contain flex-shrink-0"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-white text-sm font-semibold truncate leading-tight">
                AIR OCEAN LINE
              </span>
              <span className="text-[var(--c-faint)] text-[10px] truncate leading-tight">
                نظام الحضور والموارد البشرية
              </span>
            </div>
          </div>
        )}
        {collapsed && !isMobile && (
          <img
            src="./logo.png"
            alt="AOI"
            className="w-8 h-8 object-contain mx-auto"
          />
        )}
        {isMobile ? (
          <button
            onClick={onMobileClose}
            className="text-[var(--c-faint)] hover:text-white transition-colors p-1 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={onToggle}
            className="text-[var(--c-faint)] hover:text-white transition-colors p-1 flex-shrink-0"
          >
            {collapsed ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {visibleGroups.map((group) => (
          <div key={group.titleAr} className="mb-2">
            {(!collapsed || isMobile) && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-[var(--c-faint)]">
                {group.titleAr}
              </div>
            )}
            {collapsed && !isMobile && (
              <div className="mx-3 my-2 border-t border-white/10" />
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;

                return (
                  <div
                    key={item.path}
                    className="relative"
                    onMouseEnter={() => setHoveredItem(item.path)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <button
                      onClick={() => go(item.path)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 h-[44px] rounded-lg transition-all duration-150 text-right",
                        isActive
                          ? "bg-[#FCC10E] text-[#383737]"
                          : "text-[var(--c-faint2)] hover:bg-[var(--c-nav-hover)] hover:text-white"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-5 h-5 flex-shrink-0",
                          isActive ? "text-[#383737]" : "text-[var(--c-faint)]"
                        )}
                      />
                      {(!collapsed || isMobile) && (
                        <div className="flex flex-col items-start min-w-0 overflow-hidden">
                          <span className="text-sm font-medium truncate leading-tight">
                            {item.labelAr}
                          </span>
                          <span className="text-[10px] opacity-70 truncate leading-tight">
                            {item.labelEn}
                          </span>
                        </div>
                      )}
                    </button>

                    {/* Tooltip for collapsed */}
                    {collapsed && !isMobile && hoveredItem === item.path && (
                      <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-[#1e293b] text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-[900] shadow-lg pointer-events-none">
                        {item.labelAr}
                        <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-[#1e293b] rotate-45" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 space-y-3">
        <button
          onClick={logout}
          className={cn(
            "w-full flex items-center gap-2 px-3 h-[40px] rounded-lg text-[var(--c-faint2)] hover:bg-[var(--c-nav-hover)] hover:text-[var(--c-red)] transition-colors text-sm",
            collapsed && !isMobile && "justify-center px-0"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(!collapsed || isMobile) && <span>تسجيل الخروج</span>}
        </button>
        <div
          className={cn(
            "flex items-center gap-2 text-[var(--c-muted)] text-[10px]",
            collapsed && !isMobile && "justify-center"
          )}
        >
          <div className="w-2 h-2 rounded-full bg-[var(--c-green)] animate-pulse" />
          {(!collapsed || isMobile) && <span>System Active</span>}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed right-0 top-0 h-screen bg-[var(--c-nav)] z-[700] transition-all duration-250 ease-in-out hidden lg:flex flex-col",
          collapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        {content(false)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[900]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onMobileClose}
          />
          <aside className="absolute right-0 top-0 h-full w-[280px] bg-[var(--c-nav)] flex flex-col shadow-2xl">
            {content(true)}
          </aside>
        </div>
      )}
    </>
  );
}
