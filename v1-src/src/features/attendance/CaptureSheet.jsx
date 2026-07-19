import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, LocateFixed, ShieldCheck, X } from "lucide-react";
import { startGpsSampler } from "./useGpsSampler";
import { prepareFaceEngine, useFaceEngine } from "./useFaceEngine";

function cameraError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return new Error("تم رفض إذن الكاميرا. يُرجى السماح بالكاميرا من إعدادات المتصفح ثم إعادة المحاولة.");
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return new Error("لم يتم العثور على كاميرا أمامية على الجهاز.");
  }
  if (error?.name === "NotReadableError") {
    return new Error("الكاميرا مُستخدَمة في تطبيق آخر. يُرجى إغلاقه وإعادة المحاولة.");
  }
  return new Error("تعذّر تشغيل الكاميرا. يُرجى التأكد من منح الإذن وإعادة المحاولة.");
}

export async function requestCaptureSession({ faceMode = "off", requireGps = true } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("المتصفح لا يدعم تشغيل الكاميرا. افتح النظام من Safari أو Chrome حديث.");
  }
  // Both permission requests start synchronously from the user's click. This is
  // required by iOS Safari and avoids opening a permission prompt on mount.
  const gpsSampler = requireGps ? startGpsSampler() : {
    first: Promise.resolve(null),
    done: Promise.resolve([]),
    stop() {},
  };
  gpsSampler.first.catch(() => {});
  gpsSampler.done.catch(() => {});
  const faceEngine = faceMode === "off" ? Promise.resolve(null) : prepareFaceEngine();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    return { stream, gpsSampler, faceEngine };
  } catch (error) {
    gpsSampler.stop();
    throw cameraError(error);
  }
}

function stopSession(session) {
  session?.gpsSampler?.stop();
  session?.stream?.getTracks?.().forEach((track) => track.stop());
}

export default function CaptureSheet({
  kind,
  session,
  faceMode = "off",
  antispoofMin = 0.6,
  requireGps = true,
  onCapture,
  onCancel,
}) {
  const videoRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [gpsReady, setGpsReady] = useState(!requireGps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const face = useFaceEngine({
    enabled: faceMode !== "off",
    videoRef,
    engine: session?.faceEngine,
    antispoofMin,
  });
  const faceReady = faceMode === "off" || face.status === "ready" || face.status === "unavailable";

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !session?.stream) return undefined;
    video.srcObject = session.stream;
    video.play().catch(() => {});
    if (requireGps) session.gpsSampler.first.then(() => setGpsReady(true)).catch((err) => setError(err.message));
    return () => stopSession(session);
  }, [session]);

  async function capture() {
    if (!cameraReady || busy) return;
    setBusy(true);
    setError("");
    try {
      // No frame is ever captured or uploaded: the live video only feeds the
      // on-device face engine, and closing the sheet stops the tracks.
      const samples = await session.gpsSampler.done;
      const location = [...samples].sort((a, b) => a.accuracy - b.accuracy)[0] || null;
      if (requireGps && !location) throw new Error("تعذّر تحديد الموقع. يُرجى المحاولة من مكان مكشوف.");
      if (requireGps && location && location.accuracy > 300) {
        throw new Error(`دقة تحديد الموقع غير كافية حاليًا (±${location.accuracy} متر). يُرجى الانتظار بضع ثوانٍ ثم إعادة المحاولة.`);
      }
      await onCapture({
        samples,
        location,
        capturedAt: new Date().toISOString(),
        faceEmbedding: face.data?.faceEmbedding || null,
        faceScores: face.data?.faceScores || (face.unavailable ? { unavailable: true } : null),
      });
    } catch (err) {
      setError(err.message || "تعذر إكمال التسجيل.");
      setBusy(false);
    }
  }

  function cancel() {
    if (busy) return;
    stopSession(session);
    onCancel?.();
  }

  return (
    <div className="capture-sheet" role="dialog" aria-modal="true" aria-labelledby="capture-title">
      <header className="capture-sheet__header">
        <div>
          <span className="capture-sheet__eyebrow"><ShieldCheck size={15} /> تسجيل آمن</span>
          <h2 id="capture-title">{kind === "in" ? "تسجيل الحضور" : kind === "out" ? "تسجيل الانصراف" : "تسجيل بصمة الوجه"}</h2>
        </div>
        <button type="button" className="capture-sheet__close" onClick={cancel} disabled={busy} aria-label="إلغاء">
          <X size={22} />
        </button>
      </header>

      <div className="capture-preview">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => setCameraReady(true)}
        />
        <div className="capture-guide" aria-hidden="true" />
        <p>{faceMode === "off" ? "يُرجى توجيه الوجه داخل الإطار والنظر إلى الكاميرا" : face.instruction}</p>
      </div>

      <div className="capture-checks" aria-live="polite">
        {requireGps ? (
          <span data-ready={gpsReady ? "true" : undefined}>
            {gpsReady ? <CheckCircle2 size={17} /> : <Loader2 className="spin" size={17} />}
            <LocateFixed size={16} /> الموقع
          </span>
        ) : null}
        <span data-ready={cameraReady ? "true" : undefined}>
          {cameraReady ? <CheckCircle2 size={17} /> : <Loader2 className="spin" size={17} />}
          <Camera size={16} /> الكاميرا
        </span>
        {faceMode !== "off" ? (
          <span data-ready={faceReady ? "true" : undefined}>
            {faceReady ? <CheckCircle2 size={17} /> : <Loader2 className="spin" size={17} />}
            <ShieldCheck size={16} /> الوجه
          </span>
        ) : null}
      </div>

      {error ? <p className="capture-error" role="alert">{error}</p> : null}

      <button
        className="capture-submit"
        type="button"
        onClick={capture}
        disabled={!cameraReady || !gpsReady || !faceReady || busy}
      >
        {busy ? <Loader2 className="spin" size={21} /> : <Camera size={21} />}
        {busy ? "جارٍ التحقق والتسجيل…" : "تحقق وتسجيل"}
      </button>
      <p className="capture-privacy">لا يتم حفظ أي صور أو مقاطع فيديو — يتم استخراج بصمة رقمية مشفّرة فقط وتُحذف اللقطات فورًا.</p>
    </div>
  );
}
