"""Cliente BigQuery + cache TTL. Cai para modo mock se o BQ nao autenticar."""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import HTTPException

from .config import get_settings

log = logging.getLogger("billing_api.bq")

_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_client = None
_mock_active: bool | None = None


def _get_client():
    global _client
    if _client is None:
        from google.cloud import bigquery

        s = get_settings()
        _client = bigquery.Client(project=s.gcp_project, location=s.bq_location)
    return _client


def mock_active() -> bool:
    """True se rodando com fixtures (flag explicita ou BQ indisponivel)."""
    global _mock_active
    if _mock_active is not None:
        return _mock_active
    s = get_settings()
    if s.mock:
        _mock_active = True
        return True
    try:
        _get_client()
        _mock_active = False
    except Exception as exc:
        log.warning("BigQuery indisponivel (%s) — modo mock ligado", exc)
        _mock_active = True
    return _mock_active


def query(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Roda uma query e devolve list[dict]. Cacheada por cache_ttl_seconds."""
    s = get_settings()
    key = sql + repr(sorted((params or {}).items()))
    hit = _cache.get(key)
    now = time.time()
    if hit and now - hit[0] < s.cache_ttl_seconds:
        return hit[1]

    from google.api_core.exceptions import Forbidden, NotFound
    from google.cloud import bigquery

    job_params = [
        bigquery.ScalarQueryParameter(k, _bq_type(v), v) for k, v in (params or {}).items()
    ]
    try:
        # labels do job: o BigQuery inclui labels de job no billing export (doc oficial) —
        # com isso, o custo de rodar esta API deixa de cair no pseudo-app "(BigQuery · outras
        # queries)" da reconciliacao de alocacao e ganha label_app/label_environment nativos.
        job = _get_client().query(
            sql,
            job_config=bigquery.QueryJobConfig(
                query_parameters=job_params,
                labels={"app": s.app_label, "environment": s.env_label},
            ),
        )
        rows = [dict(r) for r in job.result()]
    except (NotFound, Forbidden) as exc:
        # tabela/view ainda nao materializada (1a execucao do Dataform pendente) ou sem grant
        # na origem — nao vaza detalhe de infra (nome de dataset, job id) pro cliente.
        log.warning("dado ainda indisponivel no BigQuery: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={"code": "data_not_ready", "message": "Dados ainda não disponíveis — o pipeline de custo ainda não rodou pela primeira vez."},
        ) from exc
    _cache[key] = (now, rows)
    return rows


def _bq_type(v: Any) -> str:
    if isinstance(v, bool):
        return "BOOL"
    if isinstance(v, int):
        return "INT64"
    if isinstance(v, float):
        return "FLOAT64"
    return "STRING"
