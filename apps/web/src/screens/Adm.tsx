import { type CSSProperties, useEffect, useState } from "react";
import { DataTable, type DataTableCol, LoadingOrError, PageHeader, Panel } from "../components/ui";
import { apiDelete, apiPost, apiPut, useApi, useMutationState } from "../lib/api";
import { brl } from "../lib/format";
import type { BudgetConfig, Dimensions, SendNowResult, WeeklyReportConfig } from "../types";

const ACCOUNT_SCOPE = "_account";

const fieldLabel: CSSProperties = {
  font: "500 10px/1 Ubuntu, sans-serif",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--muted-foreground)",
};
const inputStyle: CSSProperties = {
  padding: "7px 10px",
  background: "var(--card)",
  color: "var(--foreground)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
};
const btnStyle: CSSProperties = {
  padding: "7px 14px",
  background: "var(--primary)",
  color: "var(--primary-foreground)",
  border: "none",
  borderRadius: "var(--radius)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};
const btnGhostStyle: CSSProperties = {
  ...btnStyle,
  background: "transparent",
  color: "var(--foreground)",
  border: "1px solid var(--border-strong)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

/** Form de cadastro/edição de 1 budget (conta inteira, ou 1 projeto). Reaproveitado
 *  nos dois painéis — só muda se `scope` é fixo (conta/edição) ou escolhível (novo). */
function BudgetForm({
  scope,
  scopeLabel,
  initial,
  onSaved,
}: {
  scope: string;
  scopeLabel?: string;
  initial?: BudgetConfig;
  onSaved: () => void;
}) {
  const [budgetBrl, setBudgetBrl] = useState(String(initial?.budget_brl ?? ""));
  const [emails, setEmails] = useState((initial?.emails ?? []).join(", "));
  const { loading, error, run } = useMutationState<BudgetConfig>();

  useEffect(() => {
    setBudgetBrl(String(initial?.budget_brl ?? ""));
    setEmails((initial?.emails ?? []).join(", "));
  }, [initial]);

  const save = async () => {
    const list = emails.split(",").map((e) => e.trim()).filter(Boolean);
    await run(() =>
      apiPut<BudgetConfig>(`/adm/budgets/${encodeURIComponent(scope)}`, {
        budget_brl: Number(budgetBrl.replace(",", ".")) || 0,
        emails: list,
      }),
    );
    onSaved();
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "10px 16px" }}>
      {scopeLabel && (
        <Field label="Escopo">
          <span style={{ ...inputStyle, minWidth: 160, display: "inline-block" }}>{scopeLabel}</span>
        </Field>
      )}
      <Field label="Orçamento mensal (R$)">
        <input
          type="number"
          step="0.01"
          min="0"
          value={budgetBrl}
          onChange={(e) => setBudgetBrl(e.target.value)}
          style={{ ...inputStyle, width: 140 }}
        />
      </Field>
      <Field label="E-mails responsáveis (grupo e/ou avulso, separados por vírgula)">
        <input
          type="text"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="time-x@dp6.com.br, fulano@dp6.com.br"
          style={{ ...inputStyle, minWidth: 320 }}
        />
      </Field>
      <button type="button" onClick={save} disabled={loading} style={btnStyle}>
        {loading ? "Salvando…" : "Salvar"}
      </button>
      {error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</span>}
    </div>
  );
}

function AccountBudgetPanel() {
  const budgets = useApi<BudgetConfig[]>("/adm/budgets");
  const [reloadKey, setReloadKey] = useState(0);
  const account = budgets.data?.find((b) => b.scope === ACCOUNT_SCOPE);

  return (
    <Panel title="Orçamento geral da conta" cap="Aplicado quando nenhum filtro de projeto está ativo.">
      <LoadingOrError loading={budgets.loading} error={budgets.error} />
      {!budgets.loading && !budgets.error && (
        <BudgetForm
          key={reloadKey + (account?.updated_at ?? "")}
          scope={ACCOUNT_SCOPE}
          initial={account}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </Panel>
  );
}

function ProjectBudgetsPanel() {
  const [reloadKey, setReloadKey] = useState(0);
  const budgets = useApi<BudgetConfig[]>("/adm/budgets", { _r: String(reloadKey) });
  const dims = useApi<Dimensions>("/dimensions");
  const [editing, setEditing] = useState<string | null>(null); // project_id sendo editado/criado

  const projectBudgets = (budgets.data ?? []).filter((b) => b.scope !== ACCOUNT_SCOPE);
  const configuredIds = new Set(projectBudgets.map((b) => b.scope));
  const bump = () => {
    setReloadKey((k) => k + 1);
    setEditing(null);
  };

  const del = useMutationState<void>();
  const remove = async (scope: string) => {
    if (!confirm(`Excluir o orçamento de ${scope}?`)) return;
    await del.run(() => apiDelete<void>(`/adm/budgets/${encodeURIComponent(scope)}`));
    bump();
  };

  const cols: DataTableCol<BudgetConfig>[] = [
    { key: "project", label: "Projeto", render: (r) => r.project_name ?? r.scope, sort: (r) => r.project_name ?? r.scope },
    { key: "budget", label: "Orçamento", num: true, render: (r) => brl(r.budget_brl), sort: (r) => r.budget_brl },
    { key: "emails", label: "E-mails", render: (r) => r.emails.join(", ") || "—" },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => setEditing(r.scope)} style={{ ...btnGhostStyle, padding: "4px 10px", fontSize: 12 }}>
            editar
          </button>
          <button type="button" onClick={() => remove(r.scope)} style={{ ...btnGhostStyle, padding: "4px 10px", fontSize: 12, color: "var(--bad)" }}>
            excluir
          </button>
        </div>
      ),
    },
  ];

  const editingRow = editing ? projectBudgets.find((b) => b.scope === editing) : undefined;
  const editingProject = dims.data?.projects.find((p) => p.project_id === editing);
  const newCandidates = (dims.data?.projects ?? []).filter((p) => !configuredIds.has(p.project_id));

  return (
    <Panel title="Orçamento por projeto" cap="O orçamento mostrado na Visão geral segue o filtro de Projeto do topo.">
      <LoadingOrError loading={budgets.loading || dims.loading} error={budgets.error ?? dims.error} />
      {!budgets.loading && !budgets.error && (
        <>
          {projectBudgets.length > 0 && <DataTable cols={cols} rows={projectBudgets} defaultPageSize={10} />}

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            {editing ? (
              <BudgetForm
                key={editing}
                scope={editing}
                scopeLabel={editingRow?.project_name ?? editingProject?.project_name ?? editing}
                initial={editingRow}
                onSaved={bump}
              />
            ) : (
              <Field label="Adicionar orçamento de projeto">
                <select
                  value=""
                  onChange={(e) => e.target.value && setEditing(e.target.value)}
                  style={{ ...inputStyle, minWidth: 260 }}
                >
                  <option value="">Escolher projeto…</option>
                  {newCandidates.map((p) => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.project_name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {editing && (
              <button type="button" onClick={() => setEditing(null)} style={{ ...btnGhostStyle, marginTop: 10, padding: "4px 10px", fontSize: 12 }}>
                cancelar
              </button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function WeeklyReportPanel() {
  const [reloadKey, setReloadKey] = useState(0);
  const cfg = useApi<WeeklyReportConfig>("/adm/weekly-report/config", { _r: String(reloadKey) });
  const toggle = useMutationState<WeeklyReportConfig>();
  const send = useMutationState<SendNowResult>();
  const [result, setResult] = useState<SendNowResult | null>(null);

  const setEnabled = async (enabled: boolean) => {
    await toggle.run(() => apiPut<WeeklyReportConfig>("/adm/weekly-report/config", { enabled }));
    setReloadKey((k) => k + 1);
  };

  const sendNow = async () => {
    const r = await send.run(() => apiPost<SendNowResult>("/adm/weekly-report/send-now"));
    setResult(r);
  };

  return (
    <Panel
      title="Relatório semanal por e-mail"
      cap="Toda segunda, 08:00 — gasto no mês, % do orçamento, run-rate, comparação com o mês anterior e últimos 7 dias, com gráficos. Enviado pra cada e-mail cadastrado nos orçamentos acima."
    >
      <LoadingOrError loading={cfg.loading} error={cfg.error} />
      {!cfg.loading && !cfg.error && cfg.data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <input type="checkbox" checked={cfg.data.enabled} disabled={toggle.loading} onChange={(e) => setEnabled(e.target.checked)} />
              Envio automático ativado
            </label>
            <button type="button" onClick={sendNow} disabled={send.loading} style={btnStyle}>
              {send.loading ? "Enviando…" : "Enviar agora"}
            </button>
            {cfg.data.last_run_at && (
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                última execução: {new Date(cfg.data.last_run_at).toLocaleString("pt-BR")} ({cfg.data.last_run_status})
              </span>
            )}
          </div>
          {send.error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{send.error}</span>}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
                {result.dry_run
                  ? "Modo dry-run (ambiente não é produção) — e-mail NÃO foi enviado de verdade, veja a prévia abaixo."
                  : `Enviado: ${result.scopes_sent.join(", ") || "nenhum"}.`}
                {result.scopes_failed.length > 0 && ` Falharam: ${result.scopes_failed.join(", ")}.`}
              </span>
              {result.preview_html && (
                <div
                  style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, background: "var(--card)" }}
                  // conteúdo gerado pelo nosso próprio backend (email_report.py), não input de usuário.
                  dangerouslySetInnerHTML={{ __html: result.preview_html }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function Adm() {
  return (
    <>
      <PageHeader
        eyebrow="Restrito"
        title="ADM"
        desc="Cadastro de orçamento e e-mails responsáveis (grupo gcp-dp6-gti@dp6.com.br + matheus.fuzati@dp6.com.br) e relatório semanal de custo por e-mail."
      />
      <AccountBudgetPanel />
      <ProjectBudgetsPanel />
      <WeeklyReportPanel />
    </>
  );
}
