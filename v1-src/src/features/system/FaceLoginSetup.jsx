import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ConfirmDialog } from "../../ui/primitives";
import CaptureSheet, { requestCaptureSession } from "../attendance/CaptureSheet";
import {
  clearStashedCredentials,
  enrollFace,
  hasFaceEnrollment,
  isFaceLoginSupported,
  peekStashedCredentials,
  stashCredentialsForEnroll,
} from "../../lib/faceLogin";

// The More sheet asks to open the setup through this event so the camera
// request stays inside the original tap's call stack (iOS requirement —
// CustomEvent listeners run synchronously).
export const FACE_SETUP_EVENT = "aoa:face-setup";

export function requestFaceSetup() {
  window.dispatchEvent(new CustomEvent(FACE_SETUP_EVENT));
}

const OFFER_DISMISS_KEY = "aoa:v1:face-offer-dismissed";

// Post-login "سجّل وشك مرة واحدة" flow (owner request: there was no place to
// press to save your face once you were already inside the app).
// Two entry points, one capture path:
//   1. Auto-offer right after a password login on a device with no enrollment.
//   2. "تسجيل بصمة الوجه" row in the More sheet — asks for the password if the
//      login stash is gone (refresh), verifying it before the camera opens.
export default function FaceLoginSetup({ session, onToast }) {
  const supported = isFaceLoginSupported();
  const email = session?.user?.email || "";
  const [offer, setOffer] = useState(false);
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [capture, setCapture] = useState(null); // { session, credentials }
  const credsRef = useRef(null);

  useEffect(() => {
    if (!supported || !email) return;
    let alive = true;
    (async () => {
      try {
        if (await hasFaceEnrollment()) return;
        const stash = peekStashedCredentials();
        if (!stash || stash.email !== email.toLowerCase()) return;
        if (localStorage.getItem(OFFER_DISMISS_KEY)) return;
        if (alive) setOffer(true);
      } catch {
        // storage unavailable — the More-sheet entry still works
      }
    })();
    return () => { alive = false; };
  }, [supported, email]);

  useEffect(() => {
    if (!supported) return undefined;
    const onRequest = () => start();
    window.addEventListener(FACE_SETUP_EVENT, onRequest);
    return () => window.removeEventListener(FACE_SETUP_EVENT, onRequest);
  });

  async function beginCapture(credentials) {
    credsRef.current = credentials;
    try {
      // getUserMedia fires synchronously inside — keep it first in the tap.
      const captureSession = await requestCaptureSession({ faceMode: "verify", requireGps: false });
      setCapture({ session: captureSession });
    } catch (error) {
      onToast?.(error.message || "تعذّر تشغيل الكاميرا.");
    }
  }

  // Confirm tap on the offer dialog → camera (the tap IS the iOS gesture).
  function confirmOffer() {
    const stash = peekStashedCredentials();
    setOffer(false);
    if (stash && stash.email === email.toLowerCase()) {
      beginCapture(stash);
      return;
    }
    setPwError("");
    setAskPassword(true);
  }

  // Entry from the More sheet (no direct camera here — a dialog opens first,
  // so its confirm tap provides the user gesture the camera needs).
  function start() {
    const stash = peekStashedCredentials();
    if (stash && stash.email === email.toLowerCase()) {
      setOffer(true);
      return;
    }
    setOffer(false);
    setPwError("");
    setAskPassword(true);
  }

  async function confirmPassword() {
    const value = password.trim();
    if (!value) {
      setPwError("اكتب كلمة المرور الأول.");
      return;
    }
    setPwBusy(true);
    setPwError("");
    // Camera FIRST (synchronously, inside this tap — iOS), password check in
    // parallel; we only show the sheet once both succeed.
    const capturePromise = requestCaptureSession({ faceMode: "verify", requireGps: false });
    capturePromise.catch(() => {});
    const { error } = await supabase.auth.signInWithPassword({ email, password: value });
    if (error) {
      setPwBusy(false);
      setPwError(error.status === 400 ? "كلمة المرور غير صحيحة." : "تعذّر التحقق — أعد المحاولة.");
      try {
        (await capturePromise).stream.getTracks().forEach((track) => track.stop());
      } catch {
        // camera never opened — nothing to release
      }
      return;
    }
    try {
      const captureSession = await capturePromise;
      stashCredentialsForEnroll(email, value);
      credsRef.current = { email: email.toLowerCase(), password: value };
      setAskPassword(false);
      setPassword("");
      setPwBusy(false);
      // The closing dialog consumes its history entry asynchronously; showing
      // the sheet in the same beat would get ITS entry popped instead (sheet
      // flashes open then closes). The stream is already live — this only
      // delays showing the UI.
      await new Promise((resolve) => setTimeout(resolve, 230));
      setCapture({ session: captureSession });
    } catch (cameraError) {
      setPwBusy(false);
      setPwError(cameraError.message || "تعذّر تشغيل الكاميرا.");
    }
  }

  async function handleCapture(data) {
    const credentials = credsRef.current;
    const embedding = data.faceEmbedding;
    setCapture(null);
    if (!credentials || !Array.isArray(embedding) || embedding.length !== 1024) {
      onToast?.("تعذّر التقاط بصمة الوجه — أعد المحاولة من قائمة «المزيد».");
      return;
    }
    try {
      await enrollFace({ ...credentials, embedding, scores: data.faceScores });
      clearStashedCredentials();
      credsRef.current = null;
      onToast?.("تم حفظ بصمة وجهك ✓ — من دلوقتي اضغط «الدخول ببصمة الوجه» وادخل على طول.");
    } catch {
      onToast?.("تعذّر حفظ بصمة الوجه على الجهاز — أعد المحاولة.");
    }
  }

  function declineOffer() {
    setOffer(false);
    clearStashedCredentials();
    try {
      // Don't nag on every login; the More-sheet row stays available.
      localStorage.setItem(OFFER_DISMISS_KEY, "1");
    } catch {
      // private mode — worst case the offer shows again next login
    }
  }

  if (!supported) return null;

  return (
    <>
      <ConfirmDialog
        open={offer}
        title="تفعيل الدخول ببصمة الوجه"
        message="سجّل بصمة وشك مرة واحدة على الجهاز ده، وبعدها تقدر تدخل بمجرد النظر للكاميرا — من غير كتابة كلمة المرور. لا يتم حفظ أي صور نهائيًا، بصمة رقمية مشفّرة فقط."
        confirmLabel="سجّل وشي الآن"
        cancelLabel="لاحقًا"
        onConfirm={confirmOffer}
        onCancel={declineOffer}
      />

      <ConfirmDialog
        open={askPassword}
        title="تأكيد كلمة المرور"
        message="لتفعيل الدخول بالوجه على الجهاز ده، أكّد كلمة مرور حسابك مرة واحدة."
        confirmLabel={pwBusy ? "جارٍ التحقق…" : "تأكيد وفتح الكاميرا"}
        cancelLabel="إلغاء"
        busy={pwBusy}
        onConfirm={confirmPassword}
        onCancel={() => { setAskPassword(false); setPassword(""); setPwError(""); }}
      >
        <label className="lg-field" style={{ width: "100%" }}>
          <span>كلمة المرور</span>
          <span className="lg-input-row">
            <input
              dir="ltr"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </span>
        </label>
        {pwError ? <p className="error" style={{ margin: 0 }}>{pwError}</p> : null}
      </ConfirmDialog>

      {capture ? (
        <CaptureSheet
          kind="face"
          session={capture.session}
          faceMode="verify"
          requireGps={false}
          quick
          antispoofMin={0.7}
          onCapture={handleCapture}
          onCancel={() => setCapture(null)}
        />
      ) : null}
    </>
  );
}
