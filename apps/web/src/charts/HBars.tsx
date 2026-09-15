import { brl, pctPlain } from "../lib/format";
import { chartColor } from "./palette";

export interface HBarRow {
  label: string;
  value: number;
  pct?: number;
  /** valor bruto pra filtrar, quando difere do rótulo exibido (ex. "Custo por projeto":
   *  label é o project_name, mas o filtro espera project_id). Sem isso, usa `label`. */
  filterValue?: string;
  /** linha sintética (ex. "(não-alocado)") -- nunca clicável, não é um valor de dimensão real. */
  disabled?: boolean;
}

/** Barras horizontais (custo por serviço). 1ª = azul (destaque), demais = cinza; rótulo direto.
 *  `onSelect`, quando passado, torna cada linha clicável (drill-down por gráfico). */
export function HBars({
  rows,
  selected,
  onSelect,
}: {
  rows: HBarRow[];
  /** valor atualmente selecionado via clique -- destaca a linha correspondente. */
  selected?: string;
  onSelect?: (value: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  const net = chartColor("net");
  const other = chartColor("other");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
      {rows.map((r, i) => {
        const value = r.filterValue ?? r.label;
        const clickable = !r.disabled && !!onSelect;
        const isSelected = selected != null && selected === value;
        return (
          <div
            key={r.label}
            onClick={clickable ? () => onSelect!(value) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect!(value);
                    }
                  }
                : undefined
            }
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: clickable ? "pointer" : undefined,
              opacity: selected && !isSelected ? 0.5 : 1,
              borderRadius: 4,
              outline: isSelected ? `1px solid ${net}` : undefined,
              outlineOffset: 2,
            }}
          >
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
        );
      })}
    </div>
  );
}
