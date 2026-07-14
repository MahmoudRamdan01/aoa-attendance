import { Download, FileText, ShieldCheck } from "lucide-react";

import { EVALUATION_VIEWER_EMPLOYEE_IDS } from "../../lib/labels";

function TrainingView({ context }) {
  const role = context?.role || "employee";
  const canSeeEvaluation =
    role === "owner" || EVALUATION_VIEWER_EMPLOYEE_IDS.includes(context?.employee?.id);

  const docs = [
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
  ];

  return (
    <div className="grid two">
      {docs.map((doc) => (
        <section className="panel" key={doc.file}>
          <div className="panel-title">
            <FileText size={20} />
            <h2>{doc.title}</h2>
          </div>
          <p className="muted">{doc.en}</p>
          <p>{doc.desc}</p>
          {doc.restricted && (
            <p className="muted">
              <ShieldCheck size={15} /> متاح لأبرار وندى والـ Owner فقط.
            </p>
          )}
          <div className="actions-row">
            <a className="primary" href={doc.file} target="_blank" rel="noreferrer">
              <FileText size={17} /> عرض PDF
            </a>
            <a className="secondary" href={doc.file} download>
              <Download size={17} /> تنزيل
            </a>
          </div>
          <div className="pdf-frame">
            <iframe src={doc.file} title={doc.title} loading="lazy" />
          </div>
        </section>
      ))}
    </div>
  );
}

// ===================== AI Assistant =====================

export default TrainingView;
