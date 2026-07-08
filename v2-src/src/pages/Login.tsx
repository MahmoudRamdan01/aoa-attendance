import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/providers/AuthProvider";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const { session, loading } = useAuthContext();

  useEffect(() => {
    if (!loading && session) {
      navigate("/", { replace: true });
    }
  }, [loading, session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("الإيميل أو الباسورد غير صحيح.");
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-[var(--c-page)]">
      {/* Branding panel (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#383737] flex-col items-center justify-center relative overflow-hidden">
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative z-10 flex flex-col items-center">
          <img
            src="./logo.png"
            alt="Air Ocean Line"
            className="w-32 h-32 object-contain mb-6"
          />
          <h1 className="text-white text-2xl font-bold tracking-wide">
            AIR OCEAN LINE
          </h1>
          <p className="text-[var(--c-faint)] text-base mt-2">
            نظام الحضور والموارد البشرية
          </p>
          <div className="mt-12 text-[var(--c-muted)] text-xs tracking-widest">
            Quick · Reliable · Delivered
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px]">
          {/* Logo (Mobile) */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img
              src="./logo.png"
              alt="Air Ocean Line"
              className="w-20 h-20 object-contain mb-4"
            />
            <h1 className="text-[var(--c-ink)] text-xl font-bold">AIR OCEAN LINE</h1>
          </div>

          {/* Login Card */}
          <div className="bg-[var(--c-panel)] rounded-2xl p-8 sm:p-10 shadow-[var(--shadow-login)]">
            <div className="text-center mb-6">
              <h2 className="text-[22px] font-bold text-[var(--c-ink)]">
                تسجيل الدخول
              </h2>
              <p className="text-sm text-[var(--c-muted)] mt-1">
                Sign In to Your Account
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-[var(--c-ink)] flex items-center gap-2"
                >
                  <Mail className="w-4 h-4 text-[var(--c-faint)]" />
                  البريد الإلكتروني
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@airocean.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className="h-[42px] border-[var(--c-line)] rounded-lg focus:border-[#FCC10E] focus:ring-[#FCC10E]/10"
                  dir="ltr"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-[var(--c-ink)] flex items-center gap-2"
                >
                  <Lock className="w-4 h-4 text-[var(--c-faint)]" />
                  كلمة المرور
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-[42px] border-[var(--c-line)] rounded-lg focus:border-[#FCC10E] focus:ring-[#FCC10E]/10 pr-10"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-faint)] hover:text-[var(--c-muted)]"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me + Forgot Password */}
              <div className="flex items-center justify-between" dir="rtl">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) =>
                      setRememberMe(checked as boolean)
                    }
                    className="border-[var(--c-line)] data-[state=checked]:bg-[#FCC10E] data-[state=checked]:border-[#FCC10E]"
                  />
                  <label
                    htmlFor="remember"
                    className="text-sm text-[var(--c-muted)] cursor-pointer"
                  >
                    تذكرني
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    toast.info("كلم الـ HR لإعادة تعيين كلمة المرور.")
                  }
                  className="text-sm text-[#FCC10E] hover:underline font-medium"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>

              {message && (
                <p className="text-sm text-[var(--c-red)] bg-[var(--c-red-bg)] rounded-lg px-3 py-2 text-center">
                  {message}
                </p>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-[#FCC10E] hover:bg-[#e5ad0d] text-[#383737] font-semibold text-base rounded-[10px] transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-[#383737] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    دخول
                    <ArrowLeft className="w-4 h-4 mr-2" />
                  </>
                )}
              </Button>
            </form>

            {/* System Status */}
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--c-muted)]">
              <CheckCircle className="w-3.5 h-3.5 text-[var(--c-green)]" />
              <span>System Active</span>
              <span className="text-[var(--c-faint2)]">|</span>
              <span>Quick · Reliable · Delivered</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
