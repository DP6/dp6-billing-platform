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

    @property
    def rpt(self) -> str:
        return f"`{self.gcp_project}.{self.reporting_dataset}`"


@lru_cache
def get_settings() -> Settings:
    return Settings()
