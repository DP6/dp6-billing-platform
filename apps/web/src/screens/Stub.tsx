import { Card, LoadingOrError } from "../components/ui";
import { useApi } from "../lib/api";
import { filterParams, useFilters } from "../lib/useFilters";

/**
 * Tela ainda não desenhada — mostra o cabeçalho + o payload dos endpoints já ligados.
 * Construir a partir de mock/canvas/<Artboard>.dc.html (specs/002, docs/data-contract.md).
 */
export function Stub({
  eyebrow, title, desc, artboard, endpoints,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  artboard: string;
  endpoints: { label: string; path: string; withFilters?: boolean }[];
}) {
  const [f] = useFilters();
  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span className="eyebrow">{eyebrow}</span>
        <h1 style={{ fontSize: 22 }}>{title}</h1>
        <p style={{ margin: 0, color: "var(--ink-dim)", fontSize: 13.5, maxWidth: "72ch" }}>{desc}</p>
      </header>
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 16px",
          background: "var(--well)",
          border: "1px solid var(--hair)",
          borderLeft: "2px solid var(--accent)",
          borderRadius: 6,
          fontSize: 13,
          color: "var(--ink-dim)",
        }}
      >
        Tela a construir a partir de <span className="mono">mock/canvas/{artboard}</span>. Endpoints já ligados —
        payload abaixo.
      </div>
      {endpoints.map((e) => (
        <EndpointPreview key={e.path} label={e.label} path={e.path} params={e.withFilters ? filterParams(f) : { currency: f.currency }} />
      ))}
    </>
  );
}

function EndpointPreview({ label, path, params }: { label: string; path: string; params: Record<string, string | undefined> }) {
  const { data, loading, error } = useApi<unknown>(path, params);
  return (
    <Card title={label} cap={`GET /api${path}`}>
      <LoadingOrError loading={loading} error={error} />
      {data != null && (
        <pre
          style={{
            margin: "8px 0 0",
            padding: 12,
            background: "var(--well)",
            borderRadius: 6,
            fontFamily: '"Ubuntu Mono", monospace',
            fontSize: 12,
            color: "var(--ink)",
            overflowX: "auto",
            maxHeight: 320,
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </Card>
  );
}
