import { Download, FileText, GraduationCap, ShieldCheck } from "lucide-react"
import Panel from "@/components/attendance/Panel"
import { btnPrimary, btnSecondary, mutedText } from "@/components/attendance/styles"
import { useAuthContext } from "@/providers/AuthProvider"

// نموذج التقييم يظهر فقط لهذه السجلات (أبرار = 1، ندى = 2) بالإضافة إلى الـ Owner.
const EVALUATION_VIEWER_EMPLOYEE_IDS = [1, 2]

interface TrainingDoc {
  file: string
  title: string
  en: string
  desc: string
  restricted: boolean
}

export default function TrainingPage() {
  const { context, role } = useAuthContext()
  const canSeeEvaluation =
    role === "owner" ||
    (context?.employee?.id != null && EVALUATION_VIEWER_EMPLOYEE_IDS.includes(context.employee.id))

  const docs: TrainingDoc[] = [
    {
      file: "./training/training-plan.pdf",
      title: "خطة تدريب الموظف الجديد",
      en: "New Employee Training Plan",
      desc: "تعليمات وخطة التدريب الكاملة — متاحة لكل الفريق.",
      restricted: false,
    },
    ...(canSeeEvaluation
      ? [
          {
            file: "./training/evaluation-form.pdf",
            title: "نموذج تقييم الموظف",
            en: "Employee Evaluation Form",
            desc: "نموذج التقييم الرسمي المستخدم أثناء وبعد فترة التدريب.",
            restricted: true,
          },
        ]
      : []),
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {docs.map((doc) => (
        <Panel key={doc.file} icon={GraduationCap} title={doc.title} subtitle={doc.en}>
          <p className="text-sm text-[var(--c-ink)] mb-2">{doc.desc}</p>
          {doc.restricted && (
            <p className={mutedText + " flex items-center gap-1.5 mb-2"}>
              <ShieldCheck className="w-4 h-4 text-[var(--c-green)] flex-shrink-0" />
              متاح لأبرار وندى والـ Owner فقط.
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap mt-3">
            <a className={btnPrimary} href={doc.file} target="_blank" rel="noreferrer">
              <FileText className="w-4 h-4" /> عرض PDF
            </a>
            <a className={btnSecondary + " h-10"} href={doc.file} download>
              <Download className="w-4 h-4" /> تنزيل
            </a>
          </div>
          <div className="hidden md:block mt-4 rounded-xl border border-[var(--c-line)] overflow-hidden bg-[var(--c-panel-soft)] h-[460px]">
            <iframe src={doc.file} title={doc.title} loading="lazy" className="w-full h-full border-0" />
          </div>
        </Panel>
      ))}
    </div>
  )
}
