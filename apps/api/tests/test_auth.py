"""auth.is_admin_email -- bootstrap + lista autogerenciável do Firestore
(get_admins_or_empty). O grupo do Workspace (admin_group_email) NÃO entra
mais aqui (2026-09-21): a delegação domain-wide nunca foi autorizada, então
is_group_member sempre falhava fechado -- ver auth.py."""

import os

os.environ.setdefault("BILLING_API_MOCK", "1")

from billing_api import firestore as fsdb
from billing_api.auth import is_admin_email


def test_is_admin_email_bootstrap():
    assert is_admin_email("matheus.fuzati@dp6.com.br") is True
    assert is_admin_email("MATHEUS.FUZATI@DP6.COM.BR") is True  # normaliza case


def test_is_admin_email_none():
    assert is_admin_email(None) is False


def test_is_admin_email_via_self_service_list(monkeypatch):
    monkeypatch.setattr(fsdb, "get_admins_or_empty", lambda: ["victoria.caroline@dp6.com.br"])
    assert is_admin_email("victoria.caroline@dp6.com.br") is True
    assert is_admin_email("VICTORIA.CAROLINE@DP6.COM.BR") is True
    assert is_admin_email("ninguem@dp6.com.br") is False


def test_is_admin_email_firestore_down_fails_closed(monkeypatch):
    """get_admins_or_empty já é fail-closed (devolve [] em erro) -- aqui só
    confirmamos que is_admin_email não vira admin de ninguém extra nesse caso."""
    monkeypatch.setattr(fsdb, "get_admins_or_empty", lambda: [])
    assert is_admin_email("victoria.caroline@dp6.com.br") is False
