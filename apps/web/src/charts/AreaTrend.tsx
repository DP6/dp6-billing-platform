import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "../lib/format";
import { chartColor } from "./palette";

export interface TrendPoint {
  label: string;
  value: number;
  ma7?: number;
}

/** Área de série temporal única (net cost diário) + linha de média móvel opcional. */
export function AreaTrend({ data, height = 220 }: { data: TrendPoint[]; height?: number }) {
  const net = chartColor("net");
  const other = chartColor("other");
  return (
    <div className="chart-well">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--hair-strong)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--ink-dim)" }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis
            width={52}
            tick={{ fontSize: 10, fill: "var(--ink-dim)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => brl(v)}
          />
          <Tooltip
            formatter={((v: unknown, name: unknown) => [brl(Number(v)), name === "value" ? "líquido" : "média 7d"]) as never}
            contentStyle={{ background: "var(--ink)", border: 0, borderRadius: 4, color: "#f2f1ec", fontFamily: '"Ubuntu Mono", monospace', fontSize: 12 }}
          />
          <Area type="monotone" dataKey="value" stroke={net} strokeWidth={2} fill={net} fillOpacity={0.14} />
          {data.some((d) => d.ma7 != null) && (
            <Line type="monotone" dataKey="ma7" stroke={other} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
