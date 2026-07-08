# Login Page

## Section: Login Form

### Overview

A clean, centered login form with the AOI branding. The page uses a split layout with the form on the right and a branded visual panel on the left.

### Background

- Full page: `#f1f5f9` (light gray-blue)
- Left panel (on desktop): `#383737` dark with subtle pattern

### Layout

Desktop (>= 1024px):
- Split screen: 50% left (branding), 50% right (form)
- Form centered vertically and horizontally in right half

Mobile (< 1024px):
- Full width form, centered
- Logo and branding at top

### Elements

#### Left Panel (Desktop Only)

- **Background**: `#383737` solid
- **Pattern**: Subtle geometric dots pattern, 5% opacity white
- **Logo**: AOI logo centered, 120px width
- **Brand name**: "AIR OCEAN LINE" - 24px, weight 700, white
- **Tagline**: "نظام الحضور والموارد البشرية" - 16px, `#94a3b8`
- **Bottom text**: "Quick · Reliable · Delivered" - 12px, `#64748b`

#### Login Form Card

- **Background**: `#ffffff`
- **Border radius**: 16px
- **Padding**: 40px
- **Width**: 420px max
- **Shadow**: `0 4px 24px rgba(0,0,0,0.08)`

**Form Elements:**

1. **Logo** (top center):
   - 80px width
   - Margin bottom: 24px

2. **Title**: "تسجيل الدخول" - 22px, weight 700, `#1e293b`
   - English subtitle: "Sign In to Your Account" - 14px, `#64748b`

3. **Email Input**:
   - Label: "البريد الإلكتروني" / "Email Address"
   - Placeholder: "name@airoceanline.com"
   - Icon: `Mail` on right side (RTL)
   - Full width

4. **Password Input**:
   - Label: "كلمة المرور" / "Password"
   - Placeholder: "••••••••"
   - Icon: `Lock` on right side
   - Toggle visibility: `Eye` / `EyeOff` icon on left
   - Full width

5. **Remember Me + Forgot Password Row**:
   - Checkbox: "تذكرني" / "Remember me"
   - Link: "نسيت كلمة المرور؟" / "Forgot password?" - `#FCC10E`, hover underline

6. **Submit Button**:
   - Text: "دخول" / "Sign In"
   - Full width
   - Background: `#FCC10E`
   - Text: `#383737`
   - Height: 48px
   - Border radius: 10px
   - Font: 16px, weight 600
   - Icon: `ArrowLeft` on left (RTL: appears on left side)

7. **System Status Badge** (below button):
   - Text: "System Active" with green dot
   - "Last sync: Just now"
   - Centered, 12px, `#64748b`

### States

- **Loading**: Button shows spinner, disabled
- **Error**: Red border on fields, error message below
- **Success**: Redirect to dashboard

### Interactions

- **Input focus**: Yellow border highlight
- **Button hover**: Darken background to `#e5ad0d`
- **Button press**: Scale 0.98
