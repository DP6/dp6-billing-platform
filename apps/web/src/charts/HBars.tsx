import { brl, pctPlain } from "../lib/format";
import { chartColor } from "./palette";

export interface HBarRow {
  label: string;
  value: number;
  pct?: number;
}

/** Barras horizontais (custo por serviço). 1ª = azul (destaque), demais = cinza; rótulo direto. */
export function HBars({ rows }: { rows: HBarRow[] }) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  const net = chartColor("net");
  const other = chartColor("other");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: "0 0 118px", fontSize: 12.5, color: "var(--ink-dim)" }}>{r.label}</span>
          <span style={{ flex: 1, height: 15, background: "var(--well)", borderRadius: 3, overflow: "hidden" }}>
            <span
              style={{
                display: "block",
                height: "100%",
                width: `${Math.max((r.value / max) * 100, 0.6)}%`,
                background: i === 0 ? net : other,
                borderRadius: "0 3px 3px 0",
              }}
            />
          </span>
          <span className="mono" style={{ flex: "0 0 66px", textAlign: "right", fontSize: 12.5 }}>
            {brl(r.value)}
          </span>
          {r.pct != null && (
            <span className="mono" style={{ flex: "0 0 44px", textAlign: "right", fontSize: 11, color: "var(--ink-mute)" }}>
              {pctPlain(r.pct, 0)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
