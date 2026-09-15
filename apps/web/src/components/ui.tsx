import { type CSSProperties, type ReactNode, useMemo, useState } from "react";

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

/** Barra de chips do drill-down por clique em gráfico (não confundir com o botão "Limpar
 *  filtros" da FilterBar do topo -- esta some sozinha quando não há nenhum clique ativo).
 *  `entries` já vem no formato [rótulo da dimensão, valor, dimensão] pra permitir remover
 *  1 de cada vez. */
export function DrillBar({
  entries,
  onRemove,
  onClearAll,
}: {
  entries: { dimLabel: string; value: string; dim: string }[];
  onRemove: (dim: string) => void;
  onClearAll: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: -4 }}>
      <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>Filtrando por (clique no gráfico):</span>
      {entries.map((e) => (
        <span
          key={e.dim}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 6px 3px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            color: "var(--foreground)",
            background: "var(--muted)",
            border: "1px solid var(--border-strong)",
          }}
        >
          {e.dimLabel}: <strong>{e.value}</strong>
          <button
            type="button"
            onClick={() => onRemove(e.dim)}
            aria-label={`Remover filtro de ${e.dimLabel}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              padding: 0,
              background: "transparent",
              border: 0,
              borderRadius: "50%",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
      {entries.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          style={{
            padding: "3px 8px",
            background: "transparent",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontSize: 11.5,
          }}
        >
          Limpar todos
        </button>
      )}
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

export interface DataTableCol<T> {
  key: string;
  label: string;
  num?: boolean;
  render: (r: T, i: number) => ReactNode;
  /** Valor bruto pra ordenar por essa coluna (clique no cabeçalho alterna asc/desc).
   *  Sem isso a coluna não fica clicável — `render` sozinho não dá pra comparar. */
  sort?: (r: T) => string | number;
}

/** Tabela com paginação, tamanho de página e ordenação por coluna — mesmo padrão do Atlas.
 *  `search`, quando passado, liga o campo de busca (filtra por substring, sem acento/caixa). */
export function DataTable<T>({
  cols,
  rows,
  search,
  defaultPageSize = 10,
}: {
  cols: DataTableCol<T>[];
  rows: T[];
  /** Texto pesquisável da linha inteira — sem isso o campo de busca não aparece. */
  search?: (r: T) => string;
  defaultPageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const filtered = useMemo(() => {
    if (!search || !query.trim()) return rows;
    const q = norm(query.trim());
    return rows.filter((r) => norm(search(r)).includes(q));
  }, [rows, search, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = cols.find((c) => c.key === sort.key);
    if (!col?.sort) return filtered;
    return [...filtered].sort((a, b) => {
      const va = col.sort!(a);
      const vb = col.sort!(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return cmp * sort.dir;
    });
  }, [filtered, sort, cols]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  const toggleSort = (col: DataTableCol<T>) => {
    if (!col.sort) return;
    setPage(0);
    setSort((s) => {
      if (s?.key !== col.key) return { key: col.key, dir: col.num ? -1 : 1 }; // numérica começa desc, texto asc
      return { key: col.key, dir: s.dir === 1 ? -1 : 1 };
    });
  };

  return (
    <div>
      {search && (
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Buscar nesta tabela…"
          style={{
            marginBottom: 8,
            padding: "6px 10px",
            fontSize: 12.5,
            width: "100%",
            maxWidth: 280,
            background: "var(--card)",
            color: "var(--foreground)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
          }}
        />
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="dt">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c)}
                  style={c.sort ? { cursor: "pointer", userSelect: "none" } : undefined}
                  title={c.sort ? "Ordenar" : undefined}
                >
                  {c.label}
                  {c.sort && (
                    <span style={{ marginLeft: 4, opacity: sort?.key === c.key ? 1 : 0.3 }}>
                      {sort?.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "▲"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={clampedPage * pageSize + i}>
                {cols.map((c) => (
                  <td key={c.key} className={c.num ? "num" : undefined}>
                    {c.render(r, clampedPage * pageSize + i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, fontSize: 12, color: "var(--muted-foreground)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Por página
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              style={{
                padding: "3px 6px",
                fontSize: 12,
                background: "var(--card)",
                color: "var(--foreground)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius)",
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          {pageCount > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={clampedPage === 0}
                style={pagerBtnStyle}
              >
                ‹
              </button>
              <span className="mono">{clampedPage + 1} de {pageCount}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={clampedPage >= pageCount - 1}
                style={pagerBtnStyle}
              >
                ›
              </button>
            </div>
          )}
          <span className="mono" style={{ marginLeft: pageCount > 1 ? 0 : "auto" }}>{sorted.length} linhas</span>
        </div>
      )}
    </div>
  );
}

const pagerBtnStyle: CSSProperties = {
  padding: "3px 9px",
  fontSize: 13,
  background: "transparent",
  color: "var(--foreground)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  cursor: "pointer",
};

/** Aviso inline (nunca bloqueia a tela) — borda esquerda + ícone, nunca só cor (WCAG 1.4.1). */
export function WarningCallout({ tone = "warn", children }: { tone?: "warn" | "neutral"; children: ReactNode }) {
  const accent = tone === "warn" ? "var(--warn)" : "var(--hair)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 16px",
        background: "var(--well)",
        border: "1px solid var(--hair)",
        borderLeft: `2px solid ${accent}`,
        borderRadius: "var(--radius)",
        fontSize: 13,
        color: "var(--ink-dim)",
      }}
    >
      {tone === "warn" && (
        <span aria-hidden="true" style={{ color: "var(--warn)", flex: "none" }}>
          ▲
        </span>
      )}
      <span>{children}</span>
    </div>
  );
}

export function LoadingOrError({ loading, error }: { loading?: boolean; error?: string }) {
  if (error) return <div style={{ color: "var(--bad)", fontSize: 13 }}>Erro ao carregar: {error}</div>;
  if (loading) return <div style={{ color: "var(--ink-mute)", fontSize: 13 }}>Carregando…</div>;
  return null;
}
