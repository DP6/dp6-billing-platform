import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "../lib/format";
import { chartColor } from "./palette";

export interface TrendPoint {
  label: string;
  value: number;
  ma7?: number;
}

/** Área de série temporal única (net cost diário) + linha de média móvel opcional.
 *  `formatValue` troca o formatador padrão (`brl`, 2 casas) — usar `brlPrecise` quando os
 *  valores são sub-centavo (ex. custo por request), senão tudo vira "R$ 0,00" arredondado. */
export function AreaTrend({
  data,
  height = 220,
  formatValue = brl,
}: {
  data: TrendPoint[];
  height?: number;
  formatValue?: (v: number | null | undefined) => string;
}) {
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
            tickFormatter={(v) => formatValue(v)}
          />
          <Tooltip
            formatter={((v: unknown, name: unknown) => [formatValue(Number(v)), name === "value" ? "líquido" : "média 7d"]) as never}
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
