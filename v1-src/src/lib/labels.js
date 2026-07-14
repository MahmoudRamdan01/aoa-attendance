const roleNames = { employee: "موظف", hr: "HR", owner: "Owner" };
const statusLabels = {
  present: "حاضر",
  late: "متأخر",
  absent: "غياب",
  leave: "أجازة",
  mission: "مأمورية",
  sick: "مرضي",
  pending: "معلّق",
  approved: "مربوط",
  rejected: "مرفوض",
  active: "ساري",
  voided: "ملغي",
  confirmed: "مؤكد",
  open: "مفتوح",
  partial: "سداد جزئي",
  settled: "مُسدد",
};
const notificationCategoryLabels = {
  admin_message: "رسالة إدارية",
  approval: "موافقة مطلوبة",
  qr: "QR يومي",
  system: "النظام",
};
const deductionCategoryLabels = {
  damage: "تلفيات",
  penalty: "جزاء",
  uniform: "زي",
  other: "أخرى",
};
const expenseCategoryLabels = {
  water: "مياه",
  electricity: "كهرباء",
  gas: "غاز",
  internet: "إنترنت",
  rent: "إيجار",
  maintenance: "صيانة",
  stationery: "قرطاسية",
  other: "أخرى",
};
const partnerKindLabels = {
  invoice: "فاتورة",
  loan: "سلفة",
  deal: "صفقة",
  other: "أخرى",
};
const partnerDirectionLabels = {
  owed_to_us: "لنا عندهم",
  owed_by_us: "علينا ليهم",
};
const roleOptions = [
  { value: "employee", label: "موظف" },
  { value: "hr", label: "HR" },
  { value: "owner", label: "Owner" },
];

const EVALUATION_VIEWER_EMPLOYEE_IDS = [1, 2];

const reqStatusLabel = (status) => ({
  approved: "متوافق عليها",
  rejected: "مرفوضة",
  pending: "معلّقة",
  cancelled: "ملغاة",
}[status] || status);

export {
  deductionCategoryLabels,
  EVALUATION_VIEWER_EMPLOYEE_IDS,
  expenseCategoryLabels,
  notificationCategoryLabels,
  partnerDirectionLabels,
  partnerKindLabels,
  roleNames,
  roleOptions,
  reqStatusLabel,
  statusLabels,
};
