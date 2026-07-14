import { cls } from "../lib/cls";
import { statusLabels } from "../lib/labels";

function StatusBadge({ status }) {
  return <span className={cls("status-badge", status)}>{statusLabels[status] || status}</span>;
}

function Metric({ label, value, tone, icon: Icon, sub }) {
  return (
    <div className={cls("metric", tone)}>
      <div className="metric-head">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
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
