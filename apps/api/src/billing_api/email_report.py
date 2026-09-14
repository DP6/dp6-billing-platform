"""Relatório semanal de custo por e-mail — geração de conteúdo + gráficos +
envio via Gmail API.

Reaproveita as funções de routes.py como chamadas Python diretas (não HTTP)
pra MTD/run-rate/budget e série dos últimos 7 dias; só a comparação "mesmo
dia do mês anterior" é query nova (nenhum endpoint existente calcula isso).

Dry-run vs envio real é decidido por Settings.environment == "prod" -- em
dev NUNCA chamamos a Gmail API (nem construímos as credenciais), então dev
não precisa de nenhum grant de domain-wide delegation pra ser testável.

Envio via Gmail API usa o MESMO padrão de credencial de workspace_directory.py
(Signer + impersonation, sem chave de SA local), só troca escopo/subject:
gmail.send impersonando Settings.report_sender_email. Reaproveita raw HTTP
(AuthorizedSession) em vez de adicionar o SDK google-api-python-client como
dependência nova.
"""

from __future__ import annotations

import base64
import io
import logging
from datetime import date, timedelta
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from . import firestore as fsdb
from . import models as m
from . import routes
from .bq import mock_active, query
from .config import get_settings

log = logging.getLogger("billing_api.email_report")

_GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
_GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

_TZ = "America/Sao_Paulo"


# ---------------------------------------------------------------- dados

def _same_day_last_month_net_brl(project: str | None) -> float:
    if mock_active():
        return 0.0
    where, params = routes._scope(None, None, None, project)
    rows = query(f"""
        SELECT SUM(net_cost_brl) net FROM `{routes.RPT}.rpt_cost_daily`
        WHERE usage_date = DATE_SUB(CURRENT_DATE('{_TZ}'), INTERVAL 1 MONTH) {where}
    """, params)
    return float(rows[0]["net"] or 0.0) if rows else 0.0


def _last_7_days(project: str | None) -> list[m.DailyPointDTO]:
    today = date.today()
    frm = (today - timedelta(days=6)).isoformat()
    return routes.cost_daily(from_=frm, to=today.isoformat(), project=project)


def _project_name(project: str | None) -> str | None:
    if not project or mock_active():
        return None
    try:
        dims = routes.dimensions()
        return next((p.project_name for p in dims.projects if p.project_id == project), project)
    except Exception:
        return project


# ---------------------------------------------------------------- graficos

def _render_charts(points: list[m.DailyPointDTO]) -> dict[str, bytes]:
    """1 grafico de barras (ultimos 7 dias). PNG, sem GUI (backend Agg)."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    days = [p.usage_date[5:] for p in points]  # "MM-DD"
    values = [p.net_cost_brl for p in points]

    fig, ax = plt.subplots(figsize=(6, 2.6), dpi=140)
    ax.bar(days, values, color="#2563eb")
    ax.set_title("Custo líquido — últimos 7 dias (R$)", fontsize=10)
    ax.tick_params(axis="both", labelsize=8)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return {"chart_7d": buf.getvalue()}


# ---------------------------------------------------------------- conteudo

def _render_html(
    scope: str, project_name: str | None, sc: m.ScorecardDTO,
    same_day_last_month: float, last7: list[m.DailyPointDTO], chart_ids: list[str],
) -> str:
    titulo = "Conta inteira" if scope == fsdb.ACCOUNT_SCOPE else (project_name or scope)
    same_day_today = last7[-1].net_cost_brl if last7 else 0.0
    delta = same_day_today - same_day_last_month
    delta_pct = (delta / same_day_last_month) if same_day_last_month else 0.0
    total_7d = sum(p.net_cost_brl for p in last7)
    imgs = "".join(f'<img src="cid:{cid}" style="max-width:100%;margin-top:12px" />' for cid in chart_ids)

    return f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;max-width:640px">
      <h2 style="margin-bottom:4px">Relatório semanal de custo — {titulo}</h2>
      <p style="color:#6b7280;margin-top:0">Gerado automaticamente · painel FinOps</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tr><td style="padding:6px 0;color:#6b7280">Gasto no mês</td>
            <td style="padding:6px 0;text-align:right;font-weight:600">R$ {sc.net_cost_mtd_brl:,.2f}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">% do orçamento</td>
            <td style="padding:6px 0;text-align:right;font-weight:600">{sc.budget_used_pct * 100:.1f}%</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Run-rate do mês</td>
            <td style="padding:6px 0;text-align:right;font-weight:600">R$ {sc.run_rate_eom_brl:,.2f}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Mesmo dia, mês anterior</td>
            <td style="padding:6px 0;text-align:right;font-weight:600">
              R$ {same_day_last_month:,.2f} ({delta_pct:+.1%})</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Últimos 7 dias</td>
            <td style="padding:6px 0;text-align:right;font-weight:600">R$ {total_7d:,.2f}</td></tr>
      </table>
      {imgs}
    </div>
    """.strip()


# ---------------------------------------------------------------- envio

def _build_gmail_credentials():
    """Mesmo padrão de workspace_directory._build_delegated_credentials, com
    escopo/subject diferentes. None se não configurado."""
    import google.auth
    from google.auth.iam import Signer
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    s = get_settings()
    if not s.report_sender_email or not s.runtime_sa_email:
        return None

    adc_credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/iam"])
    request = Request()
    signer = Signer(request, adc_credentials, s.runtime_sa_email)
    return service_account.Credentials(
        signer=signer,
        service_account_email=s.runtime_sa_email,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=_GMAIL_SCOPES,
        subject=s.report_sender_email,
    )


def _build_mime(to_addrs: list[str], subject: str, html: str, charts: dict[str, bytes]) -> MIMEMultipart:
    s = get_settings()
    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = s.report_sender_email
    msg["To"] = ", ".join(to_addrs)

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText("Relatório semanal de custo — abra num cliente que exiba HTML.", "plain"))
    alt.attach(MIMEText(html, "html"))
    msg.attach(alt)

    for cid, png in charts.items():
        img = MIMEImage(png, _subtype="png")
        img.add_header("Content-ID", f"<{cid}>")
        img.add_header("Content-Disposition", "inline", filename=f"{cid}.png")
        msg.attach(img)
    return msg


def _send_via_gmail(msg: MIMEMultipart) -> None:
    from google.auth.transport.requests import AuthorizedSession

    creds = _build_gmail_credentials()
    if creds is None:
        raise RuntimeError("Gmail API não configurada (workspace_impersonate_email/runtime_sa_email ausente)")
    session = AuthorizedSession(creds)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    resp = session.post(_GMAIL_SEND_URL, json={"raw": raw}, timeout=20)
    resp.raise_for_status()


# ---------------------------------------------------------------- orquestracao

def _generate_for_scope(scope: str, cfg: dict) -> tuple[str, dict[str, bytes]]:
    project = None if scope == fsdb.ACCOUNT_SCOPE else scope
    project_name = cfg.get("project_name") or _project_name(project)
    sc = routes.scorecard(project=project)
    same_day_last_month = _same_day_last_month_net_brl(project)
    last7 = _last_7_days(project)
    charts = _render_charts(last7)
    html = _render_html(scope, project_name, sc, same_day_last_month, last7, list(charts.keys()))
    return html, charts


def run_weekly_report(only_scope: str | None = None) -> m.SendNowResultDTO:
    if mock_active():
        # modo mock: sem Firestore/BigQuery real pra bater -- mesmo idioma de
        # "if mock_active(): return fx...." usado em todo endpoint de routes.py.
        return m.SendNowResultDTO(
            dry_run=True, scopes_sent=[], scopes_failed=[],
            preview_html="<p>Modo mock — sem dado real pra gerar o relatório.</p>",
        )

    s = get_settings()
    dry_run = s.environment != "prod"

    budgets = fsdb.list_budgets()
    if only_scope:
        budgets = [b for b in budgets if b["scope"] == only_scope]

    sent, failed, preview_html = [], [], None
    for cfg in budgets:
        scope = cfg["scope"]
        emails = [e for e in cfg.get("emails", []) if e]
        if not emails:
            continue
        try:
            html, charts = _generate_for_scope(scope, cfg)
            titulo = "Conta inteira" if scope == fsdb.ACCOUNT_SCOPE else (cfg.get("project_name") or scope)
            if dry_run:
                preview_html = html  # última gerada -- suficiente pra preview na tela do ADM
                log.info("dry-run: relatório de %s NÃO enviado (environment=%s)", scope, s.environment)
            else:
                msg = _build_mime(emails, f"Relatório semanal de custo — {titulo}", html, charts)
                _send_via_gmail(msg)
            sent.append(scope)
        except Exception:
            log.exception("Falha gerando/enviando relatório do scope %s", scope)
            failed.append(scope)

    fsdb.record_report_run("error" if failed and not sent else ("partial" if failed else "ok"))
    return m.SendNowResultDTO(dry_run=dry_run, scopes_sent=sent, scopes_failed=failed, preview_html=preview_html)
