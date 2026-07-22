# 01 — Theme tokens patch (`v1-src/src/styles/tokens.css`)

Apply as a **value-level diff** inside the existing `:root, :root.dark` block. Do NOT restructure the file; keep light theme (`:root:not(.dark)`), `[data-section]` scopes, `@supports color-mix`, and `[data-company="airocean"]` blocks untouched except where listed.

## Dark theme — change these values only

| Variable | Old | New |
|---|---|---|
| `--canvas` | `#0c1722` | `#0B1621` |
| `--chrome` | `#101b26` | `#0E1926` |
| `--surface` | `#172331` | `#14212F` |
| `--surface-nested` | `#202f3c` | `#101B28` |
| `--surface-raised` | `#263847` | `#1B2B3B` |
| `--surface-overlay` | `#2c4050` | `#22374A` |
| `--text` | `#f9fbfd` | `#F7FAFC` |
| `--text-secondary` | `#b7c2cd` | `#B4C0CC` |
| `--text-muted` | `#93a1ad` | `#8B9AA8` |
| `--text-disabled` | `#6f7e8b` | `#66727D` |
| `--line-subtle` | `rgba(183,194,205,.13)` | `rgba(180,196,210,.10)` |
| `--line` | `rgba(183,194,205,.22)` | `rgba(180,196,210,.14)` |
| `--line-strong` | `rgba(183,194,205,.34)` | `rgba(180,196,210,.26)` |

Semantic colors stay: `--gold #fcc107`, `--success #43d9a0`, `--warning #ffb84d`, `--danger #ff6b70`, `--info #7dd3fc`, `--special #b49cff`.

## Add (same block)

```css
--surface-hero: linear-gradient(150deg, #1B2B3B, #14212F 70%);
--radius-card: 16px;          /* unified card radius (was mixed 14/18) */
--ring-size: 186px;           /* check-in ring outer size */
--nav-active: var(--gold-text);
--nav-idle: #7E8D9B;
```

Light-theme fallbacks in `:root:not(.dark)`:

```css
--surface-hero: linear-gradient(150deg, #ffffff, #f1f5f8 70%);
--nav-idle: #6b7a87;
```

`[data-company="airocean"]` needs no change (it only overrides `--gold*`).

## Accent-discipline rule (CSS usage, not tokens)
The redesign reserves the brand accent for: primary action, active nav item, key figures (net payroll, payslip net), badges/counters. Everywhere the current CSS uses `var(--c)` for **panel chrome** (borders, icon tints, headings), replace with neutral `var(--line)` / `var(--text-secondary)`. Section accents (`[data-section]`) remain for status/identity elements only (dots in menus, small chips). Grep targets: `shell.css` `.ops-nav-item`, `panel-title` in `primitives.css`.

## Type usage (already loaded via @fontsource in main.jsx — no new deps)
- Alexandria 600/700 → screen titles, KPI values, net amounts, big clock
- IBM Plex Sans Arabic 400/500/600/700 → body
- JetBrains Mono 500/600 → times, amounts, counters
- List sublines: `line-height: 1.6` minimum (Arabic clipping fix)

## Status-chip palette (uniform everywhere)
| Status | fg | bg |
|---|---|---|
| حاضر / مقبولة | `#43D9A0` | `rgba(67,217,160,.12)` |
| متأخر / معلّقة | `#FFB84D` | `rgba(255,184,77,.12)` |
| غياب / مرفوضة | `#FF6B70` | `rgba(255,107,112,.12)` |
| إجازة | `#7DD3FC` | `rgba(125,211,252,.12)` |
| مأمورية | `#B49CFF` | `rgba(180,156,255,.12)` |

Chip spec: `font: 600 10px; padding: 3px 10px; border-radius: 999px;` optional leading 5px dot.

## 12-hour time rule (bidi-safe)
All displayed times are 12-hour with Arabic meridiem (`9:02 ص`). **Never wrap a time+meridiem pair in `direction:ltr`** — render inside the RTL context (digits group correctly) or per-time `<bdi>`. For in→out ranges use `8:54 ص ← 5:32 م` (arrow points left, check-in first/right). Chart axis label rows: `direction:ltr` on the row (dates only, no Arabic).
