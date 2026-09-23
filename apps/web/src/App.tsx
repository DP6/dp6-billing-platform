import { useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { apiPost, useApi } from "./lib/api";
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
import { Adm } from "./screens/Adm";
import { Alocacao } from "./screens/Alocacao";
import { Anomalias } from "./screens/Anomalias";
import { Eficiencia } from "./screens/Eficiencia";
import { Servicos } from "./screens/Servicos";
import { Tendencia } from "./screens/Tendencia";
import { VisaoGeral } from "./screens/VisaoGeral";
import type { Dimensions, Me, Meta } from "./types";

// IA de 6 abas (specs/005-telas.md §0, era 8 — ver docs/adr/ADR-009-ia-6-abas.md):
// Orçamento fundiu em Visão Geral; Otimização + Unit economics fundiram em Eficiência.
type Tab = readonly [string, string, React.ComponentType];

const BASE_TABS: Tab[] = [
  ["/", "Visão geral", VisaoGeral],
  ["/tendencia", "Tendência", Tendencia],
  ["/servicos", "Serviços & SKUs", Servicos],
  ["/alocacao", "Alocação", Alocacao],
  ["/eficiencia", "Eficiência & economia", Eficiencia],
  ["/anomalias", "Anomalias", Anomalias],
];

// ADM não é mais uma aba na lista (App.tsx, PR "ícone de ADM no TopBar") --
// vira um ícone fixo no canto superior direito, só pra quem passa no
// require_admin do backend (e-mail bootstrap + lista autogerenciável em
// firestore.get_admins_or_empty, ver auth.py). A rota /adm continua
// registrada em Screens() incondicionalmente: quem não é admin só não vê o
// ícone (a garantia de verdade é o backend, que 403 em qualquer /adm/*
// mesmo se alguém digitar a URL na mão -- mesmo espírito do MeDTO.is_admin,
// "UI convenience only"). /me é chamado 2x de propósito (aqui e em
// Screens()), mesmo padrão que FilterBar/VisaoGeral já usam pra /dimensions,
// sem levantar state.
function useIsAdmin(): boolean {
  const me = useApi<Me>("/me");
  return me.data?.is_admin ?? false;
}

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

function AdmIcon() {
  const isAdmin = useIsAdmin();
  const location = useLocation();
  if (!isAdmin) return null;
  const active = location.pathname === "/adm";
  return (
    <Link
      to="/adm"
      aria-label="Administração"
      title="Administração"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        background: active ? "rgba(255,179,2,0.16)" : "transparent",
        border: `1px solid ${active ? "#ffb302" : "#4a4a44"}`,
        borderRadius: "var(--radius)",
        color: active ? "#ffb302" : "#f2f1ec",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden="true"
      >
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
        <path d="M9.5 12l1.8 1.8L15 10" />
      </svg>
    </Link>
  );
}

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
      <AdmIcon />
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
      <button
        type="button"
        onClick={() => apiPost("/auth/logout").finally(() => (window.location.href = "/login"))}
        style={{
          padding: "6px 12px",
          background: "transparent",
          border: "1px solid #4a4a44",
          borderRadius: "var(--radius)",
          cursor: "pointer",
          color: "#f2f1ec",
          fontSize: 12.5,
        }}
      >
        Sair
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
  const tabs = BASE_TABS;
  // sp aqui só serve pra repassar a querystring atual nos links de aba (abaixo) --
  // NavLink a="/rota" descarta location.search por padrão, o que derrubava
  // service/environment/app/project/from/to a cada troca de tela.
  const [sp] = useSearchParams();
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
        {tabs.map(([to, label]) => (
          <NavLink
            key={to}
            to={{ pathname: to, search: sp.toString() }}
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
  const tabs = BASE_TABS;
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
        {tabs.map(([to, , Comp]) => (
          <Route key={to} path={to} element={<Comp />} />
        ))}
        {/* fora do tabs.map de propósito -- não aparece na barra de abas (é o
            ícone do TopBar, ver AdmIcon), mas a rota existe pra todo mundo;
            quem não é admin só recebe 403 de cada /adm/* (require_admin no
            backend é a garantia de verdade, não esconder a rota). */}
        <Route path="/adm" element={<Adm />} />
      </Routes>
    </main>
  );
}
