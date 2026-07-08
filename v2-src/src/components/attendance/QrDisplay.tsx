import { useEffect, useState } from "react"
import QRCodeLib from "qrcode"
import { Clipboard, Printer } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { btnSecondary } from "./styles"

interface QrDisplayProps {
  label: string
  code: string
  date?: string
  muted?: boolean
}

export default function QrDisplay({ label, code, date, muted }: QrDisplayProps) {
  const [image, setImage] = useState("")

  useEffect(() => {
    if (!code) {
      setImage("")
      return
    }
    QRCodeLib.toDataURL(code, {
      width: 190,
      margin: 2,
      color: {
        dark: muted ? "#667085" : "#383737",
        light: "#ffffff",
      },
    })
      .then(setImage)
      .catch(() => setImage(""))
  }, [code, muted])

  async function copyCode() {
    if (!code) return
    await navigator.clipboard.writeText(code)
    toast.success(`تم نسخ كود ${label}.`)
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--c-line-soft)] bg-[var(--c-panel-soft)] p-4 flex flex-col items-center gap-3",
        muted && "opacity-75"
      )}
    >
      <div className="flex items-baseline gap-2 self-start">
        <span className="text-sm font-semibold text-[var(--c-ink)]">{label}</span>
        {date && (
          <small className="text-xs text-[var(--c-faint)]" dir="ltr">
            {date}
          </small>
        )}
      </div>
      {image ? (
        <img src={image} alt={`QR ${label}`} className="w-[150px] h-[150px] rounded-lg bg-white p-1" />
      ) : (
        <div className="w-[150px] h-[150px] rounded-lg bg-[var(--c-page)] flex items-center justify-center text-[var(--c-faint)] text-sm">
          QR
        </div>
      )}
      <div
        className="w-full text-center font-mono text-sm font-semibold tracking-widest rounded-lg bg-[var(--c-amber-bg)] border border-dashed border-[var(--c-amber-40)] text-[var(--c-ink)] px-3 py-2"
        dir="ltr"
      >
        {code || "-"}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={btnSecondary} onClick={copyCode} disabled={!code}>
          <Clipboard className="w-4 h-4" /> نسخ
        </button>
        <button type="button" className={btnSecondary} onClick={() => window.print()} disabled={!code}>
          <Printer className="w-4 h-4" /> طباعة
        </button>
      </div>
    </div>
  )
}
