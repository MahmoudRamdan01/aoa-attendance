import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

export interface DonutSlice {
  name: string
  value: number
  color: string
}

export default function StatusDonut({ data }: { data: DonutSlice[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={4}
          >
            {data.map((item) => (
              <Cell key={item.name} fill={item.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2 mt-3">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-[var(--c-ink)]">{item.name}</span>
            </div>
            <span className="text-xs font-semibold text-[var(--c-ink)]" dir="ltr">
              {item.value}
              {total ? ` · ${Math.round((item.value / total) * 100)}%` : ""}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
