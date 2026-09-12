import { useState } from "react";
import { NavLink, Route, Routes, useSearchParams } from "react-router-dom";
import { useApi } from "./lib/api";
import { relativeToNow } from "./lib/format";
import {
  type Filters,
  PERIOD_LABELS,
  type Period,
  hasActiveFilters,
  resolveWindow,
  useFilters,
} from "./lib/useFilters";
import { useTheme } from "./lib/useTheme";
import { Alocacao } from "./screens/Alocacao";
import { Anomalias } from "./screens/Anomalias";
import { Orcamento } from "./screens/Orcamento";
import { Otimizacao } from "./screens/Otimizacao";
import { Servicos } from "./screens/Servicos";
import { Tendencia } from "./screens/Tendencia";
import { UnitEconomicsScreen } from "./screens/UnitEconomics";
import { VisaoGeral } from "./screens/VisaoGeral";
import type { Dimensions, Meta } from "./types";

const TABS = [
  ["/", "Visão geral", VisaoGeral],
  ["/orcamento", "Orçamento", Orcamento],
  ["/tendencia", "Tendência", Tendencia],
  ["/alocacao", "Alocação", Alocacao],
  ["/servicos", "Serviços & SKUs", Servicos],
  ["/otimizacao", "Otimização", Otimizacao],
  ["/unit-economics", "Unit economics", UnitEconomicsScreen],
  ["/anomalias", "Anomalias", Anomalias],
] as const;

const eyebrow = {
  font: "500 10px/1 Ubuntu, sans-serif",
  letterSpacing: ".18em",
  textTransform: "uppercase" as const,
  color: "var(--muted-foreground)",
};
const selectStyle = {
  padding: "7px 10px",
  background: "var(--card)",
  color: "var(--foreground)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  minWidth: 130,
};

function TopBar() {
  const { theme, toggle } = useTheme();
  const meta = useApi<Meta>("/meta");
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 14,
        height: 52,
        padding: "0 28px",
        background: "#1d1d1b",
        color: "#f2f1ec",
      }}
    >
      <svg width="24" height="16" viewBox="0 0 26 18" aria-hidden="true">
        <path d="M2 18 L2 12 L7 10 L7 18 Z" fill="#ffb302" />
        <path d="M10 18 L10 7 L15 5 L15 18 Z" fill="#ffb302" />
        <path d="M18 18 L18 2 L23 0 L23 18 Z" fill="#ffb302" />
      </svg>
      <span style={{ fontWeight: 500 }}>Billing Platform</span>
      <span style={{ color: "#a7abb0", fontSize: 13 }}>· custo da conta inteira</span>
      <span style={{ flex: 1 }} />
      {meta.data?.data_updated_at && (
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "#d9d6cc",
            border: "1px solid #4a4a44",
            borderRadius: 999,
            padding: "4px 9px",
          }}
          title={new Date(meta.data.data_updated_at).toLocaleString("pt-BR")}
        >
          dados {relativeToNow(meta.data.data_updated_at)}
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label="Alternar tema"
        style={{
          width: 34,
          height: 34,
          background: "transparent",
          border: "1px solid #4a4a44",
          borderRadius: "var(--radius)",
          cursor: "pointer",
          color: "#f2f1ec",
        }}
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>
    </header>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={eyebrow}>{label}</span>
      {children}
    </div>
  );
}

function FilterBar() {
  const [f, setF] = useFilters();
  const dims = useApi<Dimensions>("/dimensions");
  const [customOpen, setCustomOpen] = useState(f.period === "custom");

  const pick = (key: keyof Filters, value: string) => setF({ [key]: value } as Partial<Filters>);

  return (
    <div
      style={{
        position: "sticky",
        top: 52,
        zIndex: 20,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: "12px 20px",
        padding: "12px 28px",
        background: "var(--muted)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Field label="Período">
        <select
          value={f.period}
          onChange={(e) => {
            const p = e.target.value as Period;
            setCustomOpen(p === "custom");
            if (p === "custom") {
              // semeia as datas com a janela atual — evita campos vazios / query sem datas
              const w = resolveWindow(f);
              setF({ period: "custom", from: f.from ?? w.from, to: f.to ?? w.to });
            } else {
              setF({ period: p });
            }
          }}
          style={selectStyle}
        >
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </select>
      </Field>

      {customOpen && (
        <>
          <Field label="De">
            <input
              type="date"
              value={f.from ?? ""}
              onChange={(e) => setF({ period: "custom", from: e.target.value })}
              style={selectStyle}
            />
          </Field>
          <Field label="Até">
            <input
              type="date"
              value={f.to ?? ""}
              onChange={(e) => setF({ period: "custom", to: e.target.value })}
              style={selectStyle}
            />
          </Field>
        </>
      )}

      <Field label="Serviço">
        <select value={f.service ?? ""} onChange={(e) => pick("service", e.target.value)} style={selectStyle}>
          <option value="">Todos</option>
          {(dims.data?.services ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Ambiente">
        <select
          value={f.environment ?? ""}
          onChange={(e) => pick("environment", e.target.value)}
          style={selectStyle}
        >
          <option value="">Todos</option>
          {(dims.data?.environments ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="App">
        <select value={f.app ?? ""} onChange={(e) => pick("app", e.target.value)} style={selectStyle}>
          <option value="">Todos</option>
          {(dims.data?.apps ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Projeto">
        <select value={f.project ?? ""} onChange={(e) => pick("project", e.target.value)} style={selectStyle}>
          <option value="">Todos</option>
          {(dims.data?.projects ?? []).map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {p.project_name}
            </option>
          ))}
        </select>
      </Field>

      {hasActiveFilters(f) && (
        <button
          type="button"
          onClick={() => {
            setCustomOpen(false);
            setF({
              period: "mes",
              from: undefined,
              to: undefined,
              service: "",
              environment: "",
              app: "",
              project: "",
            });
          }}
          style={{
            marginLeft: "auto",
            alignSelf: "center",
            padding: "7px 12px",
            background: "transparent",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontSize: 12.5,
          }}
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

export default function App() {
  return (
    <>
      <TopBar />
      <FilterBar />
      <nav
        style={{
          display: "flex",
          padding: "0 20px",
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
          background: "var(--background)",
        }}
      >
        {TABS.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            style={({ isActive }) => ({
              padding: "13px 13px 11px",
              whiteSpace: "nowrap",
              fontSize: 14,
              textDecoration: "none",
              color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
              fontWeight: isActive ? 500 : 400,
              borderBottom: `2px solid ${isActive ? "var(--primary)" : "transparent"}`,
            })}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Screens />
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          background: "#1d1d1b",
          color: "#a7abb0",
          padding: "16px 28px",
          font: '400 11.5px/1.5 "Ubuntu Mono", monospace',
        }}
      >
        dp6-billing-platform / apps/web · painel FinOps da conta de faturamento · dados via apps/api (rpt_* no BigQuery,
        ou modo mock)
      </footer>
    </>
  );
}

/** Assina a querystring aqui para que a tela roteada re-renderize quando um filtro
 *  muda (o elemento <Comp/> criado num App que não re-renderiza seria estável e o
 *  React poderia pular a atualização da tela). */
function Screens() {
  useSearchParams();
  return (
    <main
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: "28px",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      <Routes>
        {TABS.map(([to, , Comp]) => (
          <Route key={to} path={to} element={<Comp />} />
        ))}
      </Routes>
    </main>
  );
}
