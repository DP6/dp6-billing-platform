import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { chartColor } from "./palette";

/** Anel de progresso (0–100%) com o número no centro. Serve tanto de "donut" de cobertura
 *  (Alocação, specs/005-telas.md §4) quanto de "gauge" (Eficiência §5 — mesma forma,
 *  semântica diferente: aqui é sempre uma fração 0–1, nunca um valor absoluto). */
export function RingStat({
  pct,
  label,
  caption,
  size = 108,
}: {
  /** fração 0–1 (não %). */
  pct: number;
  label: string;
  caption?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  const data = [{ v: clamped }, { v: 1 - clamped }];
  const net = chartColor("net");
  const track = chartColor("other");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="v"
              startAngle={90}
              endAngle={-270}
              innerRadius={size * 0.36}
              outerRadius={size * 0.48}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={net} />
              <Cell fill={track} fillOpacity={0.22} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <span
          className="mono"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: size * 0.2,
            color: "var(--foreground)",
          }}
        >
          {Math.round(clamped * 100)}%
        </span>
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--foreground)" }}>{label}</span>
      {caption && <span style={{ fontSize: 11.5, color: "var(--ink-dim)" }}>{caption}</span>}
    </div>
  );
}
