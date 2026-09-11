"""Smoke: em modo mock, todo endpoint responde 200 com o schema."""

import os

os.environ["BILLING_API_MOCK"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from billing_api.main import app  # noqa: E402

client = TestClient(app)

RANGE = {"from": "2026-08-10", "to": "2026-09-09"}

ENDPOINTS = [
    ("/healthz", {}),
    ("/api/meta", {}),
    ("/api/dimensions", {}),
    ("/api/scorecard", {}),
    ("/api/scorecard", {"environment": "prod"}),
    ("/api/scorecard", {**RANGE, "service": "Cloud Run"}),
    ("/api/reconciliation", {"app": "atlas"}),
    ("/api/cost/series", {**RANGE}),
    ("/api/cost/series", {**RANGE, "grain": "day", "group_by": "service"}),
    ("/api/cost/series", {"grain": "month", "group_by": "environment"}),
    ("/api/cost/daily", RANGE),
    ("/api/cost/by-service", RANGE),
    ("/api/cost/monthly", {}),
    ("/api/reconciliation", {}),
    ("/api/budget", {}),
    ("/api/budget/burndown", {}),
    ("/api/forecast", {}),
    ("/api/allocation/coverage", {}),
    ("/api/allocation/coverage/weekly", {}),
    ("/api/allocation/by-app", {}),
    ("/api/allocation/by-env", {}),
    ("/api/allocation/chargeback-readiness", {}),
    ("/api/cost/by-sku", RANGE),
    ("/api/sku/new", {}),
    ("/api/optimization/commitment-coverage", {}),
    ("/api/optimization/recommendations", {}),
    ("/api/unit-economics", {}),
    ("/api/unit-economics/series", RANGE),
    ("/api/efficiency/waterfall", {}),
    ("/api/anomalies", {}),
]


def test_all_endpoints_ok():
    for path, params in ENDPOINTS:
        r = client.get(path, params=params)
        assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text}"


def test_scorecard_shape():
    r = client.get("/api/scorecard").json()
    assert r["budget_brl"] == 20.0
    assert r["invoice_month"] == "202609"


def test_recommendations_sum():
    r = client.get("/api/optimization/recommendations").json()
    assert r["potential_savings_max_brl"] >= r["potential_savings_min_brl"] > 0
