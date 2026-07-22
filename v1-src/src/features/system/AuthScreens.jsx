import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ScanFace, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { COMPANY } from "../../lib/company";
import BrandLogo from "../../ui/BrandLogo";
import CaptureSheet, { requestCaptureSession } from "../attendance/CaptureSheet";
import {
  enrollFace,
  hasFaceEnrollment,
  isFaceLoginSupported,
  matchFace,
  removeEnrollment,
} from "../../lib/faceLogin";

function Splash() {
  return (
    <div className="splash">
      <BrandLogo large />
      <p>تحميل نظام {COMPANY.name}...</p>
    </div>
  );
}

// Shared auth-error → Arabic copy for the FACE flows only. The password
// login() below keeps its own inline mapping byte-for-byte.
function authErrorMessage(error) {
  const isNetwork = !error.status || error.status === 0 || /fetch|network|timeout|failed/i.test(error.message || "");
  if (isNetwork) return "فشل الاتصال بالخادم — تأكّد من اتصال الإنترنت وأعد المحاولة.";
  if (error.status === 429) return "محاولات كثيرة متتالية — انتظر دقيقة ثم أعد المحاولة.";
  if (error.status === 400) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  return "حدث خطأ مؤقت — أعد المحاولة.";
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  // Face-login shortcut (device-bound convenience — see lib/faceLogin.js).
  const faceSupported = isFaceLoginSupported();
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceBusy, setFaceBusy] = useState(false);
  // { step: "verify" | "enroll", session } while the camera sheet is open.
  const [faceCapture, setFaceCapture] = useState(null);

  useEffect(() => {
    if (!faceSupported) return undefined;
    let alive = true;
    hasFaceEnrollment().then((exists) => {
      if (alive) setFaceEnrolled(exists);
    }).catch(() => {});
    return () => { alive = false; };
  }, [faceSupported]);

  async function login(event) {
    event.preventDefault();
    // An empty field sent to the server comes back as a generic 400 that we'd
    // show as "wrong credentials" — say what's actually missing instead.
    if (!email.trim() || !password.trim()) {
      setMessage("اكتب البريد الإلكتروني وكلمة المرور الأول.");
      return;
    }
    setBusy(true);
    setMessage("");
    // Mobile keyboards/autofill/copy-paste add stray spaces around both the
    // email and the password → auth 400. No real password here has edge spaces.
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });
    if (error) {
      // A flaky connection is NOT wrong credentials. Team members on mobile
      // were seeing "البريد الإلكتروني أو كلمة المرور غير صحيح" for network drops, then the
      // retry logged them in — so tell them what actually happened.
      const isNetwork = !error.status || error.status === 0 || /fetch|network|timeout|failed/i.test(error.message || "");
      if (isNetwork) setMessage("فشل الاتصال بالخادم — تأكّد من اتصال الإنترنت وأعد المحاولة.");
      else if (error.status === 429) setMessage("محاولات كثيرة متتالية — انتظر دقيقة ثم أعد المحاولة.");
      else if (error.status === 400) setMessage("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      else setMessage("حدث خطأ مؤقت — أعد المحاولة.");
    }
    setBusy(false);
  }

  // Opens the camera sheet. getUserMedia must start synchronously from the tap
  // (iOS Safari), so requestCaptureSession is reached with no awaits before it.
  async function startFaceLogin() {
    if (faceBusy || busy) return;
    setMessage("");
    // Enrollment needs the real password once — guide the first-timer.
    if (!faceEnrolled && (!email.trim() || !password.trim())) {
      setMessage("سجّل الدخول بكلمة المرور أول مرة، ثم فعّل الدخول بالوجه بالتقاط وجهك.");
      return;
    }
    setFaceBusy(true);
    try {
      const session = await requestCaptureSession({ faceMode: "verify", requireGps: false });
      setFaceCapture({ step: faceEnrolled ? "verify" : "enroll", session });
    } catch (error) {
      setMessage(error.message || "تعذّر تشغيل الكاميرا.");
    } finally {
      setFaceBusy(false);
    }
  }

  function closeFaceCapture() {
    // CaptureSheet stops the camera tracks in its own unmount effect.
    setFaceCapture(null);
  }

  async function handleFaceCapture(data) {
    const step = faceCapture?.step;
    const embedding = data.faceEmbedding;
    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      closeFaceCapture();
      setMessage("تعذّر التحقق من الوجه على هذا الجهاز — سجّل الدخول بكلمة المرور.");
      return;
    }

    if (step === "enroll") {
      const credentials = { email: email.trim(), password: password.trim() };
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) {
        closeFaceCapture();
        setMessage(authErrorMessage(error));
        return;
      }
      // Signed in — persist the face template + encrypted credentials so next
      // time is face-only. Enrollment is best-effort; the user is already in.
      try {
        await enrollFace({ ...credentials, embedding, scores: data.faceScores });
      } catch {
        // ignore — a failed enrollment just means they log in normally again
      }
      closeFaceCapture();
      return;
    }

    // Verify path: match against enrolled faces, then sign in for them.
    const match = await matchFace(embedding);
    if (!match) {
      closeFaceCapture();
      setMessage("لم يتم التعرّف على وجهك — سجّل الدخول بكلمة المرور.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: match.email, password: match.password });
    if (error) {
      closeFaceCapture();
      if (error.status === 400) {
        // Password was changed/reset on the server — drop the stale template.
        await removeEnrollment(match.email);
        setFaceEnrolled(false);
        setMessage("تغيّرت كلمة المرور — سجّل الدخول بكلمة المرور مرة واحدة لإعادة تفعيل الوجه.");
      } else {
        setMessage(authErrorMessage(error));
      }
      return;
    }
    closeFaceCapture();
  }

  const morning = new Date().getHours() < 12;

  return (
    <>
    <main className="lg-screen">
      <span className="lg-grid" aria-hidden="true" />
      <span className="lg-glow" aria-hidden="true" />

      <div className="lg-col">
        {/* Floating logo block */}
        <div className="lg-logo">
          <span className="lg-logo-halo" aria-hidden="true" />
          <span className="lg-logo-ring" aria-hidden="true" />
          <span className="lg-logo-mark"><BrandLogo /></span>
        </div>
        <p className="lg-wordmark" dir="ltr">{COMPANY.opsTitle}</p>
        <h1 className="lg-greet">{morning ? "صباح الخير" : "مساء الخير"}، أهلًا بعودتك</h1>
        <p className="lg-sub">سجّل دخولك لمتابعة الحضور والفريق</p>

        {/* Glass card — the login FUNCTION is byte-identical to before */}
        <form className={cls("lg-card", message && "has-error")} onSubmit={login}>
          <label className="lg-field">
            <span>البريد الإلكتروني</span>
            <span className="lg-input-row">
              <Mail size={16} aria-hidden="true" />
              <input dir="ltr" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </span>
          </label>
          <label className="lg-field">
            <span>كلمة المرور</span>
            <span className="lg-input-row">
              <Lock size={16} aria-hidden="true" />
              <input dir="ltr" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button
                type="button"
                className="lg-eye"
                onClick={() => setShowPw((current) => !current)}
                aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </span>
          </label>
          <div className="lg-meta-row">
            <label className="lg-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              تذكرني
            </label>
            <button type="button" className="lg-forgot" onClick={() => setMessage("كلم الإدارة لإعادة تعيين كلمة المرور.")}>
              نسيت كلمة المرور؟
            </button>
          </div>
          <button className="lg-submit" disabled={busy}>
            {busy ? (
              <>
                <span className="lg-dots" aria-hidden="true"><i /><i /><i /></span>
                جارٍ التحقق…
              </>
            ) : (
              <>
                <ArrowLeft size={17} aria-hidden="true" />
                دخول
              </>
            )}
          </button>
          {message && <p className="error">{message}</p>}

          {faceSupported ? (
            <>
              <div className="lg-divider" aria-hidden="true">أو</div>
              <button type="button" className="lg-face" onClick={startFaceLogin} disabled={busy || faceBusy}>
                <ScanFace size={17} aria-hidden="true" />
                {faceBusy ? "جارٍ فتح الكاميرا…" : "الدخول ببصمة الوجه"}
              </button>
            </>
          ) : null}
        </form>

        <footer className="lg-foot">
          <p className="lg-status"><i aria-hidden="true" /> النظام يعمل · آخر مزامنة الآن</p>
          <p className="lg-tag" dir="ltr">QUICK · RELIABLE · DELIVERED</p>
        </footer>
      </div>
    </main>

    {faceCapture ? (
      <CaptureSheet
        kind="face"
        session={faceCapture.session}
        faceMode="verify"
        requireGps={false}
        onCapture={handleFaceCapture}
        onCancel={closeFaceCapture}
      />
    ) : null}
    </>
  );
}

function SetupBanner({ message }) {
  return (
    <div className="setup-banner">
      <Sparkles size={18} />
      <span>{message}</span>
    </div>
  );
}

export { LoginScreen, SetupBanner, Splash };
