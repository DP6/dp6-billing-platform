from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BILLING_API_", env_file=".env")

    # BigQuery
    gcp_project: str = "dp6-ci-polaris"
    reporting_dataset: str = "billing_platform_reporting"
    mart_dataset: str = "billing_platform_mart"
    bq_location: str = "US"

    # modo mock: serve fixtures (validacao 2026-09-09) sem tocar no BigQuery.
    # liga sozinho se google-cloud-bigquery nao autenticar.
    mock: bool = False

    # cache de resposta (Dataform roda 1x/dia)
    cache_ttl_seconds: int = 1800

    # label do proprio job de BigQuery que esta API dispara (query() em bq.py) -- vira label
    # de job de verdade, que o BigQuery inclui no billing export (doc oficial). Existe pra
    # que o custo de rodar ESTE painel (a maior fatia do "BigQuery outras queries" achado no
    # diagnostico de alocacao) pare de cair em pseudo-app e vire label_app nativo. Minusculo/
    # hifen (regra de label do BigQuery).
    app_label: str = "dp6-billing-platform"
    env_label: str = "prod"

    # negocio (espelha includes/constants.js do Dataform)
    monthly_budget_brl: float = 20.0
    budget_thresholds: tuple[float, ...] = (0.5, 0.8, 1.0, 1.2)
    cud_reeval_threshold_brl: float = 30.0
    deploy_count_per_month: int = 540  # specs/003 decisao #3

    # CORS (dev)
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)

    # confia no header do IAP (em prod). Em dev fica vazio.
    iap_audience: str = ""

    # dir do build do SPA (apps/web). Vazio em dev local (Vite serve o front);
    # a imagem seta BILLING_API_STATIC_DIR=/app/static.
    static_dir: str = ""

    # ---- aba ADM (budget por projeto + relatorio semanal) ----

    # "dev" | "prod" -- unica fonte de verdade pro gate dry-run/envio real do
    # relatorio por e-mail (email_report.py). Terraform seta por ambiente.
    environment: str = "dev"

    # Firestore: banco NOMEADO (nao o "(default)") -- mesmo projeto GCP tem
    # mais de 1 app com Firestore (polaris-atlas usa hub-dev/hub-prod), entao
    # cada um precisa do seu proprio banco pra nao misturar dado.
    firestore_database: str = "billing-platform-dev"

    # e-mail do Workspace impersonado (via domain-wide delegation) pra ler
    # grupos no Admin SDK Directory API (workspace_directory.py) -- mesmo
    # padrao do polaris-atlas. "" = integracao desligada (so o bootstrap
    # email abaixo funciona), default seguro ate a TI configurar a delegacao.
    workspace_impersonate_email: str = ""
    admin_group_email: str = "gcp-dp6-gti@dp6.com.br"
    # sempre admin, independente do Directory API -- break-glass permanente
    # (nao remover depois que a delegacao estiver funcionando).
    admin_bootstrap_emails: tuple[str, ...] = ("matheus.fuzati@dp6.com.br",)

    # grupo FinOps -- ve custo de TODOS os projetos (bypass do ACL por
    # projeto, project_access.py), igual admin_group_email, mas NAO ganha a
    # aba ADM (isso continua exclusivo de admin_group_email/bootstrap). Ate
    # a ampliacao do IAP pra domain:dp6.com.br, e o mesmo grupo que ja esta
    # no allowlist do IAP (terraform/environments/{dev,prod}/variables.tf).
    finops_group_email: str = "billing@dp6.com.br"

    # remetente do relatorio semanal (Gmail API, domain-wide delegation,
    # escopo gmail.send -- so a SA de runtime de PROD tem esse escopo).
    report_sender_email: str = "admin.victoria@dp6.com.br"

    # e-mail da propria SA de runtime -- usado pelo Signer (auth.py/
    # workspace_directory.py/email_report.py) pra assinar o JWT de delegacao
    # sem chave local. Terraform injeta (nao dá pra a app descobrir sozinha
    # sem uma chamada extra de metadata).
    runtime_sa_email: str = ""

    # e-mail da SA que o Cloud Scheduler usa pra invocar o job semanal
    # (require_scheduler em auth.py). "" em dev -- scheduler so existe em prod.
    scheduler_sa_email: str = ""

    # true SÓ no deploy interno sem IAP (terraform/environments/prod/scheduler.tf)
    # que os 2 jobs do Cloud Scheduler chamam -- ali roles/run.invoker do
    # Cloud Run (concedido só pra scheduler_sa_email) já é o único portão,
    # não tem header de IAP pra verificar (nunca passa por ele). O deploy
    # principal (IAP na frente, atende humano) nunca seta isso -- continua
    # verificando o JWT do IAP normalmente. Ver auth.require_scheduler.
    trust_run_invoker_as_scheduler: bool = False

    # conta de faturamento (Billing Budgets API, gcp_budgets.py) -- hierarquia
    # SEPARADA do projeto GCP, roles/billing.viewer nao entra no nosso
    # Terraform (pedido externo pra quem administra a billing account).
    billing_account_id: str = "008012-F93445-DFD798"

    # escape-hatch SO pra dev local sem sessao de IAP de verdade -- nunca
    # setado por Terraform (variavel de .env local). Com isso true, todo
    # caller vira admin (bootstrap email), sem checar JWT/grupo nenhum.
    dev_force_admin: bool = False

    @property
    def rpt(self) -> str:
        return f"`{self.gcp_project}.{self.reporting_dataset}`"


@lru_cache
def get_settings() -> Settings:
    return Settings()
