"""project_access.py e o helper _project_clause/_require_unrestricted de routes.py --
o modo mock (test_smoke.py) sempre passa authorized=None (bypass), então não exercita
o caminho restrito de verdade. Aqui testamos as duas peças isoladas, sem BigQuery/
Firestore/Directory API reais."""

import os

os.environ.setdefault("BILLING_API_MOCK", "1")

import pytest
from fastapi import HTTPException

from billing_api import firestore as fsdb
from billing_api import project_access as pa
from billing_api import workspace_directory
from billing_api.routes import _project_clause, _project_where, _require_unrestricted

# ---------------------------------------------------------------- _project_clause / _project_where

def test_project_clause_unrestricted_no_project():
    assert _project_clause(None, None) == ("", {})


def test_project_clause_unrestricted_with_project():
    clause, params = _project_clause("dp6-ci-polaris", None)
    assert clause == "project_id = @project_id"
    assert params == {"project_id": "dp6-ci-polaris"}


def test_project_clause_restricted_project_authorized():
    clause, params = _project_clause("proj-a", frozenset({"proj-a", "proj-b"}))
    assert clause == "project_id = @project_id"
    assert params == {"project_id": "proj-a"}


def test_project_clause_restricted_project_forbidden_raises_403():
    with pytest.raises(HTTPException) as exc:
        _project_clause("proj-fora", frozenset({"proj-a"}))
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "forbidden_project"


def test_project_clause_restricted_no_project_empty_set():
    # 0 projetos autorizados -- nunca cai no comportamento "sem filtro" de hoje.
    assert _project_clause(None, frozenset()) == ("FALSE", {})


def test_project_clause_restricted_no_project_nonempty_set():
    clause, params = _project_clause(None, frozenset({"proj-b", "proj-a"}))
    assert clause == "project_id IN UNNEST(@authorized_project_ids)"
    assert params == {"authorized_project_ids": ["proj-a", "proj-b"]}  # sorted, determinístico


def test_project_where_wraps_with_and():
    assert _project_where(None, None) == ("", {})
    where, params = _project_where("proj-a", frozenset({"proj-a"}))
    assert where == " AND project_id = @project_id"
    assert params == {"project_id": "proj-a"}


def test_require_unrestricted_ok_for_bypass():
    _require_unrestricted(None)  # não levanta


def test_require_unrestricted_raises_for_restricted():
    with pytest.raises(HTTPException) as exc:
        _require_unrestricted(frozenset({"proj-a"}))
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "account_wide_only"


# ---------------------------------------------------------------- project_access.py

def test_is_bypass_principal_bootstrap_email(monkeypatch):
    from billing_api.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr(workspace_directory, "is_group_member", lambda *_: False)
    assert pa.is_bypass_principal("matheus.fuzati@dp6.com.br") is True
    assert pa.is_bypass_principal("MATHEUS.FUZATI@DP6.COM.BR") is True  # normaliza case
    assert pa.is_bypass_principal(None) is False
    get_settings.cache_clear()


def test_is_bypass_principal_via_admin_or_finops_group(monkeypatch):
    from billing_api.config import get_settings

    get_settings.cache_clear()
    calls = []

    def fake_is_group_member(group, email):
        calls.append(group)
        return group == "gcp-dp6-gti@dp6.com.br"

    monkeypatch.setattr(workspace_directory, "is_group_member", fake_is_group_member)
    assert pa.is_bypass_principal("admin@dp6.com.br") is True
    assert "gcp-dp6-gti@dp6.com.br" in calls

    monkeypatch.setattr(workspace_directory, "is_group_member", lambda g, _: g == "billing@dp6.com.br")
    assert pa.is_bypass_principal("finops@dp6.com.br") is True

    monkeypatch.setattr(workspace_directory, "is_group_member", lambda *_: False)
    assert pa.is_bypass_principal("ninguem@dp6.com.br") is False
    get_settings.cache_clear()


def test_compute_authorized_project_ids_bypass_is_none(monkeypatch):
    monkeypatch.setattr(pa, "is_bypass_principal", lambda _: True)
    assert pa._compute_authorized_project_ids("admin@dp6.com.br") is None


def test_compute_authorized_project_ids_direct_email(monkeypatch):
    monkeypatch.setattr(pa, "is_bypass_principal", lambda _: False)
    monkeypatch.setattr(
        fsdb,
        "list_project_access_or_empty",
        lambda: [{"project_id": "proj-a", "emails": ["fulano@dp6.com.br"], "groups": []}],
    )
    monkeypatch.setattr(workspace_directory, "is_group_member", lambda *_: False)
    assert pa._compute_authorized_project_ids("fulano@dp6.com.br") == frozenset({"proj-a"})
    assert pa._compute_authorized_project_ids("outra@dp6.com.br") == frozenset()


def test_compute_authorized_project_ids_via_group_dedup(monkeypatch):
    """2 projetos compartilham o MESMO grupo -- is_group_member só deve ser chamado
    1x pra esse grupo (dedup por grupo distinto), não 1x por projeto (N+1)."""
    monkeypatch.setattr(pa, "is_bypass_principal", lambda _: False)
    monkeypatch.setattr(
        fsdb,
        "list_project_access_or_empty",
        lambda: [
            {"project_id": "proj-a", "emails": [], "groups": ["time-x@dp6.com.br"]},
            {"project_id": "proj-b", "emails": [], "groups": ["time-x@dp6.com.br"]},
            {"project_id": "proj-c", "emails": [], "groups": ["outro@dp6.com.br"]},
        ],
    )
    calls = []

    def fake_is_group_member(group, email):
        calls.append(group)
        return group == "time-x@dp6.com.br"

    monkeypatch.setattr(workspace_directory, "is_group_member", fake_is_group_member)
    result = pa._compute_authorized_project_ids("membro@dp6.com.br")
    assert result == frozenset({"proj-a", "proj-b"})
    assert calls.count("time-x@dp6.com.br") == 1
    assert calls.count("outro@dp6.com.br") == 1


def test_get_authorized_project_ids_mock_mode_is_unrestricted():
    # BILLING_API_MOCK=1 setado no topo do arquivo -- mock_active() -> True.
    assert pa.get_authorized_project_ids(email="qualquer@dp6.com.br") is None


def test_get_authorized_project_ids_no_email_is_empty(monkeypatch):
    monkeypatch.setattr(pa, "mock_active", lambda: False)
    assert pa.get_authorized_project_ids(email=None) == frozenset()
