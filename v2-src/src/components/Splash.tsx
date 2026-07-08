export default function Splash() {
  return (
    <div className="min-h-screen bg-[var(--c-page)] flex flex-col items-center justify-center gap-4" dir="rtl">
      <img src="./logo.png" alt="Air Ocean Line" className="w-20 h-20 object-contain" />
      <p className="text-sm text-[var(--c-muted)]">تحميل نظام Air Ocean Line...</p>
      <div className="w-6 h-6 border-2 border-[#FCC10E] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
