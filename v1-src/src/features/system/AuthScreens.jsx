import { useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import BrandLogo from "../../ui/BrandLogo";

function Splash() {
  return (
    <div className="splash">
      <BrandLogo large />
      <p>تحميل نظام Air Ocean Line...</p>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand login-brand">
          <BrandLogo />
          <div>
            <p>Air Ocean Line</p>
            <strong>نظام الحضور والموارد البشرية</strong>
          </div>
        </div>
        <form onSubmit={login}>
          <label>
            البريد الإلكتروني
            <input dir="ltr" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            كلمة المرور
            <input dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "جار الدخول..." : "دخول"}
          </button>
          {message && <p className="error">{message}</p>}
        </form>
      </section>
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
