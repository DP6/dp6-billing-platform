import type { CSSProperties } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { brl, dayLabel, monthLabel } from "../lib/format";
import type { CostSeriesPoint } from "../types";
import { chartColor } from "./palette";

export type Grain = "day" | "month";
export type GroupBy = "none" | "service" | "environment" | "app";

const GROUP_LABEL: Record<GroupBy, string> = {
  none: "Nenhum",
  service: "Serviço",
  environment: "Ambiente",
  app: "App",
};

const MAX_SERIES = 5;
const selectCss: CSSProperties = {
  padding: "5px 8px",
  fontSize: 12,
  background: "var(--card)",
  color: "var(--foreground)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
};

interface Row {
  period: string;
  label: string;
  __cum: number;
  __ma7?: number;
  [k: string]: number | string | undefined;
}

/** Pivota a série longa para largo, agrega a cauda em "Outros", calcula acumulado e média 7d. */
function shape(data: CostSeriesPoint[], grain: Grain): { rows: Row[]; keys: string[] } {
  const periods = [...new Set(data.map((d) => d.period))].sort();
  const totalByKey = new Map<string, number>();
  for (const d of data) totalByKey.set(d.key, (totalByKey.get(d.key) ?? 0) + d.net_cost_brl);
  const ordered = [...totalByKey.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const isSingle = ordered.length === 1 && ordered[0] === "total";
  const keys = isSingle
    ? ["total"]
    : [...ordered.slice(0, MAX_SERIES), ...(ordered.length > MAX_SERIES ? ["Outros"] : [])];
  const keySet = new Set(keys);

  const byPeriod = new Map<string, Record<string, number>>();
  for (const d of data) {
    const bucket = byPeriod.get(d.period) ?? {};
    const k = keySet.has(d.key) ? d.key : "Outros";
    bucket[k] = (bucket[k] ?? 0) + d.net_cost_brl;
    byPeriod.set(d.period, bucket);
  }

  let cum = 0;
  const totals: number[] = [];
  const rows: Row[] = periods.map((p) => {
    const bucket = byPeriod.get(p) ?? {};
    const tot = keys.reduce((s, k) => s + (bucket[k] ?? 0), 0);
    cum += tot;
    totals.push(tot);
    return {
      period: p,
      label: grain === "month" ? monthLabel(p) : dayLabel(p),
      __cum: cum,
      ...Object.fromEntries(keys.map((k) => [k, bucket[k] ?? 0])),
    };
  });
  if (grain === "day") {
    rows.forEach((r, i) => {
      const w = totals.slice(Math.max(0, i - 6), i + 1);
      r.__ma7 = w.reduce((a, b) => a + b, 0) / w.length;
    });
  }
  return { rows, keys };
}

const barColor = (i: number) =>
  i === 0 ? chartColor("net") : i === 1 ? chartColor("alt") : chartColor("other");

export function TemporalChart({
  data,
  grain,
  groupBy,
  onChange,
  height = 260,
}: {
  data: CostSeriesPoint[] | undefined;
  grain: Grain;
  groupBy: GroupBy;
  onChange: (p: { grain: Grain; groupBy: GroupBy }) => void;
  height?: number;
}) {
  const { rows, keys } = data ? shape(data, grain) : { rows: [], keys: [] };
  const single = keys.length === 1 && keys[0] === "total";

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              font: "500 10px/1 Ubuntu",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
            }}
          >
            Granularidade
          </span>
          <select
            value={grain}
            onChange={(e) => onChange({ grain: e.target.value as Grain, groupBy })}
            style={selectCss}
          >
            <option value="day">Dia</option>
            <option value="month">Mês</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              font: "500 10px/1 Ubuntu",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
            }}
          >
            Empilhar por
          </span>
          <select
            value={groupBy}
            onChange={(e) => onChange({ grain, groupBy: e.target.value as GroupBy })}
            style={selectCss}
          >
            {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chart-well" style={{ marginTop: 10 }}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={rows} margin={{ top: 8, right: 46, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--hair-strong)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--ink-dim)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              yAxisId="bar"
              width={52}
              tick={{ fontSize: 10, fill: "var(--ink-dim)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => brl(v)}
            />
            <YAxis
              yAxisId="cum"
              orientation="right"
              width={46}
              tick={{ fontSize: 10, fill: "var(--ink-dim)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => brl(v)}
            />
            <Tooltip
              formatter={
                ((v: unknown, name: unknown) => [
                  brl(Number(v)),
                  name === "__cum" ? "acumulado" : name === "__ma7" ? "média 7d" : String(name),
                ]) as never
              }
              contentStyle={{
                background: "var(--foreground)",
                border: 0,
                borderRadius: 4,
                color: "var(--background)",
                fontFamily: '"Ubuntu Mono", monospace',
                fontSize: 12,
              }}
            />
            {!single && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {(single ? ["total"] : keys).map((k, i) => (
              <Bar
                key={k}
                yAxisId="bar"
                dataKey={k}
                stackId="s"
                name={single ? "líquido" : k}
                fill={barColor(i)}
                maxBarSize={34}
              />
            ))}
            <Line
              yAxisId="cum"
              type="monotone"
              dataKey="__cum"
              name="acumulado"
              stroke={chartColor("net")}
              strokeWidth={2}
              dot={false}
            />
            {grain === "day" && (
              <Line
                yAxisId="bar"
                type="monotone"
                dataKey="__ma7"
                name="média 7d"
                stroke={chartColor("other")}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
