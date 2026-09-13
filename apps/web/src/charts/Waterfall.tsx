import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "../lib/format";
import { axisStyle, chartColor } from "./palette";

export interface WaterfallStep {
  label: string;
  value_brl: number;
  /** "meta" nunca deveria chegar aqui — filtrar antes de passar pro componente (shape() não
   *  sabe desenhar essa linha); aceito no tipo só pra bater com o DTO da API. */
  kind: "start" | "decrease" | "end" | "meta";
}

interface Row {
  label: string;
  base: number;
  delta: number;
  total: number;
  kind: WaterfallStep["kind"];
}

/** "start"/"end" = valor absoluto acumulado; "decrease" = delta com sinal (specs/005 §5). */
function shape(steps: WaterfallStep[]): Row[] {
  let cum = 0;
  return steps.map((s) => {
    if (s.kind === "decrease") {
      const from = cum;
      cum += s.value_brl;
      return { label: s.label, base: Math.min(from, cum), delta: Math.abs(s.value_brl), total: cum, kind: s.kind };
    }
    cum = s.value_brl;
    return { label: s.label, base: 0, delta: s.value_brl, total: cum, kind: s.kind };
  });
}

/** Do preço de tabela ao custo líquido, passo a passo (specs/005-telas.md §5). Barra invisível
 *  (`base`) empilhada + barra visível (`delta`) — técnica clássica de waterfall com Recharts. */
export function Waterfall({ steps, height = 220 }: { steps: WaterfallStep[]; height?: number }) {
  const rows = shape(steps);
  const colorOf = (kind: WaterfallStep["kind"]) => (kind === "decrease" ? chartColor("credit") : chartColor("net"));
  return (
    <div className="chart-well">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 22, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--hair-strong)" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis width={52} tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => brl(v)} />
          <Tooltip
            formatter={((v: unknown, name: unknown) => (name === "delta" ? [brl(Number(v)), "valor"] : ["", ""])) as never}
            contentStyle={{
              background: "var(--ink)",
              border: 0,
              borderRadius: 4,
              color: "#f2f1ec",
              fontFamily: '"Ubuntu Mono", monospace',
              fontSize: 12,
            }}
          />
          <Bar dataKey="base" stackId="s" fill="transparent" />
          <Bar dataKey="delta" stackId="s" maxBarSize={64} radius={[3, 3, 0, 0]}>
            <LabelList
              dataKey="total"
              position="top"
              formatter={((v: unknown) => brl(Number(v))) as never}
              style={{ fontSize: 11, fontFamily: '"Ubuntu Mono", monospace', fill: "var(--ink-dim)" }}
            />
            {rows.map((r, i) => (
              <Cell key={i} fill={colorOf(r.kind)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
