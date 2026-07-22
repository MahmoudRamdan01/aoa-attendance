import {
  Banknote,
  Bell,
  CalendarDays,
  Clock3,
  GraduationCap,
  History,
  Inbox,
  Receipt,
  Scale,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  Vault,
  Wallet,
} from "lucide-react";
import { COMPANY } from "../lib/company";

export const SECTION_META = {
  personal: { ar: "مساحتي", order: 10 },
  operations: { ar: "التشغيل", order: 20 },
  team: { ar: "الفريق", order: 30 },
  finance: { ar: "المالية", order: 40 },
  knowledge: { ar: "المعرفة", order: 50 },
  payroll: { ar: "الرواتب والتقارير", order: 60 },
  private: { ar: "خاص بك", order: 70, private: true },
};

export const capabilities = {
  // `context` only exists after an authenticated session has resolved. Keep
  // this guard explicit so a future caller cannot accidentally expose an
  // "all" view while auth is still loading.
  authenticated: ({ context }) => Boolean(context),
  employeePortal: ({ context }) => Boolean(context?.employee),
  admin: ({ context }) => context?.role === "hr" || context?.role === "owner",
  owner: ({ context }) => context?.role === "owner",
};

const DEFINITIONS = [
  {
    id: "today",
    section: "personal",
    accent: "home",
    ar: "اليوم",
    en: "Today",
    icon: Clock3,
    legacyKind: "employee",
    capability: capabilities.employeePortal,
    mobileSlot: "today",
  },
  {
    id: "month",
    section: "personal",
    accent: "myrecord",
    ar: "سجلي",
    en: "My Record",
    icon: History,
    legacyKind: "employee",
    capability: capabilities.employeePortal,
    mobileSlot: "record",
  },
  {
    id: "requests",
    section: "personal",
    accent: "requests",
    ar: "طلباتي",
    en: "Requests",
    icon: CalendarDays,
    legacyKind: "employee",
    capability: capabilities.employeePortal,
    mobileSlot: "requests",
  },
  {
    id: "notifications",
    section: "knowledge",
    accent: "system",
    ar: "كل الإشعارات",
    en: "Inbox",
    icon: Bell,
    legacyKind: "all",
    capability: capabilities.authenticated,
    mobileSlot: "inbox",
    nav: false,
  },
  {
    id: "training",
    section: "knowledge",
    accent: "training",
    ar: "التدريب",
    en: "Training",
    icon: GraduationCap,
    legacyKind: "all",
    // Air Ocean decision: the Training section (onboarding plan + evaluation
    // form) is owner-only. On AOL it stays available to the whole team.
    capability: (args) =>
      COMPANY.key === "airocean" ? capabilities.owner(args) : capabilities.authenticated(args),
    mobileSlot: "more",
  },
  {
    id: "assistant",
    section: "knowledge",
    accent: "assistant",
    ar: "المساعد الذكي",
    en: "AI Assistant",
    icon: Sparkles,
    legacyKind: "all",
    module: "assistant",
    // Assistant is OFF for everyone by default except the owner. The owner
    // enables it per person (employees.assistant_enabled) from the People page.
    capability: ({ context }) =>
      Boolean(context) &&
      (context.role === "owner" || context?.employee?.assistant_enabled === true),
    mobileSlot: "more",
  },
  {
    id: "deductions",
    section: "finance",
    accent: "finance",
    ar: "الاستقطاعات",
    en: "Deductions",
    icon: Banknote,
    legacyKind: "all",
    capability: capabilities.authenticated,
    mobileSlot: null,
  },
  {
    id: "expenses",
    section: "finance",
    accent: "finance",
    ar: "المصروفات",
    en: "Expenses",
    icon: Receipt,
    legacyKind: "admin",
    capability: capabilities.admin,
    mobileSlot: null,
    module: "companyFinance",
  },
  {
    id: "treasury",
    section: "finance",
    accent: "finance",
    ar: "الخزنة",
    en: "Treasury",
    icon: Vault,
    legacyKind: "admin",
    capability: capabilities.admin,
    mobileSlot: null,
    module: "companyFinance",
  },
  {
    id: "partner",
    section: "finance",
    accent: "finance",
    ar: "مديونية Air Ocean",
    en: "Partner Ledger",
    icon: Scale,
    legacyKind: "admin",
    capability: capabilities.admin,
    mobileSlot: null,
    module: "companyFinance",
  },
  {
    id: "team",
    section: "team",
    accent: "people",
    ar: "الموظفين",
    en: "People",
    icon: Users,
    legacyKind: "owner",
    // Owner decision: the People page (data, face enrollment, devices) is
    // for the owner only — HR manages the day-to-day from لوحة الحضور.
    capability: capabilities.owner,
    mobileSlot: null,
  },
  {
    id: "admin",
    section: "operations",
    accent: "attendance",
    ar: "لوحة الحضور",
    en: "Attendance Ops",
    icon: UserCog,
    legacyKind: "admin",
    capability: capabilities.admin,
    mobileSlot: null,
  },
  {
    // «الإشعارات والطلبات» (redesign spec D): the bell's destination for every
    // role — notifications for all, plus the approvals section for owner/hr.
    // Reached via the bell + the owner dashboard/admin entry cards; not in nav.
    id: "inbox",
    section: "operations",
    accent: "attendance",
    ar: "الإشعارات والطلبات",
    en: "Inbox",
    icon: Inbox,
    legacyKind: "all",
    capability: capabilities.authenticated,
    mobileSlot: null,
    nav: false,
  },
  {
    id: "security",
    section: "operations",
    accent: "attendance",
    ar: "أمان الحضور",
    en: "Attendance Security",
    icon: Settings2,
    legacyKind: "owner",
    capability: capabilities.owner,
    mobileSlot: null,
  },
  {
    id: "owner",
    section: "payroll",
    accent: "payroll",
    ar: "الرواتب والتقارير",
    en: "Payroll & Reports",
    icon: ShieldCheck,
    legacyKind: "owner",
    capability: capabilities.owner,
    mobileSlot: null,
  },
  {
    id: "ownerbook",
    section: "private",
    accent: "private-ledger",
    ar: "دفتر شخصي",
    en: "Private Ledger",
    icon: Wallet,
    legacyKind: "owner",
    capability: capabilities.owner,
    mobileSlot: null,
    private: true,
    module: "companyFinance",
  },
];

export function createViewRegistry(components = {}) {
  return DEFINITIONS
    // Views tagged with a module only exist in companies that enable it
    // (e.g. Air Ocean runs attendance/leaves/payroll without the finance pages).
    .filter((definition) => !definition.module || COMPANY.modules?.[definition.module])
    .map((definition) => ({
      ...definition,
      component: components[definition.id] || null,
    }));
}

export function canAccessView(view, context) {
  return Boolean(view?.capability?.({ context }));
}

export function allowedViews(registry, context) {
  return registry.filter((view) => canAccessView(view, context));
}

export function getFallbackView(registry, context) {
  const preferred = context?.employee
    ? "today"
    : context?.role === "owner"
      ? "owner"
      : context?.role === "hr"
        ? "admin"
        : "notifications";
  const allowed = allowedViews(registry, context);
  return allowed.find((view) => view.id === preferred)?.id || allowed[0]?.id || "notifications";
}

export function groupViewsBySection(views) {
  const groups = new Map();
  views
    .filter((view) => view.nav !== false)
    .forEach((view) => {
      if (!groups.has(view.section)) groups.set(view.section, []);
      groups.get(view.section).push(view);
    });

  return [...groups.entries()]
    .map(([id, items]) => ({ id, items, ...(SECTION_META[id] || { ar: id, order: 999 }) }))
    .sort((a, b) => a.order - b.order);
}

export function createQuickActions(context) {
  return [
    {
      id: "quick-today",
      label: "فتح حضور اليوم",
      description: "تسجيل أو متابعة حضورك اليوم",
      icon: Clock3,
      view: "today",
      capability: capabilities.employeePortal,
    },
    {
      id: "quick-team-requests",
      label: "مراجعة تشغيل الفريق",
      description: "الحضور والطلبات المعلقة والـ QR",
      icon: UserCog,
      view: "admin",
      capability: capabilities.admin,
    },
    {
      id: "quick-notification",
      label: "إرسال إشعار",
      description: "افتح مركز الإشعارات والإرسال",
      icon: Bell,
      view: "notifications",
      capability: capabilities.admin,
    },
    {
      id: "quick-payroll",
      label: "فتح كشف الرواتب",
      description: "التقارير والحسابات الخاصة بالمالك",
      icon: ShieldCheck,
      view: "owner",
      capability: capabilities.owner,
    },
    {
      id: "quick-assistant",
      label: "اسأل المساعد الذكي",
      description: "المحادثات والإجراءات المباشرة",
      icon: Sparkles,
      view: "assistant",
      capability: capabilities.authenticated,
    },
  ].filter((action) => action.capability({ context }));
}
