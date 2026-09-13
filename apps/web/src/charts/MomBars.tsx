import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { brl, pct } from "../lib/format";
import { axisStyle, chartColor } from "./palette";

export interface MomBarPoint {
  label: string;
  net_cost_brl: number;
  /** null no 1º mês da série (sem mês anterior para comparar). */
  mom_pct: number | null;
  /** só preenchido no mês aberto — desenha a barra fantasma tracejada ao lado. */
  ghost_brl?: number;
}

/** Barras mensais com rótulo de Δ MoM acima de cada uma + barra "fantasma" tracejada
 *  de run-rate, só no mês aberto (specs/005-telas.md §2). */
export function MomBars({ data, height = 220 }: { data: MomBarPoint[]; height?: number }) {
  const net = chartColor("net");
  const other = chartColor("other");
  return (
    <div className="chart-well">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 22, right: 12, bottom: 4, left: 0 }} barGap={4}>
          <CartesianGrid stroke="var(--hair-strong)" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis width={52} tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => brl(v)} />
          <Tooltip
            formatter={
              ((v: unknown, name: unknown) => [
                brl(Number(v)),
                name === "ghost_brl" ? "run-rate projetado" : "líquido",
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
          <Bar dataKey="net_cost_brl" name="líquido" fill={net} maxBarSize={44} radius={[3, 3, 0, 0]}>
            <LabelList
              dataKey="mom_pct"
              position="top"
              formatter={((v: unknown) => (v == null ? "" : pct(v as number))) as never}
              style={{ fontSize: 11, fontFamily: '"Ubuntu Mono", monospace', fill: "var(--ink-dim)" }}
            />
          </Bar>
          <Bar
            dataKey="ghost_brl"
            name="run-rate projetado"
            fill="transparent"
            stroke={other}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            maxBarSize={44}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
