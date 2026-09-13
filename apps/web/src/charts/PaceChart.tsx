import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "../lib/format";
import { axisStyle, chartColor } from "./palette";

export interface PacePoint {
  /** dia do mês (1..31) — eixo X comum às 2 séries. */
  day: number;
  /** acumulado do mês corrente até este dia; undefined além do dia de hoje. */
  current?: number;
  /** acumulado do mês anterior até o mesmo dia-do-mês; undefined se o mês anterior foi mais curto. */
  previous?: number;
}

/** Ritmo acumulado: mês corrente vs. mês anterior, dia a dia (specs/005-telas.md §2). */
export function PaceChart({ data, height = 220 }: { data: PacePoint[]; height?: number }) {
  const net = chartColor("net");
  const other = chartColor("other");
  return (
    <div className="chart-well">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--hair-strong)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={axisStyle}
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            tickFormatter={(v) => String(v)}
          />
          <YAxis width={52} tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => brl(v)} />
          <Tooltip
            labelFormatter={(v) => `dia ${v}`}
            formatter={
              ((v: unknown, name: unknown) => [
                brl(Number(v)),
                name === "current" ? "mês corrente" : "mês anterior",
              ]) as never
            }
            contentStyle={{
              background: "var(--ink)",
              border: 0,
              borderRadius: 4,
              color: "#f2f1ec",
              fontFamily: '"Ubuntu Mono", monospace',
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(v) => (v === "current" ? "mês corrente" : "mês anterior")}
          />
          <Line type="monotone" dataKey="previous" name="previous" stroke={other} strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="current" name="current" stroke={net} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
