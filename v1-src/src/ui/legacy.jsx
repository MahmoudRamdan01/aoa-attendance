import { useEffect, useRef, useState } from "react";
import { cls } from "../lib/cls";
import { statusLabels } from "../lib/labels";

function StatusBadge({ status }) {
  return <span className={cls("status-badge", status)}>{statusLabels[status] || status}</span>;
}

// Re-format an intermediate count-up frame in the same style as the target
// number ("3,200" keeps its thousands separators, "0.50" its decimals).
function formatLikeTarget(target, current) {
  const decimals = (target.split(".")[1] || "").length;
  const fixed = Math.abs(current).toFixed(decimals);
  const [whole, frac] = fixed.split(".");
  const grouped = target.includes(",") ? Number(whole).toLocaleString("en-US") : whole;
  return `${current < 0 ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

// First meaningful value counts up briefly (Uber-style live numbers); later
// updates apply instantly so filters never feel laggy.
function useCountUp(value) {
  const [display, setDisplay] = useState(value);
  const animatedRef = useRef(false);

  useEffect(() => {
    const str = typeof value === "number" ? String(value) : typeof value === "string" ? value : null;
    const match = str === null ? null : str.match(/^(.*?)(-?[\d,]+(?:\.\d+)?)(.*)$/s);
    const numeric = match ? parseFloat(match[2].replace(/,/g, "")) : NaN;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    if (animatedRef.current || reduced || !match || !Number.isFinite(numeric) || numeric === 0 || Math.abs(numeric) > 1e9) {
      setDisplay(value);
      if (match && Number.isFinite(numeric) && numeric !== 0) animatedRef.current = true;
      return undefined;
    }

    animatedRef.current = true;
    const startedAt = performance.now();
    const duration = 420;
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        setDisplay(`${match[1]}${formatLikeTarget(match[2], numeric * eased)}${match[3]}`);
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return display;
}

function Metric({ label, value, tone, icon: Icon, sub }) {
  const display = useCountUp(value);
  return (
    <div className={cls("metric", tone)}>
      <div className="metric-head">
        <div>
          <span>{label}</span>
          <strong>{display}</strong>
        </div>
        {Icon && (
          <div className="metric-icon">
            <Icon size={19} />
          </div>
        )}
      </div>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}

function Bar({ label, value, max, tone }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className="bar"><i className={tone} style={{ width: `${pct}%` }} /></div>
      <strong>{pct}%</strong>
    </div>
  );
}

export { Bar, Metric, StatusBadge };
