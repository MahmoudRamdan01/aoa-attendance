# 05 — Login screen spec (Phase 7)

Target: `v1-src/src/features/system/AuthScreens.jsx` → `LoginScreen` (verified on `redesign/mobile-v2`). Keep the FUNCTION exactly: `signInWithPassword` with `email.trim()`, the network/429/400 error-message mapping, `busy` state, autocomplete attrs, `dir="ltr"` inputs. This phase is presentation + one optional shortcut.

Reference: `reference/09-login.png` (phone in the LOGIN section) + the interactive prototype.

## Layout (mobile-first, RTL; desktop centers the column, max-width 400)
Full-viewport `background: linear-gradient(170deg, var(--canvas) 55%, #0D1E2E)`, plus:
- Grid texture overlay: two `linear-gradient` 1px lines `rgba(180,196,210,.04)/.03`, `background-size: 64px 64px`, `pointer-events:none`
- Top radial glow: 380px circle, `radial-gradient(circle, var(--gold-soft), transparent 66%)`, centered ~-120px above
- **Ocean waves** (bottom, `pointer-events:none`, height 96px): two SVG sine layers, each `width: 786px` (2× viewport, seamless), `preserveAspectRatio="none"`:
  - back: gold `var(--gold)` opacity .10, `animation: drift 22s linear infinite`, bottom -6px
  - front: `#7DD3FC` opacity .14, `animation: drift 13s linear infinite`, bottom -18px
  - `@keyframes drift { from{transform:translateX(0)} to{transform:translateX(-393px)} }` (half the width)
  - Path (period 131px, amplitude 20): `M0,34 Q32.75,14 65.5,34 T131,34 … T786,34 L786,80 L0,80 Z`
  - Honor `prefers-reduced-motion: reduce` → `animation: none` on waves/bob/pulse/sheen.

## Elements (top → bottom; entrance `riseIn .5s ease-out both`, staggered 0 / .12s / .24s)
1. **Logo block** (`animation: bob 5.4s ease-in-out infinite`; bob = translateY 0→-7px→0): 110px wrap, pulsing halo ring `1.5px var(--gold-line)` (scale 1→1.18 fade, 3.2s), inner hairline ring inset 12px, `BrandLogo` (existing) 66px, radius 18, `box-shadow: 0 18px 44px var(--gold-soft)`.
2. Wordmark `COMPANY.opsTitle`: JetBrains Mono `700 11.5px`, `letter-spacing:.22em`, `var(--text-secondary)`.
3. Greeting: "{صباح/مساء الخير}، أهلًا بعودتك" `700 23px Alexandria` + sub "سجّل دخولك لمتابعة الحضور والفريق" `400 12px/1.6 var(--text-muted)` (hour < 12 → صباح).
4. **Glass card**: `background: rgba(20,33,47,.72); backdrop-filter: blur(14px); border: 1px solid var(--line); border-radius: 20px; padding: 20px; gap: 13px` (light theme: `rgba(255,255,255,.8)`).
   - Fields: label `600 11px var(--text-muted)`; input row h48 `var(--surface-nested)` border `var(--line)` r12 px14; leading mail/lock icon 16px `var(--text-disabled)`; input transparent `500 13px var(--font-mono)` LTR; focus-within → border `var(--gold-line)`. Password gets trailing eye toggle (add show/hide — currently missing).
   - Row: "تذكرني" checkbox (17px, gold fill, dark check) + "نسيت كلمة المرور؟" gold link `600 11.5px` (link may be a no-op toast "كلم الإدارة لإعادة التعيين" until reset flow exists).
   - **Submit** h50 r14: `linear-gradient(100deg, var(--gold) 30%, #FFDA5C 50%, var(--gold) 70%); background-size: 220% 100%; animation: sheen 4.5s ease-in-out infinite` (sheen = background-position 180%→-80%), text `700 15px var(--gold-on)`, arrow-left icon, `box-shadow: 0 14px 36px var(--gold-soft)`, active scale .98. States: busy → 3 blinking dots + "جارٍ التحقق…"; keep error `<p class="error">` below (unchanged copy), add a subtle shake keyframe on error.
   - Divider "أو" between hairlines.
   - **"الدخول ببصمة الوجه"** secondary h46 r13: `rgba(125,211,252,.08)` bg, `.3` border, `#7DD3FC` text, scan-face icon. Behavior (optional, feature-flagged): only a SHORTCUT for returning users — prefill/submit via stored session refresh if available, else focus the email field with toast "سجّل الدخول أول مرة بكلمة المرور". NO biometric auth backend is implied; hide the button entirely if product prefers (dev + owner call, note in PR).
5. Footer (mt-auto): status dot green blink + "النظام يعمل · آخر مزامنة الآن" `500 10.5px var(--text-muted)`; "QUICK · RELIABLE · DELIVERED" JetBrains `500 9px` ls .12em `var(--text-disabled)`.

## Company/brand rules
All golds via `var(--gold*)` → airocean magenta works automatically; wave gold layer uses `var(--gold)` too. Light theme: same layout, glass card lighter, waves opacity halved.

## Acceptance
- Login succeeds/fails exactly as before (same error copy paths); autofill still works (labels wrap inputs, autocomplete attrs kept).
- Keyboard on iOS doesn't break layout (card scrolls, no fixed heights on the column).
- `prefers-reduced-motion` disables all decorative animation.
- Dark + light + airocean pass; Splash and SetupBanner untouched.
