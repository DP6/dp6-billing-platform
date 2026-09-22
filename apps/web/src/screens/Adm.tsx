import { type CSSProperties, useEffect, useRef, useState } from "react";
import { DataTable, type DataTableCol, LoadingOrError, PageHeader, Panel } from "../components/ui";
import { apiDelete, apiPost, apiPut, useApi, useMutationState } from "../lib/api";
import { brl } from "../lib/format";
import type {
  Admins,
  BudgetConfig,
  Dimensions,
  ProjectAccess,
  SendNowResult,
  SyncBudgetsResult,
  WeeklyReportConfig,
} from "../types";

const ACCOUNT_SCOPE = "_account";

/** Dupla confirmação (2 diálogos) pra ação destrutiva em massa -- excluir
 *  todo orçamento de projeto de uma vez (nunca a conta inteira, ver
 *  fsdb.delete_budget). Usado nos dois painéis (Orçamentos e Relatório
 *  semanal), que mostram a mesma lista por ângulos diferentes. */
function confirmDeleteAll(count: number): boolean {
  if (
    !confirm(`Excluir TODOS os ${count} orçamentos de projeto cadastrados? Essa ação não pode ser desfeita.`)
  ) {
    return false;
  }
  return confirm(
    `Confirma de novo: isso apaga os ${count} orçamentos de projeto (e-mails, toggles, tudo). ` +
      `O orçamento da conta inteira não é afetado. Tem certeza?`,
  );
}

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

/** Quem consegue abrir esta tela (aba ADM). E-mails bootstrap (config do
 *  backend, break-glass) aparecem como referência, não editáveis aqui --
 *  a lista autogerenciável é a única coisa que este painel muda. Qualquer
 *  admin atual pode adicionar ou remover qualquer outro (inclusive a si
 *  mesmo) -- mesmo espírito simples do "Por pessoa"/"Por grupo" do Atlas. */
function AdminsPanel() {
  const admins = useApi<Admins>("/adm/admins");
  const [emails, setEmails] = useState("");
  const { loading, error, run } = useMutationState<Admins>();

  useEffect(() => {
    if (admins.data) setEmails(admins.data.emails.join(", "));
  }, [admins.data]);

  const save = async () => {
    const list = emails
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    await run(() => apiPut<Admins>("/adm/admins", { emails: list }));
  };

  return (
    <Panel
      title="Administradores"
      cap="Quem pode abrir esta aba ADM (inclusive editar esta própria lista). Além destes, os e-mails bootstrap abaixo sempre têm acesso, independente desta lista."
    >
      <LoadingOrError loading={admins.loading && !admins.data} error={admins.error} />
      {admins.data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {admins.data.bootstrap_emails.length > 0 && (
            <div>
              <span style={{ ...fieldLabel, display: "block", marginBottom: 6 }}>
                Bootstrap · sempre admin, não editável aqui
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {admins.data.bootstrap_emails.map((e) => (
                  <span
                    key={e}
                    className="mono"
                    style={{
                      fontSize: 12,
                      padding: "3px 9px",
                      borderRadius: 999,
                      background: "var(--muted)",
                      border: "1px solid var(--border-strong)",
                    }}
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Field label="Administradores adicionais (e-mails separados por vírgula)">
            <input
              type="text"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="victoria.caroline@dp6.com.br"
              style={{ ...inputStyle, minWidth: 340 }}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={save} disabled={loading} style={btnStyle}>
              {loading ? "Salvando…" : "Salvar"}
            </button>
            {error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</span>}
          </div>
        </div>
      )}
    </Panel>
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

/** Lista de e-mails com uma tag pequena nos que vieram do GCP (gcp_emails) —
 *  só diferenciação visual, o relatório manda pra TODO endereço em `emails`
 *  do mesmo jeito, sincronizado ou não. */
function EmailBadgeList({ emails, gcpEmails }: { emails: string[]; gcpEmails: string[] }) {
  if (emails.length === 0) return <>—</>;
  const gcpSet = new Set(gcpEmails);
  return (
    <>
      {emails.map((e, i) => (
        <span key={e}>
          {i > 0 && ", "}
          {e}
          {gcpSet.has(e) && (
            <span
              title="Sincronizado do GCP"
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: ".04em",
                color: "var(--status-ok-foreground)",
                marginLeft: 3,
              }}
            >
              GCP
            </span>
          )}
        </span>
      ))}
    </>
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
    const list = emails
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    await run(() =>
      apiPut<BudgetConfig>(`/adm/budgets/${encodeURIComponent(scope)}`, {
        budget_brl: Number(budgetBrl.replace(",", ".")) || 0,
        emails: list,
      }),
    );
    onSaved();
  };

  const budgetSynced = initial?.budget_source_gcp ?? false;
  const emailsSynced = initial?.emails_source_gcp ?? false;

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
          style={{ ...inputStyle, width: 140 }}
        />
        {budgetSynced && (
          <span style={syncBadgeStyle}>
            sincronizado do GCP — uma sincronização futura pode sobrescrever esse valor
          </span>
        )}
      </Field>
      <Field label="E-mails responsáveis (grupo e/ou avulso, separados por vírgula)">
        <input
          type="text"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="time-x@dp6.com.br, fulano@dp6.com.br"
          style={{ ...inputStyle, minWidth: 320 }}
        />
        {emailsSynced ? (
          <span style={syncBadgeStyle}>
            sincronizado do GCP — sincronização futura só ACRESCENTA e-mail novo do GCP, nunca remove o que
            está aqui
          </span>
        ) : (
          initial &&
          initial.gcp_emails.length > 0 && (
            <span style={syncBadgeStyle}>
              toggle desligado — e-mails do GCP não são mais adicionados automaticamente
            </span>
          )
        )}
        {initial && initial.emails.length > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 3 }}>
            <EmailBadgeList emails={initial.emails} gcpEmails={initial.gcp_emails} />
          </div>
        )}
      </Field>
      <button type="button" onClick={save} disabled={loading} style={btnStyle}>
        {loading ? "Salvando…" : "Salvar"}
      </button>
      {error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</span>}
    </div>
  );
}

function BudgetsPanel({
  budgets,
  dims,
  bump,
}: {
  budgets: BudgetConfig[];
  dims: Dimensions | undefined;
  bump: () => void;
}) {
  const account = budgets.find((b) => b.scope === ACCOUNT_SCOPE);
  const projectBudgets = budgets.filter((b) => b.scope !== ACCOUNT_SCOPE);
  const configuredIds = new Set(projectBudgets.map((b) => b.scope));
  const [editing, setEditing] = useState<string | null>(null);
  // "editar" abre o form BEM abaixo da tabela (que agora ficou mais alta,
  // com a coluna de sincronização + paginação de 35+ linhas) -- sem isso o
  // clique parecia não fazer nada, porque o form abria fora da tela sem
  // rolar (achado testando em prod).
  const editFormRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing) editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editing]);

  const del = useMutationState<void>();
  const remove = async (scope: string) => {
    if (!confirm(`Excluir o orçamento de ${scope}?`)) return;
    await del.run(() => apiDelete<void>(`/adm/budgets/${encodeURIComponent(scope)}`));
    bump();
  };

  const delAll = useMutationState<void>();
  const removeAll = async () => {
    if (!confirmDeleteAll(projectBudgets.length)) return;
    await delAll.run(async () => {
      await Promise.all(
        projectBudgets.map((b) => apiDelete<void>(`/adm/budgets/${encodeURIComponent(b.scope)}`)),
      );
    });
    bump();
  };

  const sync = useMutationState<SyncBudgetsResult>();
  const [syncResult, setSyncResult] = useState<SyncBudgetsResult | null>(null);
  const syncNow = async () => {
    const r = await sync.run(() => apiPost<SyncBudgetsResult>("/adm/gcp-budgets/sync-now", {}));
    setSyncResult(r);
    bump();
  };

  // "marcar/desmarcar todos" dos 2 toggles de sincronização -- PUT .../sync-flags
  // sempre grava os 2 campos juntos, então o bulk preserva o outro campo de
  // cada linha (só muda o que o botão clicado se refere).
  const bulkSyncFlags = useMutationState<void>();
  const setAllBudgetSync = async (value: boolean) => {
    await bulkSyncFlags.run(async () => {
      await Promise.all(
        projectBudgets
          .filter((b) => b.budget_source_gcp !== value)
          .map((b) =>
            apiPut<BudgetConfig>(`/adm/budgets/${encodeURIComponent(b.scope)}/sync-flags`, {
              budget_source_gcp: value,
              emails_source_gcp: b.emails_source_gcp,
            }),
          ),
      );
    });
    bump();
  };
  const setAllEmailsSync = async (value: boolean) => {
    await bulkSyncFlags.run(async () => {
      await Promise.all(
        projectBudgets
          .filter((b) => b.emails_source_gcp !== value)
          .map((b) =>
            apiPut<BudgetConfig>(`/adm/budgets/${encodeURIComponent(b.scope)}/sync-flags`, {
              budget_source_gcp: b.budget_source_gcp,
              emails_source_gcp: value,
            }),
          ),
      );
    });
    bump();
  };
  const allBudgetSynced = projectBudgets.length > 0 && projectBudgets.every((b) => b.budget_source_gcp);
  const allEmailsSynced = projectBudgets.length > 0 && projectBudgets.every((b) => b.emails_source_gcp);

  const cols: DataTableCol<BudgetConfig>[] = [
    {
      key: "project",
      label: "Projeto",
      render: (r) => r.project_name ?? r.scope,
      sort: (r) => r.project_name ?? r.scope,
    },
    {
      key: "budget",
      label: "Orçamento",
      num: true,
      render: (r) => brl(r.budget_brl),
      sort: (r) => r.budget_brl,
    },
    {
      key: "emails",
      label: "E-mails",
      render: (r) => <EmailBadgeList emails={r.emails} gcpEmails={r.gcp_emails} />,
    },
    { key: "sync", label: "Sincronizar do GCP", render: (r) => <SyncToggles cfg={r} bump={bump} /> },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setEditing(r.scope)}
            style={{ ...btnGhostStyle, ...btnSmallStyle }}
          >
            editar
          </button>
          <button
            type="button"
            onClick={() => remove(r.scope)}
            style={{ ...btnGhostStyle, ...btnSmallStyle, color: "var(--bad)" }}
          >
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={syncNow}
            disabled={sync.loading}
            style={{ ...btnGhostStyle, ...btnSmallStyle }}
          >
            {sync.loading ? "Sincronizando…" : "Sincronizar orçamentos do GCP agora"}
          </button>
          {projectBudgets.length > 0 && (
            <button
              type="button"
              onClick={removeAll}
              disabled={delAll.loading}
              style={{ ...btnGhostStyle, ...btnSmallStyle, color: "var(--bad)" }}
            >
              {delAll.loading ? "Excluindo…" : "Excluir todos os orçamentos de projeto"}
            </button>
          )}
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {sync.error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{sync.error}</span>}
        {delAll.error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{delAll.error}</span>}
        {syncResult && (
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {syncResult.scopes_created.length > 0 && `criados: ${syncResult.scopes_created.join(", ")}. `}
            {syncResult.scopes_updated.length > 0 && `atualizados: ${syncResult.scopes_updated.join(", ")}. `}
            {syncResult.scopes_skipped.length > 0 &&
              `pulados (toggle desligado): ${syncResult.scopes_skipped.join(", ")}. `}
            {syncResult.scopes_failed.length > 0 && `falharam: ${syncResult.scopes_failed.join(", ")}. `}
            {syncResult.scopes_created.length +
              syncResult.scopes_updated.length +
              syncResult.scopes_skipped.length +
              syncResult.scopes_failed.length ===
              0 && "nenhum budget encontrado no GCP."}
          </span>
        )}
        <div>
          <span style={{ ...fieldLabel, display: "block", marginBottom: 8 }}>Conta inteira</span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
            <BudgetForm
              key={`account-${account?.updated_at ?? ""}`}
              scope={ACCOUNT_SCOPE}
              initial={account}
              onSaved={bump}
            />
            {account && <SyncToggles cfg={account} bump={bump} />}
          </div>
        </div>

        <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <span style={{ ...fieldLabel, display: "block", marginBottom: 8 }}>Por projeto</span>
          {projectBudgets.length > 0 && (
            <div
              style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}
            >
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Orçamento do GCP:</span>
              <button
                type="button"
                onClick={() => setAllBudgetSync(true)}
                disabled={bulkSyncFlags.loading || allBudgetSynced}
                style={{ ...btnGhostStyle, ...btnSmallStyle }}
              >
                selecionar todos
              </button>
              <button
                type="button"
                onClick={() => setAllBudgetSync(false)}
                disabled={bulkSyncFlags.loading}
                style={{ ...btnGhostStyle, ...btnSmallStyle }}
              >
                desmarcar todos
              </button>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", marginLeft: 12 }}>
                E-mails do GCP:
              </span>
              <button
                type="button"
                onClick={() => setAllEmailsSync(true)}
                disabled={bulkSyncFlags.loading || allEmailsSynced}
                style={{ ...btnGhostStyle, ...btnSmallStyle }}
              >
                selecionar todos
              </button>
              <button
                type="button"
                onClick={() => setAllEmailsSync(false)}
                disabled={bulkSyncFlags.loading}
                style={{ ...btnGhostStyle, ...btnSmallStyle }}
              >
                desmarcar todos
              </button>
            </div>
          )}
          {projectBudgets.length > 0 && <DataTable cols={cols} rows={projectBudgets} defaultPageSize={10} />}

          <div
            ref={editFormRef}
            style={{ marginTop: projectBudgets.length > 0 ? 16 : 0, scrollMarginTop: 20 }}
          >
            {editing ? (
              <>
                <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginBottom: 8 }}>
                  Editando {editingRow?.project_name ?? editingProject?.project_name ?? editing}
                </div>
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
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  style={{ ...btnGhostStyle, ...btnSmallStyle, marginTop: 10 }}
                >
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
      <div
        style={{
          padding: "8px 16px",
          background: "#f0efec",
          borderBottom: "1px solid #dedcda",
          fontSize: 11.5,
          color: "#555b62",
        }}
      >
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

  // todo budget cadastrado aparece aqui (não só quem já tem e-mail) -- o
  // toggle "Ativado" decide sozinho quem entra no disparo automático; quem
  // ainda não tem e-mail só não recebe nada de verdade (run_weekly_report
  // pula scope sem e-mail, silenciosamente) até alguém cadastrar acima.
  const rows = budgets;

  const setEnabled = async (scope: string, enabled: boolean) => {
    await toggle.run(() =>
      apiPut<BudgetConfig>(`/adm/budgets/${encodeURIComponent(scope)}/report-enabled`, { enabled }),
    );
    bump();
  };

  const setAll = async (enabled: boolean) => {
    await bulkToggle.run(async () => {
      await Promise.all(
        rows
          .filter((r) => r.report_enabled !== enabled)
          .map((r) =>
            apiPut<BudgetConfig>(`/adm/budgets/${encodeURIComponent(r.scope)}/report-enabled`, { enabled }),
          ),
      );
    });
    bump();
  };

  // nunca inclui _account (não pode ser excluído, ver fsdb.delete_budget).
  const deletableRows = rows.filter((r) => r.scope !== ACCOUNT_SCOPE);
  const delAll = useMutationState<void>();
  const removeAll = async () => {
    if (!confirmDeleteAll(deletableRows.length)) return;
    await delAll.run(async () => {
      await Promise.all(
        deletableRows.map((r) => apiDelete<void>(`/adm/budgets/${encodeURIComponent(r.scope)}`)),
      );
    });
    bump();
  };

  const sendNow = async (scope?: string) => {
    setSendingScope(scope ?? "*");
    try {
      const r = await send.run(() =>
        apiPost<SendNowResult>("/adm/weekly-report/send-now", scope ? { scope } : undefined),
      );
      setResult(r);
    } finally {
      setSendingScope(null);
    }
  };

  const allEnabled = rows.length > 0 && rows.every((r) => r.report_enabled);

  const cols: DataTableCol<BudgetConfig>[] = [
    { key: "scope", label: "Escopo", render: (r) => scopeLabel(r), sort: (r) => scopeLabel(r) },
    {
      key: "emails",
      label: "E-mails",
      render: (r) => <EmailBadgeList emails={r.emails} gcpEmails={r.gcp_emails} />,
    },
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
          disabled={send.loading || r.emails.length === 0}
          title={r.emails.length === 0 ? "cadastre um e-mail acima antes de enviar" : undefined}
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
      cap="Toda segunda, 08:00 — visão geral do orçamento, custo dos últimos 7 dias e top serviços/projetos, com gráficos. O toggle controla só o disparo automático; os botões “enviar agora” sempre disparam, mesmo desativado."
    >
      <LoadingOrError loading={cfg.loading} error={cfg.error} />
      {!cfg.loading && !cfg.error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
              Nenhum orçamento cadastrado ainda — cadastre acima.
            </span>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setAll(true)}
                  disabled={bulkToggle.loading || allEnabled}
                  style={{ ...btnGhostStyle, ...btnSmallStyle }}
                >
                  marcar todos
                </button>
                <button
                  type="button"
                  onClick={() => setAll(false)}
                  disabled={bulkToggle.loading}
                  style={{ ...btnGhostStyle, ...btnSmallStyle }}
                >
                  desmarcar todos
                </button>
                {deletableRows.length > 0 && (
                  <button
                    type="button"
                    onClick={removeAll}
                    disabled={delAll.loading}
                    style={{ ...btnGhostStyle, ...btnSmallStyle, color: "var(--bad)" }}
                  >
                    {delAll.loading ? "Excluindo…" : "Excluir todos os orçamentos de projeto"}
                  </button>
                )}
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => sendNow()} disabled={send.loading} style={btnStyle}>
                  {sendingScope === "*" && send.loading ? "Enviando…" : "Enviar para todos"}
                </button>
              </div>
              {delAll.error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{delAll.error}</span>}
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

/** Form de 1 linha de project_access/{project_id} -- e-mails/grupos separados
 *  por vírgula, mesmo padrão de entrada do BudgetForm (mas sem valor
 *  monetário: só listas de principals). */
function ProjectAccessForm({
  projectId,
  initial,
  onSaved,
}: {
  projectId: string;
  initial?: ProjectAccess;
  onSaved: () => void;
}) {
  const [emails, setEmails] = useState((initial?.emails ?? []).join(", "));
  const [groups, setGroups] = useState((initial?.groups ?? []).join(", "));
  const { loading, error, run } = useMutationState<ProjectAccess>();

  useEffect(() => {
    setEmails((initial?.emails ?? []).join(", "));
    setGroups((initial?.groups ?? []).join(", "));
  }, [initial]);

  const save = async () => {
    await run(() =>
      apiPut<ProjectAccess>(`/adm/project-access/${encodeURIComponent(projectId)}`, {
        emails: emails
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean),
        groups: groups
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean),
      }),
    );
    onSaved();
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "10px 16px" }}>
      {initial && initial.budget_emails.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Via orçamento (automático)</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 280 }}>
            {initial.budget_emails.map((e) => (
              <span
                key={e}
                className="mono"
                style={{
                  fontSize: 11.5,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "var(--muted)",
                  border: "1px solid var(--border-strong)",
                }}
              >
                {e}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>
            edite o orçamento (aba acima) pra mudar -- aqui só se acrescenta gente
          </span>
        </div>
      )}
      <Field label="E-mails diretos (separados por vírgula)">
        <input
          type="text"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="fulano@dp6.com.br, ciclana@dp6.com.br"
          style={{ ...inputStyle, minWidth: 280 }}
        />
      </Field>
      <Field label="Grupos do Workspace (separados por vírgula)">
        <input
          type="text"
          value={groups}
          onChange={(e) => setGroups(e.target.value)}
          placeholder="time-x@dp6.com.br"
          style={{ ...inputStyle, minWidth: 240 }}
        />
      </Field>
      <button type="button" onClick={save} disabled={loading} style={btnStyle}>
        {loading ? "Salvando…" : "Salvar"}
      </button>
      {error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</span>}
    </div>
  );
}

/** "Por projeto" -- a visão original: 1 linha por projeto, e-mails/grupos
 *  adicionados manualmente ao lado do que já veio automático do orçamento
 *  (budget_emails, só leitura -- edita-se via aba Orçamentos). Excluir só
 *  aparece quando há algo manual pra remover (projeto só-orçamento não tem
 *  doc nenhum ainda, DELETE nele seria um no-op). */
function ByProjectView({
  rows,
  dims,
  bump,
}: {
  rows: ProjectAccess[];
  dims: Dimensions | undefined;
  bump: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const configuredIds = new Set(rows.map((a) => a.project_id));
  const newCandidates = (dims?.projects ?? []).filter((p) => !configuredIds.has(p.project_id));
  const projectName = (id: string) => dims?.projects.find((p) => p.project_id === id)?.project_name ?? id;

  const del = useMutationState<void>();
  const remove = async (projectId: string) => {
    if (
      !confirm(
        `Remover o acesso manual cadastrado para ${projectName(projectId)}? Quem tem acesso via orçamento continua vendo o projeto.`,
      )
    ) {
      return;
    }
    await del.run(() => apiDelete<void>(`/adm/project-access/${encodeURIComponent(projectId)}`));
    bump();
  };

  const cols: DataTableCol<ProjectAccess>[] = [
    {
      key: "project",
      label: "Projeto",
      render: (r) => projectName(r.project_id),
      sort: (r) => projectName(r.project_id),
    },
    {
      key: "budget_emails",
      label: "Via orçamento (auto)",
      render: (r) => (r.budget_emails.length ? r.budget_emails.join(", ") : "—"),
    },
    {
      key: "emails",
      label: "E-mails adicionados",
      render: (r) => (r.emails.length ? r.emails.join(", ") : "—"),
    },
    {
      key: "groups",
      label: "Grupos adicionados",
      render: (r) => (r.groups.length ? r.groups.join(", ") : "—"),
    },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setEditing(r.project_id)}
            style={{ ...btnGhostStyle, ...btnSmallStyle }}
          >
            editar
          </button>
          {(r.emails.length > 0 || r.groups.length > 0) && (
            <button
              type="button"
              onClick={() => remove(r.project_id)}
              style={{ ...btnGhostStyle, ...btnSmallStyle, color: "var(--bad)" }}
            >
              excluir
            </button>
          )}
        </div>
      ),
    },
  ];

  const editingRow = editing ? rows.find((a) => a.project_id === editing) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {rows.length > 0 && <DataTable cols={cols} rows={rows} defaultPageSize={10} />}
      <div>
        {editing ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginBottom: 8 }}>
              Editando {projectName(editing)}
            </div>
            <ProjectAccessForm
              key={editing}
              projectId={editing}
              initial={editingRow}
              onSaved={() => {
                bump();
                setEditing(null);
              }}
            />
            <button
              type="button"
              onClick={() => setEditing(null)}
              style={{ ...btnGhostStyle, ...btnSmallStyle, marginTop: 10 }}
            >
              cancelar
            </button>
          </>
        ) : (
          <Field label="Adicionar acesso a um projeto">
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
  );
}

/** Lista de checkboxes de projeto, reaproveitada pelos editores "por pessoa"
 *  e "por grupo" -- `locked` trava (e explica) os projetos herdados do
 *  orçamento, que não dá pra desmarcar por aqui. */
function ProjectCheckboxList({
  projects,
  checked,
  locked,
  onToggle,
}: {
  projects: { project_id: string; project_name: string }[];
  checked: Set<string>;
  locked: Set<string>;
  onToggle: (projectId: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxHeight: 260,
        overflowY: "auto",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 10,
      }}
    >
      {projects.length === 0 && (
        <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Nenhum projeto disponível.</span>
      )}
      {projects.map((p) => (
        <label
          key={p.project_id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            opacity: locked.has(p.project_id) ? 0.65 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={checked.has(p.project_id)}
            disabled={locked.has(p.project_id)}
            onChange={() => onToggle(p.project_id)}
          />
          {p.project_name}
          {locked.has(p.project_id) && (
            <span style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>(via orçamento)</span>
          )}
        </label>
      ))}
    </div>
  );
}

/** Pivô de `rows` (linhas por projeto) pra "por pessoa" -- pra cada e-mail,
 *  quais projetos vêm do cadastro manual (project_access.emails) e quais vêm
 *  automático do orçamento (budget_emails, só leitura). */
function buildPersonIndex(rows: ProjectAccess[]): Map<string, { manual: Set<string>; budget: Set<string> }> {
  const idx = new Map<string, { manual: Set<string>; budget: Set<string> }>();
  const get = (email: string) => {
    let entry = idx.get(email);
    if (!entry) {
      entry = { manual: new Set(), budget: new Set() };
      idx.set(email, entry);
    }
    return entry;
  };
  for (const r of rows) {
    for (const e of r.emails) get(e).manual.add(r.project_id);
    for (const e of r.budget_emails) get(e).budget.add(r.project_id);
  }
  return idx;
}

function buildGroupIndex(rows: ProjectAccess[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const g of r.groups) {
      if (!idx.has(g)) idx.set(g, new Set());
      idx.get(g)?.add(r.project_id);
    }
  }
  return idx;
}

/** Editor "por pessoa": marca/desmarca projetos pra 1 e-mail -- só toca no
 *  campo manual `emails` de cada project_access afetado (nunca mexe em
 *  `groups`), então convive de boa com o que já veio via grupo ou orçamento.
 *  Projetos herdados do orçamento aparecem travados/marcados (ver `locked`). */
function PersonAccessEditor({
  email,
  rows,
  dims,
  onSaved,
}: {
  email: string;
  rows: ProjectAccess[];
  dims: Dimensions | undefined;
  onSaved: () => void;
}) {
  const rowByProject = new Map(rows.map((r) => [r.project_id, r]));
  const budgetLocked = new Set(rows.filter((r) => r.budget_emails.includes(email)).map((r) => r.project_id));
  const initialManual = new Set(rows.filter((r) => r.emails.includes(email)).map((r) => r.project_id));
  const [selected, setSelected] = useState<Set<string>>(new Set([...initialManual, ...budgetLocked]));
  const { loading, error, run } = useMutationState<void>();

  const toggle = (projectId: string) => {
    if (budgetLocked.has(projectId)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const save = async () => {
    const wanted = new Set([...selected].filter((id) => !budgetLocked.has(id)));
    const touched = new Set([...initialManual, ...wanted]);
    await run(async () => {
      await Promise.all(
        [...touched].map((projectId) => {
          const row = rowByProject.get(projectId);
          const currentEmails = row?.emails ?? [];
          const has = currentEmails.includes(email);
          const shouldHave = wanted.has(projectId);
          if (has === shouldHave) return Promise.resolve();
          const nextEmails = shouldHave
            ? [...currentEmails, email]
            : currentEmails.filter((e) => e !== email);
          return apiPut<ProjectAccess>(`/adm/project-access/${encodeURIComponent(projectId)}`, {
            emails: nextEmails,
            groups: row?.groups ?? [],
          });
        }),
      );
    });
    onSaved();
  };

  const projects = (dims?.projects ?? []).map((p) => ({
    project_id: p.project_id,
    project_name: p.project_name,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ProjectCheckboxList projects={projects} checked={selected} locked={budgetLocked} onToggle={toggle} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={save} disabled={loading} style={btnStyle}>
          {loading ? "Salvando…" : "Salvar"}
        </button>
        {error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</span>}
      </div>
    </div>
  );
}

/** "Por pessoa" -- 2ª via de cadastro (complementa o que já veio do
 *  orçamento): escolhe um e-mail já conhecido, ou digita um novo, e marca em
 *  quais projetos ele tem acesso. */
function ByPersonPanel({
  rows,
  dims,
  bump,
}: {
  rows: ProjectAccess[];
  dims: Dimensions | undefined;
  bump: () => void;
}) {
  const index = buildPersonIndex(rows);
  const people = [...index.keys()].sort();
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");

  const addNew = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email?.includes("@")) return;
    setSelectedEmail(email);
    setNewEmail("");
  };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 240 }}>
        <span style={{ ...fieldLabel, display: "block", marginBottom: 8 }}>
          Pessoas com acesso cadastrado
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
          {people.length === 0 && (
            <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Nenhuma ainda.</span>
          )}
          {people.map((email) => {
            const entry = index.get(email);
            const total = entry ? new Set([...entry.manual, ...entry.budget]).size : 0;
            return (
              <button
                key={email}
                type="button"
                onClick={() => setSelectedEmail(email)}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderRadius: "var(--radius)",
                  border: "1px solid transparent",
                  background: selectedEmail === email ? "var(--muted)" : "transparent",
                  cursor: "pointer",
                  fontSize: 12.5,
                }}
              >
                {email}
                <span style={{ color: "var(--muted-foreground)", marginLeft: 6, fontSize: 11 }}>
                  {total} projeto{total === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <input
            type="text"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="novo-email@dp6.com.br"
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            onKeyDown={(e) => e.key === "Enter" && addNew()}
          />
          <button type="button" onClick={addNew} style={{ ...btnGhostStyle, ...btnSmallStyle }}>
            + pessoa
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 260 }}>
        {selectedEmail ? (
          <>
            <span style={{ ...fieldLabel, display: "block", marginBottom: 8 }}>
              Projetos de {selectedEmail}
            </span>
            <PersonAccessEditor
              key={selectedEmail}
              email={selectedEmail}
              rows={rows}
              dims={dims}
              onSaved={bump}
            />
          </>
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
            Escolha uma pessoa à esquerda, ou cadastre uma nova.
          </span>
        )}
      </div>
    </div>
  );
}

/** Editor "por grupo": mesmo padrão do PersonAccessEditor, mas mexendo em
 *  `groups` -- sem trava de orçamento (budgets não distingue grupo de
 *  pessoa, então não dá pra saber com certeza que um endereço lá é grupo). */
function GroupAccessEditor({
  group,
  rows,
  dims,
  onSaved,
}: {
  group: string;
  rows: ProjectAccess[];
  dims: Dimensions | undefined;
  onSaved: () => void;
}) {
  const rowByProject = new Map(rows.map((r) => [r.project_id, r]));
  const initial = new Set(rows.filter((r) => r.groups.includes(group)).map((r) => r.project_id));
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const { loading, error, run } = useMutationState<void>();

  const toggle = (projectId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const save = async () => {
    const touched = new Set([...initial, ...selected]);
    await run(async () => {
      await Promise.all(
        [...touched].map((projectId) => {
          const row = rowByProject.get(projectId);
          const currentGroups = row?.groups ?? [];
          const has = currentGroups.includes(group);
          const shouldHave = selected.has(projectId);
          if (has === shouldHave) return Promise.resolve();
          const nextGroups = shouldHave
            ? [...currentGroups, group]
            : currentGroups.filter((g) => g !== group);
          return apiPut<ProjectAccess>(`/adm/project-access/${encodeURIComponent(projectId)}`, {
            emails: row?.emails ?? [],
            groups: nextGroups,
          });
        }),
      );
    });
    onSaved();
  };

  const projects = (dims?.projects ?? []).map((p) => ({
    project_id: p.project_id,
    project_name: p.project_name,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ProjectCheckboxList projects={projects} checked={selected} locked={new Set()} onToggle={toggle} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={save} disabled={loading} style={btnStyle}>
          {loading ? "Salvando…" : "Salvar"}
        </button>
        {error && <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</span>}
      </div>
    </div>
  );
}

/** "Por grupo" -- 3ª via de cadastro, mesmo espírito de "Por pessoa" mas
 *  pivotando em grupo do Workspace. */
function ByGroupPanel({
  rows,
  dims,
  bump,
}: {
  rows: ProjectAccess[];
  dims: Dimensions | undefined;
  bump: () => void;
}) {
  const index = buildGroupIndex(rows);
  const groups = [...index.keys()].sort();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");

  const addNew = () => {
    const group = newGroup.trim().toLowerCase();
    if (!group?.includes("@")) return;
    setSelectedGroup(group);
    setNewGroup("");
  };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 240 }}>
        <span style={{ ...fieldLabel, display: "block", marginBottom: 8 }}>Grupos com acesso cadastrado</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
          {groups.length === 0 && (
            <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Nenhum ainda.</span>
          )}
          {groups.map((group) => {
            const count = index.get(group)?.size ?? 0;
            return (
              <button
                key={group}
                type="button"
                onClick={() => setSelectedGroup(group)}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderRadius: "var(--radius)",
                  border: "1px solid transparent",
                  background: selectedGroup === group ? "var(--muted)" : "transparent",
                  cursor: "pointer",
                  fontSize: 12.5,
                }}
              >
                {group}
                <span style={{ color: "var(--muted-foreground)", marginLeft: 6, fontSize: 11 }}>
                  {count} projeto{count === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <input
            type="text"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="time-x@dp6.com.br"
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            onKeyDown={(e) => e.key === "Enter" && addNew()}
          />
          <button type="button" onClick={addNew} style={{ ...btnGhostStyle, ...btnSmallStyle }}>
            + grupo
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 260 }}>
        {selectedGroup ? (
          <>
            <span style={{ ...fieldLabel, display: "block", marginBottom: 8 }}>
              Projetos de {selectedGroup}
            </span>
            <GroupAccessEditor
              key={selectedGroup}
              group={selectedGroup}
              rows={rows}
              dims={dims}
              onSaved={bump}
            />
          </>
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
            Escolha um grupo à esquerda, ou cadastre um novo.
          </span>
        )}
      </div>
    </div>
  );
}

type AccessTab = "project" | "person" | "group";
const ACCESS_TABS: [AccessTab, string][] = [
  ["project", "Por projeto"],
  ["person", "Por pessoa"],
  ["group", "Por grupo"],
];

/** Quem pode ver o custo de cada projeto (aba ADM) -- e-mail direto e/ou grupo do
 *  Workspace, checado via project_access.py no backend. Grupo ADM (gcp-dp6-gti@),
 *  grupo FinOps (billing@) e o e-mail bootstrap NÃO precisam estar aqui -- eles têm
 *  bypass total (ver PageHeader.desc). 3 vias de cadastro, mesma fonte de dados:
 *  por projeto (view original), por pessoa e por grupo (pivôs de conveniência) --
 *  as 2 últimas só ACRESCENTAM em cima do que já veio automático do orçamento. */
function ProjectAccessPanel({ dims }: { dims: Dimensions | undefined }) {
  const [reloadKey, setReloadKey] = useState(0);
  const bump = () => setReloadKey((k) => k + 1);
  const access = useApi<ProjectAccess[]>("/adm/project-access", { _r: String(reloadKey) });
  const [tab, setTab] = useState<AccessTab>("project");
  const rows = access.data ?? [];

  return (
    <Panel
      title="Acesso por projeto"
      cap="Quem, fora do grupo ADM/FinOps, pode ver o custo de cada projeto. Quem já está cadastrado como e-mail responsável do orçamento (aba Orçamentos) ganha acesso automaticamente -- aqui só se ACRESCENTA gente, nunca se remove quem vem do orçamento (edite o orçamento pra isso). Quem não estiver liberado (nem no bypass) vê a tela de 'sem projetos liberados'."
    >
      <LoadingOrError loading={access.loading && !access.data} error={access.error} />
      {access.data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}
          >
            {ACCESS_TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  ...btnGhostStyle,
                  ...btnSmallStyle,
                  border: "none",
                  borderBottom: tab === key ? "2px solid var(--primary)" : "2px solid transparent",
                  borderRadius: 0,
                  color: tab === key ? "var(--foreground)" : "var(--muted-foreground)",
                  fontWeight: tab === key ? 600 : 500,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "project" && <ByProjectView rows={rows} dims={dims} bump={bump} />}
          {tab === "person" && <ByPersonPanel rows={rows} dims={dims} bump={bump} />}
          {tab === "group" && <ByGroupPanel rows={rows} dims={dims} bump={bump} />}
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
        desc="Quem administra esta tela, cadastro de orçamento e e-mails responsáveis, acesso por projeto e relatório semanal de custo. Bypass de visualização (vê custo de TODOS os projetos, concern diferente de quem administra esta tela): grupo gcp-dp6-gti@dp6.com.br, grupo billing@dp6.com.br e e-mails bootstrap."
      />
      <AdminsPanel />
      <LoadingOrError loading={budgets.loading && !budgets.data} error={budgets.error} />
      {/* budgets.data (não "!loading && data") -- depois do 1º carregamento,
          um bump() (toggle, salvar, sincronizar) mantém a tela com o dado
          anterior visível enquanto refaz o fetch, em vez de desmontar tudo
          e piscar a cada clique (ver useApi em lib/api.ts). */}
      {budgets.data && (
        <>
          <BudgetsPanel budgets={budgets.data} dims={dims.data} bump={bump} />
          <ProjectAccessPanel dims={dims.data} />
          <WeeklyReportPanel budgets={budgets.data} bump={bump} />
        </>
      )}
    </>
  );
}
