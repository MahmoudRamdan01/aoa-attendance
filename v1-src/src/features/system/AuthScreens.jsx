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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage("الإيميل أو الباسورد غير صحيح.");
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
            الإيميل
            <input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            الباسورد
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
