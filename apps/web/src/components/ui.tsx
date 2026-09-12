import type { CSSProperties, ReactNode } from "react";

export function Card({ title, cap, children }: { title?: string; cap?: string; children: ReactNode }) {
  return (
    <div className="card">
      {title && <h3>{title}</h3>}
      {cap && <p className="cap">{cap}</p>}
      {children}
    </div>
  );
}

/** Bloco nomeado (espelha o `Panel` do Atlas). Um `<h3>` real + caption opcional + slot de acoes. */
export function Panel({
  title,
  cap,
  actions,
  children,
}: {
  title?: string;
  cap?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          {title && <h3>{title}</h3>}
          {actions}
        </div>
      )}
      {cap && <p className="cap">{cap}</p>}
      {children}
    </section>
  );
}

/** Cabecalho de rota — um <h1> por tela (espelha o `PageHeader` do Atlas). */
export function PageHeader({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  desc?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 style={{ fontSize: "var(--text-display)", lineHeight: 1.2 }}>{title}</h1>
        {desc && (
          <p
            style={{ margin: "2px 0 0", color: "var(--muted-foreground)", fontSize: 13.5, maxWidth: "72ch" }}
          >
            {desc}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}

/** Estado sempre com icone + texto, nunca so cor (WCAG 1.4.1). */
export function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "error" | "neutral";
  children: ReactNode;
}) {
  const map = {
    ok: { fg: "var(--status-ok-foreground)", fill: "var(--status-ok)", mark: "✓" },
    warn: { fg: "var(--status-warn-foreground)", fill: "var(--status-warn)", mark: "▲" },
    error: { fg: "var(--status-error-foreground)", fill: "var(--status-error)", mark: "✕" },
    neutral: { fg: "var(--muted-foreground)", fill: "var(--muted-foreground)", mark: "•" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 500,
        color: map.fg,
        background: `color-mix(in srgb, ${map.fill} 14%, transparent)`,
      }}
    >
      <span aria-hidden="true">{map.mark}</span>
      {children}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "ok" | "bad" | "neutral";
}) {
  const color = tone === "ok" ? "var(--ok)" : tone === "bad" ? "var(--bad)" : "var(--ink)";
  return (
    <div
      className="dp6-corner"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--hair)",
        borderRadius: "var(--radius)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span
        style={{
          font: "500 10px/1.3 Ubuntu, sans-serif",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--ink-dim)",
        }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-.02em", lineHeight: 1.05, color }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>{sub}</span>}
    </div>
  );
}

/** Grid de KPIs. `cols` fixa o nº de colunas em telas largas (colapsa via CSS var);
 *  sem `cols`, usa auto-fit. Evita o layout 5+1 quando há 6 tiles. */
export function MetricGrid({ children, cols }: { children: ReactNode; cols?: number }) {
  const style: CSSProperties = cols
    ? {
        display: "grid",
        gap: 14,
        gridTemplateColumns: `repeat(var(--mg-cols, ${cols}), minmax(0, 1fr))`,
      }
    : { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" };
  return (
    <>
      {cols ? (
        <style>{`
          @media (max-width: 1080px){ [data-mg]{ --mg-cols: 3 } }
          @media (max-width: 620px){ [data-mg]{ --mg-cols: 2 } }
        `}</style>
      ) : null}
      <div data-mg style={style}>
        {children}
      </div>
    </>
  );
}

export function Chip({ tone, children }: { tone: "ok" | "warn" | "bad"; children: ReactNode }) {
  const c = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--bad)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 500,
        color: c,
        background: `color-mix(in srgb, ${c} 15%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function DataTable<T>({
  cols,
  rows,
}: {
  cols: { key: string; label: string; num?: boolean; render: (r: T, i: number) => ReactNode }[];
  rows: T[];
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="dt">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key} className={c.num ? "num" : undefined}>
                  {c.render(r, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LoadingOrError({ loading, error }: { loading?: boolean; error?: string }) {
  if (error) return <div style={{ color: "var(--bad)", fontSize: 13 }}>Erro ao carregar: {error}</div>;
  if (loading) return <div style={{ color: "var(--ink-mute)", fontSize: 13 }}>Carregando…</div>;
  return null;
}
