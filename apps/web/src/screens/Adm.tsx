import { type CSSProperties, useEffect, useState } from "react";
import { DataTable, type DataTableCol, LoadingOrError, PageHeader, Panel } from "../components/ui";
import { apiDelete, apiPost, apiPut, useApi, useMutationState } from "../lib/api";
import { brl } from "../lib/format";
import type { BudgetConfig, Dimensions, SendNowResult, SyncBudgetsResult, WeeklyReportConfig } from "../types";

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
const btnSmallStyle: CSSProperties = { padding: "4px 10px", fontSize: 12 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

function scopeLabel(b: Pick<BudgetConfig, "scope" | "project_name">): string {
  return b.scope === ACCOUNT_SCOPE ? "Conta inteira" : (b.project_name ?? b.scope);
}

const syncBadgeStyle: CSSProperties = {
  fontSize: 10.5,
  color: "var(--muted-foreground)",
  marginTop: 3,
};

/** Os 2 toggles de sincronização do GCP Billing Budgets, sempre juntos (linha
 *  da tabela de projetos, e a conta inteira). Independentes um do outro —
 *  desligar um assume controle manual só daquele campo, o outro continua
 *  como estava. */
function SyncToggles({ cfg, bump }: { cfg: BudgetConfig; bump: () => void }) {
  const { loading, run } = useMutationState<BudgetConfig>();
  const setFlags = (budget_source_gcp: boolean, emails_source_gcp: boolean) => {
    run(() =>
      apiPut<BudgetConfig>(`/adm/budgets/${encodeURIComponent(cfg.scope)}/sync-flags`, {
        budget_source_gcp,
        emails_source_gcp,
      }),
    ).then(bump);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11.5 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={cfg.budget_source_gcp}
          disabled={loading}
          onChange={(e) => setFlags(e.target.checked, cfg.emails_source_gcp)}
        />
        orçamento do GCP
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={cfg.emails_source_gcp}
          disabled={loading}
          onChange={(e) => setFlags(cfg.budget_source_gcp, e.target.checked)}
        />
        e-mails do GCP
      </label>
    </div>
  );
}

/** Form de cadastro/edição de 1 budget (conta inteira, ou 1 projeto) — só
 *  budget_brl/emails. O toggle do relatório semanal fica só na tabela do
 *  painel de relatório (report-enabled), nunca reenviado por aqui: editar o
 *  orçamento não deve resetar se o relatório está ativado ou não. */
function BudgetForm({
  scope,
  fixedScopeLabel,
  initial,
  onSaved,
}: {
  scope: string;
  fixedScopeLabel?: string;
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

  const budgetLocked = initial?.budget_source_gcp ?? false;
  const emailsLocked = initial?.emails_source_gcp ?? false;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "10px 16px" }}>
      {fixedScopeLabel && (
        <Field label="Escopo">
          <span style={{ ...inputStyle, minWidth: 160, display: "inline-block" }}>{fixedScopeLabel}</span>
        </Field>
      )}
      <Field label="Orçamento mensal (R$)">
        <input
          type="number"
          step="0.01"
          min="0"
          value={budgetBrl}
          onChange={(e) => setBudgetBrl(e.target.value)}
          disabled={budgetLocked}
          style={{ ...inputStyle, width: 140, opacity: budgetLocked ? 0.6 : 1 }}
        />
        {budgetLocked && <span style={syncBadgeStyle}>sincronizado do GCP — desligue o toggle pra editar</span>}
      </Field>
      <Field label="E-mails responsáveis (grupo e/ou avulso, separados por vírgula)">
        <input
          type="text"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="time-x@dp6.com.br, fulano@dp6.com.br"
          disabled={emailsLocked}
          style={{ ...inputStyle, minWidth: 320, opacity: emailsLocked ? 0.6 : 1 }}
        />
        {emailsLocked && <span style={syncBadgeStyle}>sincronizado do GCP — desligue o toggle pra editar</span>}
      </Field>
      <button type="button" onClick={save} disabled={loading} style={btnStyle}>
        {loading ? "Salvando…" : "Salvar"}
      </button>
      {error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</span>}
    </div>
  );
}

function BudgetsPanel({ budgets, dims, bump }: { budgets: BudgetConfig[]; dims: Dimensions | undefined; bump: () => void }) {
  const account = budgets.find((b) => b.scope === ACCOUNT_SCOPE);
  const projectBudgets = budgets.filter((b) => b.scope !== ACCOUNT_SCOPE);
  const configuredIds = new Set(projectBudgets.map((b) => b.scope));
  const [editing, setEditing] = useState<string | null>(null);

  const del = useMutationState<void>();
  const remove = async (scope: string) => {
    if (!confirm(`Excluir o orçamento de ${scope}?`)) return;
    await del.run(() => apiDelete<void>(`/adm/budgets/${encodeURIComponent(scope)}`));
    bump();
  };

  const sync = useMutationState<SyncBudgetsResult>();
  const [syncResult, setSyncResult] = useState<SyncBudgetsResult | null>(null);
  const syncNow = async () => {
    const r = await sync.run(() => apiPost<SyncBudgetsResult>("/adm/gcp-budgets/sync-now", {}));
    setSyncResult(r);
    bump();
  };

  const cols: DataTableCol<BudgetConfig>[] = [
    { key: "project", label: "Projeto", render: (r) => r.project_name ?? r.scope, sort: (r) => r.project_name ?? r.scope },
    { key: "budget", label: "Orçamento", num: true, render: (r) => brl(r.budget_brl), sort: (r) => r.budget_brl },
    { key: "emails", label: "E-mails", render: (r) => r.emails.join(", ") || "—" },
    { key: "sync", label: "Sincronizar do GCP", render: (r) => <SyncToggles cfg={r} bump={bump} /> },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => setEditing(r.scope)} style={{ ...btnGhostStyle, ...btnSmallStyle }}>
            editar
          </button>
          <button type="button" onClick={() => remove(r.scope)} style={{ ...btnGhostStyle, ...btnSmallStyle, color: "var(--bad)" }}>
            excluir
          </button>
        </div>
      ),
    },
  ];

  const editingRow = editing ? projectBudgets.find((b) => b.scope === editing) : undefined;
  const editingProject = dims?.projects.find((p) => p.project_id === editing);
  const newCandidates = (dims?.projects ?? []).filter((p) => !configuredIds.has(p.project_id));

  return (
    <Panel
      title="Orçamentos"
      cap="Budget e e-mails responsáveis, por projeto e para a conta inteira. Projeto com budget cadastrado no GCP entra aqui automaticamente na 1ª sincronização — os 2 toggles por linha controlam se orçamento/e-mails continuam vindo do GCP ou passam a ser manuais."
      actions={
        <button type="button" onClick={syncNow} disabled={sync.loading} style={{ ...btnGhostStyle, ...btnSmallStyle }}>
          {sync.loading ? "Sincronizando…" : "Sincronizar orçamentos do GCP agora"}
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {sync.error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{sync.error}</span>}
        {syncResult && (
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {syncResult.scopes_created.length > 0 && `criados: ${syncResult.scopes_created.join(", ")}. `}
            {syncResult.scopes_updated.length > 0 && `atualizados: ${syncResult.scopes_updated.join(", ")}. `}
            {syncResult.scopes_skipped.length > 0 && `pulados (toggle desligado): ${syncResult.scopes_skipped.join(", ")}. `}
            {syncResult.scopes_failed.length > 0 && `falharam: ${syncResult.scopes_failed.join(", ")}. `}
            {syncResult.scopes_created.length + syncResult.scopes_updated.length + syncResult.scopes_skipped.length + syncResult.scopes_failed.length === 0 &&
              "nenhum budget encontrado no GCP."}
          </span>
        )}
        <div>
          <span style={{ ...fieldLabel, display: "block", marginBottom: 8 }}>Conta inteira</span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
            <BudgetForm key={`account-${account?.updated_at ?? ""}`} scope={ACCOUNT_SCOPE} initial={account} onSaved={bump} />
            {account && <SyncToggles cfg={account} bump={bump} />}
          </div>
        </div>

        <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <span style={{ ...fieldLabel, display: "block", marginBottom: 8 }}>Por projeto</span>
          {projectBudgets.length > 0 && <DataTable cols={cols} rows={projectBudgets} defaultPageSize={10} />}

          <div style={{ marginTop: projectBudgets.length > 0 ? 16 : 0 }}>
            {editing ? (
              <>
                <BudgetForm
                  key={editing}
                  scope={editing}
                  fixedScopeLabel={editingRow?.project_name ?? editingProject?.project_name ?? editing}
                  initial={editingRow}
                  onSaved={() => {
                    bump();
                    setEditing(null);
                  }}
                />
                <button type="button" onClick={() => setEditing(null)} style={{ ...btnGhostStyle, ...btnSmallStyle, marginTop: 10 }}>
                  cancelar
                </button>
              </>
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
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Prévia do e-mail — SEMPRE forçada em modo claro (cor literal, não usa var()
 *  do tema): é um e-mail, um documento estático que vai ser lido igual em
 *  qualquer cliente; deixar ele herdar o dark mode do app quebrava o texto
 *  (cor escura sobre fundo escuro herdado). */
function EmailPreview({ scope, html }: { scope: string; html: string }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dedcda",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "8px 16px", background: "#f0efec", borderBottom: "1px solid #dedcda", fontSize: 11.5, color: "#555b62" }}>
        prévia · {scope === ACCOUNT_SCOPE ? "Conta inteira" : scope}
      </div>
      <div style={{ padding: 16 }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function WeeklyReportPanel({ budgets, bump }: { budgets: BudgetConfig[]; bump: () => void }) {
  const cfg = useApi<WeeklyReportConfig>("/adm/weekly-report/config");
  const toggle = useMutationState<BudgetConfig>();
  const bulkToggle = useMutationState<void>();
  const send = useMutationState<SendNowResult>();
  const [result, setResult] = useState<SendNowResult | null>(null);
  const [sendingScope, setSendingScope] = useState<string | null>(null);

  const rows = budgets.filter((b) => b.emails.length > 0);

  const setEnabled = async (scope: string, enabled: boolean) => {
    await toggle.run(() => apiPut<BudgetConfig>(`/adm/budgets/${encodeURIComponent(scope)}/report-enabled`, { enabled }));
    bump();
  };

  const setAll = async (enabled: boolean) => {
    await bulkToggle.run(async () => {
      await Promise.all(
        rows.filter((r) => r.report_enabled !== enabled).map((r) =>
          apiPut<BudgetConfig>(`/adm/budgets/${encodeURIComponent(r.scope)}/report-enabled`, { enabled }),
        ),
      );
    });
    bump();
  };

  const sendNow = async (scope?: string) => {
    setSendingScope(scope ?? "*");
    try {
      const r = await send.run(() => apiPost<SendNowResult>("/adm/weekly-report/send-now", scope ? { scope } : undefined));
      setResult(r);
    } finally {
      setSendingScope(null);
    }
  };

  const allEnabled = rows.length > 0 && rows.every((r) => r.report_enabled);

  const cols: DataTableCol<BudgetConfig>[] = [
    { key: "scope", label: "Escopo", render: (r) => scopeLabel(r), sort: (r) => scopeLabel(r) },
    { key: "emails", label: "E-mails", render: (r) => r.emails.join(", ") },
    {
      key: "enabled",
      label: "Ativado",
      render: (r) => (
        <input
          type="checkbox"
          checked={r.report_enabled}
          disabled={toggle.loading || bulkToggle.loading}
          onChange={(e) => setEnabled(r.scope, e.target.checked)}
        />
      ),
    },
    {
      key: "send",
      label: "",
      render: (r) => (
        <button
          type="button"
          onClick={() => sendNow(r.scope)}
          disabled={send.loading}
          style={{ ...btnGhostStyle, ...btnSmallStyle }}
        >
          {sendingScope === r.scope && send.loading ? "enviando…" : "enviar agora"}
        </button>
      ),
    },
  ];

  return (
    <Panel
      title="Relatório semanal por e-mail"
      cap="Toda segunda, 08:00 — gasto no mês, % do orçamento, run-rate, comparação com o mesmo dia do mês anterior e últimos 7 dias, com gráficos. O toggle controla só o disparo automático; os botões “enviar agora” sempre disparam, mesmo desativado."
    >
      <LoadingOrError loading={cfg.loading} error={cfg.error} />
      {!cfg.loading && !cfg.error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
              Nenhum orçamento com e-mail cadastrado ainda — cadastre acima.
            </span>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setAll(true)} disabled={bulkToggle.loading || allEnabled} style={{ ...btnGhostStyle, ...btnSmallStyle }}>
                  marcar todos
                </button>
                <button type="button" onClick={() => setAll(false)} disabled={bulkToggle.loading} style={{ ...btnGhostStyle, ...btnSmallStyle }}>
                  desmarcar todos
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => sendNow()} disabled={send.loading} style={btnStyle}>
                  {sendingScope === "*" && send.loading ? "Enviando…" : "Enviar para todos"}
                </button>
              </div>
              <DataTable cols={cols} rows={rows} defaultPageSize={10} />
            </>
          )}

          {(cfg.data?.last_run_at || result) && (
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              {cfg.data?.last_run_at &&
                `última execução automática: ${new Date(cfg.data.last_run_at).toLocaleString("pt-BR")} (${cfg.data.last_run_status})`}
            </span>
          )}

          {send.error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{send.error}</span>}

          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
                {result.dry_run
                  ? "Ambiente não é produção — modo dry-run: o e-mail NÃO foi enviado de verdade, só a prévia abaixo."
                  : `Enviado de verdade: ${result.scopes_sent.join(", ") || "nenhum"}.`}
                {result.scopes_failed.length > 0 && ` Falharam: ${result.scopes_failed.join(", ")}.`}
              </span>
              {Object.entries(result.previews).map(([scope, html]) => (
                <EmailPreview key={scope} scope={scope} html={html} />
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function Adm() {
  const [reloadKey, setReloadKey] = useState(0);
  const budgets = useApi<BudgetConfig[]>("/adm/budgets", { _r: String(reloadKey) });
  const dims = useApi<Dimensions>("/dimensions");
  const bump = () => setReloadKey((k) => k + 1);

  return (
    <>
      <PageHeader
        eyebrow="Restrito"
        title="ADM"
        desc="Cadastro de orçamento e e-mails responsáveis (grupo gcp-dp6-gti@dp6.com.br + matheus.fuzati@dp6.com.br) e relatório semanal de custo por e-mail."
      />
      <LoadingOrError loading={budgets.loading && !budgets.data} error={budgets.error} />
      {/* budgets.data (não "!loading && data") -- depois do 1º carregamento,
          um bump() (toggle, salvar, sincronizar) mantém a tela com o dado
          anterior visível enquanto refaz o fetch, em vez de desmontar tudo
          e piscar a cada clique (ver useApi em lib/api.ts). */}
      {budgets.data && (
        <>
          <BudgetsPanel budgets={budgets.data} dims={dims.data} bump={bump} />
          <WeeklyReportPanel budgets={budgets.data} bump={bump} />
        </>
      )}
    </>
  );
}
