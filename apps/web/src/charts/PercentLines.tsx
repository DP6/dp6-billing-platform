import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pctPlain } from "../lib/format";
import { axisStyle, chartColor } from "./palette";

export interface PercentSeries {
  key: string;
  label: string;
  color: "net" | "alt" | "other";
}

/** Até 3 linhas de progressão percentual (0–1) — usado na progressão semanal de cobertura
 *  de label (specs/005-telas.md §4). Genérico: `series` define quais chaves do `data` plotar. */
export function PercentLines({
  data,
  series,
  height = 200,
}: {
  data: Record<string, string | number>[];
  series: PercentSeries[];
  height?: number;
}) {
  return (
    <div className="chart-well">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--hair-strong)" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis
            width={44}
            tick={axisStyle}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => pctPlain(Number(v), 0)}
          />
          <Tooltip
            formatter={((v: unknown, name: unknown) => [pctPlain(Number(v)), series.find((s) => s.key === name)?.label ?? String(name)]) as never}
            contentStyle={{
              background: "var(--ink)",
              border: 0,
              borderRadius: 4,
              color: "#f2f1ec",
              fontFamily: '"Ubuntu Mono", monospace',
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => series.find((s) => s.key === v)?.label ?? String(v)} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.key}
              stroke={chartColor(s.color)}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
