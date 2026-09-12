"""Dados canônicos para o modo mock — números da validação de 2026-09-09
(R$ 26,41 em ~2 meses, Cloud Run 82%, pico 21–26/ago, créditos −0,57, orçamento R$ 20).
São os mesmos do mock/index.html e do canvas."""

from __future__ import annotations

RATE = 5.8703  # BRL/USD (mês corrente)

_DAILY = [
    ("2026-08-10", 0.0), ("2026-08-11", 0.0), ("2026-08-12", 0.0), ("2026-08-13", 0.0),
    ("2026-08-14", 0.0), ("2026-08-15", 0.0), ("2026-08-16", 0.0), ("2026-08-17", 0.0),
    ("2026-08-18", 0.0), ("2026-08-19", 0.0), ("2026-08-20", 0.20), ("2026-08-21", 5.29),
    ("2026-08-22", 3.08), ("2026-08-23", 0.27), ("2026-08-24", 4.59), ("2026-08-25", 6.20),
    ("2026-08-26", 2.01), ("2026-08-27", 0.21), ("2026-08-28", 0.97), ("2026-08-29", 0.17),
    ("2026-08-30", 0.17), ("2026-08-31", 0.40), ("2026-09-01", 0.16), ("2026-09-02", 0.20),
    ("2026-09-03", 0.19), ("2026-09-04", 0.41), ("2026-09-05", 0.29), ("2026-09-06", 0.31),
    ("2026-09-07", 0.26), ("2026-09-08", 0.29), ("2026-09-09", 0.15),
]

SERVICES = [
    ("Cloud Run", 21.81), ("BigQuery", 1.75), ("Secret Manager", 1.57),
    ("Artifact Registry", 0.77), ("Cloud Scheduler", 0.50), ("Cloud Storage", 0.01),
]

MONTHS = [  # invoice_month, cloud_run, bigquery, outros, gross, credits, net
    ("202607", 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
    ("202608", 20.28, 1.44, 1.93, 23.65, 0.0, 23.65),
    ("202609", 0.86, 0.02, 1.31, 2.75, -0.57, 2.19),
]

META = {
    "data_updated_at": "2026-09-09T15:49:47Z",
    "source_rows": 90226,
    "invoice_months": ["202607", "202608", "202609"],
    "export_ok": True,
}

DIMENSIONS = {
    "services": [s for s, _ in SERVICES],
    "environments": ["prod", "dev"],
    "apps": ["atlas", "polaris-cost-control", "observability-hub"],
    "invoice_months": ["202607", "202608", "202609"],
    "data_updated_at": META["data_updated_at"],
    "currency_rate": RATE,
    "export_ok": True,
    "source_rows": META["source_rows"],
}

SCORECARD = {
    "invoice_month": "202609",
    "net_cost_mtd_brl": 2.19,
    "net_cost_mtd_usd": 2.19 / RATE,
    "gross_cost_mtd_brl": 2.75,
    "credits_mtd_brl": -0.57,
    "prev_month_net_brl": 23.65,
    "mom_pct": -0.691,
    "run_rate_eom_brl": 2.19 / 9 * 30,
    "days_elapsed": 9,
    "days_in_month": 30,
    "budget_brl": 20.0,
    "budget_used_pct": 2.19 / 20.0,
    "run_rate_vs_budget_pct": (2.19 / 9 * 30) / 20.0,
    "effective_savings_pct": 0.022,
}


def daily_points() -> list[dict]:
    out, buf = [], []
    for d, v in _DAILY:
        buf.append(v)
        buf = buf[-7:]
        out.append({
            "usage_date": d, "net_cost_brl": v, "net_cost_usd": v / RATE,
            "ma7_brl": sum(buf) / len(buf),
        })
    return out


ANOMALIES = [
    {"usage_date": "2026-08-25", "service_description": "Cloud Run", "net_cost_brl": 5.68,
     "avg_28d_brl": 0.46, "z_score": 4.1, "deviation_abs_brl": 5.22, "deviation_pct": 11.35},
    {"usage_date": "2026-08-21", "service_description": "Cloud Run", "net_cost_brl": 5.15,
     "avg_28d_brl": 0.42, "z_score": 3.7, "deviation_abs_brl": 4.73, "deviation_pct": 11.26},
]

COVERAGE = [{
    "invoice_month": "202609", "pct_app": 0.04, "pct_environment": 0.04,
    "pct_managed_by": 0.10, "net_cost_total_brl": 26.41,
}]

COVERAGE_WEEKLY = [
    {"week_start": "2026-08-17", "pct_app": 0.0, "pct_environment": 0.0, "pct_managed_by": 0.0},
    {"week_start": "2026-08-24", "pct_app": 0.02, "pct_environment": 0.02, "pct_managed_by": 0.06},
    {"week_start": "2026-08-31", "pct_app": 0.035, "pct_environment": 0.04, "pct_managed_by": 0.09},
    {"week_start": "2026-09-07", "pct_app": 0.04, "pct_environment": 0.042, "pct_managed_by": 0.10},
]

ALLOC_BY_APP = {
    "rows": [
        {"label_app": "atlas", "net_cost_brl": 0.60},
        {"label_app": "polaris-cost-control", "net_cost_brl": 0.30},
        {"label_app": "observability-hub", "net_cost_brl": 0.17},
    ],
    "unallocated_net_cost_brl": 23.78,
    "unallocated_pct": 0.90,
}

ALLOC_BY_ENV = [
    {"label_environment": "prod", "net_cost_brl": 0.75},
    {"label_environment": "dev", "net_cost_brl": 0.35},
]

CHARGEBACK = {
    "coverage_pct": 0.10,
    "ready": False,
    "criteria": [
        {"key": "labels_in_terraform", "label": "Labels padrão via default_labels", "status": "ok"},
        {"key": "coverage_ge_95", "label": "Cobertura ≥ 95% do custo", "status": "missing"},
        {"key": "owner_per_app", "label": "Dono definido por app", "status": "missing"},
        {"key": "manual_resources", "label": "Recursos manuais (secrets) rotulados", "status": "partial"},
    ],
}

SKU_COST = [
    ("Cloud Run", "CPU Allocation Time", "vCPU·s", 16.00, 1_060_000, 16.00 / 1_060_000),
    ("Cloud Run", "Memory Allocation Time", "GiB·s", 5.00, 2_130_000, 5.00 / 2_130_000),
    ("Cloud Run", "Requests", "1k req", 0.61, 48.2, 0.61 / 48.2),
    ("BigQuery", "Analysis", "TiB", 1.75, 0.20, 8.75),
    ("Secret Manager", "Access operations", "10k ops", 1.57, 310.0, 0.00506),
    ("Artifact Registry", "Storage", "GiB·mês", 0.77, 0.11, 7.0),
]

NEW_SKUS = [
    {"service_description": "Cloud Run", "sku_description": "Requests", "first_seen_date": "2026-08-28"},
]

COMMITMENT = {
    "covered_pct": 0.0, "eligible_spend_brl": 21.81,
    "on_demand_spend_brl": 21.81, "cud_reeval_threshold_brl": 30.0,
}

UNIT_ECON = {
    "cost_per_deploy_brl": 0.04, "deploy_count": 540,
    "cost_per_1k_req_brl": 0.0006, "cost_per_gib_log_brl": 0.0,
    "cost_per_day_avg_30d_brl": 0.88,
    "cost_per_vcpu_s_brl": 16.00 / 1_060_000, "cost_per_gib_s_brl": 5.00 / 2_130_000,
    "cpu_mem_ratio": "76 : 24",
}

WATERFALL = [
    {"label": "cost_at_list", "value_brl": 26.41, "kind": "start"},
    {"label": "negotiated_discount", "value_brl": 0.0, "kind": "decrease"},
    {"label": "credits", "value_brl": -0.57, "kind": "decrease"},
    {"label": "net_cost", "value_brl": 25.84, "kind": "end"},
]
