import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { COMPANY } from "../../lib/company";
import BrandLogo from "../../ui/BrandLogo";

function Splash() {
  return (
    <div className="splash">
      <BrandLogo large />
      <p>تحميل نظام {COMPANY.name}...</p>
    </div>
  );
}

// Ocean-wave sine layer (Phase-7 login spec): period 131px, amplitude 20,
// width 786 (2× viewport for a seamless -393px drift loop).
const WAVE_PATH =
  "M0,34 Q32.75,14 65.5,34 T131,34 T196.5,34 T262,34 T327.5,34 T393,34 T458.5,34 T524,34 T589.5,34 T655,34 T720.5,34 T786,34 L786,80 L0,80 Z";

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    // Mobile keyboards/autofill add stray spaces around the email → auth 400.
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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

  const morning = new Date().getHours() < 12;

  return (
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
        </form>

        <footer className="lg-foot">
          <p className="lg-status"><i aria-hidden="true" /> النظام يعمل · آخر مزامنة الآن</p>
          <p className="lg-tag" dir="ltr">QUICK · RELIABLE · DELIVERED</p>
        </footer>
      </div>

      {/* Ocean waves */}
      <div className="lg-waves" aria-hidden="true">
        <svg className="lg-wave lg-wave-back" viewBox="0 0 786 80" preserveAspectRatio="none">
          <path d={WAVE_PATH} />
        </svg>
        <svg className="lg-wave lg-wave-front" viewBox="0 0 786 80" preserveAspectRatio="none">
          <path d={WAVE_PATH} />
        </svg>
      </div>
    </main>
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
