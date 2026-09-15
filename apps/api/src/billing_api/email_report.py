"""Relatório semanal de custo por e-mail — geração de conteúdo + gráficos +
envio via Gmail API.

Reaproveita as funções de routes.py como chamadas Python diretas (não HTTP)
pra MTD/run-rate/budget e séries de custo diário/por serviço/por projeto.

Dry-run vs envio real é decidido por Settings.environment == "prod" -- em
dev NUNCA chamamos a Gmail API (nem construímos as credenciais), então dev
não precisa de nenhum grant de domain-wide delegation pra ser testável.

Envio via Gmail API usa o MESMO padrão de credencial de workspace_directory.py
(Signer + impersonation, sem chave de SA local), só troca escopo/subject:
gmail.send impersonando Settings.report_sender_email. Reaproveita raw HTTP
(AuthorizedSession) em vez de adicionar o SDK google-api-python-client como
dependência nova.

Visual: cards de métrica + gráficos de barra (PNG embutido por CID), não
tabela de texto corrido — reaproveita os MESMOS tokens/cores do tema claro
do painel (apps/web/src/index.css) e o MESMO desenho de MetricTile/HBars/
TemporalChart, só reimplementado em HTML+matplotlib porque cliente de
e-mail não roda CSS custom properties/flexbox/grid de verdade (por isso
todo layout aqui é <table>, e toda cor é hex literal, nunca var()).
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
from .bq import mock_active
from .config import get_settings

log = logging.getLogger("billing_api.email_report")

_GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
_GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

_TZ = "America/Sao_Paulo"
_TOP_N = 5


# ---------------------------------------------------------------- dados

def _last_7_days(project: str | None) -> list[m.DailyPointDTO]:
    today = date.today()
    frm = (today - timedelta(days=6)).isoformat()
    return routes.cost_daily(from_=frm, to=today.isoformat(), project=project)


def _previous_7_days_net_brl(project: str | None) -> float:
    """Semana anterior aos "últimos 7 dias" -- [hoje-13, hoje-7], mesmo
    tamanho de janela. Cobre virada de mês de graça (cost_daily já soma por
    usage_date corrido, não por invoice_month)."""
    if mock_active():
        return 0.0
    today = date.today()
    frm = (today - timedelta(days=13)).isoformat()
    to = (today - timedelta(days=7)).isoformat()
    pts = routes.cost_daily(from_=frm, to=to, project=project)
    return sum(p.net_cost_brl for p in pts)


def _project_name(project: str | None) -> str | None:
    if not project or mock_active():
        return None
    try:
        dims = routes.dimensions()
        return next((p.project_name for p in dims.projects if p.project_id == project), project)
    except Exception:
        return project


def _top_services_window(project: str | None, from_: str, to: str) -> list[m.ServiceCostDTO]:
    """Top N serviços por custo na janela -- cost_by_service já devolve
    ORDER BY net_cost_brl DESC, só corta em N. Usada 2x (mês corrente e
    últimos 7 dias -- mesma função, janela diferente)."""
    if mock_active():
        return []
    return routes.cost_by_service(from_=from_, to=to, project=project)[:_TOP_N]


def _top_projects(from_: str, to: str) -> list[m.ProjectCostDTO]:
    """Só faz sentido pro escopo conta inteira (1 projeto não tem "top
    projeto" dele mesmo)."""
    if mock_active():
        return []
    return routes.cost_by_project(from_=from_, to=to)[:_TOP_N]


# ---------------------------------------------------------------- graficos

# Mesmos tokens LITERAIS do tema claro (index.css) que o resto do painel usa
# -- e-mail é sempre um documento "claro" (cliente de e-mail não aplica o
# dark mode do app), e o preview no ADM também força claro (ver Adm.tsx).
_CHART_NET = "#2166ac"     # --chart-net (claro)
_CHART_OTHER = "#6e747c"   # --chart-other (claro)
_CHART_GRID = "#dedcda"    # --border (claro)
_CHART_TICK = "#555b62"    # --muted-foreground (claro)
_CHART_TITLE = "#1d1d1b"   # --foreground (claro)

_BG = "#fafaf8"            # --background (claro)
_INK = "#1d1d1b"           # --foreground (claro)
_MUTED = "#555b62"         # --muted-foreground (claro)
_CARD_BG = "#f0efec"       # --card (claro)
_BORDER = "#dedcda"        # --border (claro)
_PRIMARY = "#ffb302"       # --primary (acento dp6)
_STATUS_OK_FG = "#0b7a43"
_STATUS_OK_RGB = "52,211,153"
_STATUS_WARN_FG = "#8a5700"
_STATUS_WARN_RGB = "255,179,2"

_plt_mod = None


def _get_plt():
    """Import preguiçoso do matplotlib (backend Agg, sem GUI) -- só paga o
    custo de import quando um e-mail de verdade precisa ser renderizado."""
    global _plt_mod
    if _plt_mod is None:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        _plt_mod = plt
    return _plt_mod


def _render_combo_chart(points: list[m.DailyPointDTO]) -> bytes:
    """Barra diária + linha acumulada (eixo direito) -- mesmo visual do
    TemporalChart de série única da Visão Geral (barra e linha na mesma cor
    --chart-net, diferenciadas pela forma, não pela cor)."""
    plt = _get_plt()

    days = [p.usage_date[5:] for p in points]  # "MM-DD"
    values = [p.net_cost_brl for p in points]
    cum: list[float] = []
    running = 0.0
    for v in values:
        running += v
        cum.append(running)
    x = range(len(days))

    fig, ax1 = plt.subplots(figsize=(6, 2.6), dpi=140)
    fig.patch.set_facecolor("#ffffff")
    ax1.set_facecolor("#ffffff")

    ax1.bar(x, values, color=_CHART_NET, alpha=0.45, width=0.6, label="diário", zorder=2)
    ax2 = ax1.twinx()
    ax2.plot(x, cum, color=_CHART_NET, linewidth=2, solid_capstyle="round", label="acumulado", zorder=3)
    ax2.scatter([x[-1]], [cum[-1]], color=_CHART_NET, s=18, zorder=4)

    ax1.set_title("Custo diário e acumulado — últimos 7 dias (R$)", fontsize=10, color=_CHART_TITLE, loc="left")
    ax1.set_xticks(list(x))
    ax1.set_xticklabels(days, fontsize=8, color=_CHART_TICK)
    ax1.tick_params(axis="y", labelsize=8, colors=_CHART_TICK)
    ax2.tick_params(axis="y", labelsize=8, colors=_CHART_TICK)
    ax1.yaxis.grid(True, color=_CHART_GRID, linewidth=0.8)
    ax1.set_axisbelow(True)
    ax1.set_ylim(bottom=0)
    ax2.set_ylim(bottom=0)
    for side in ("top", "left", "right"):
        ax1.spines[side].set_visible(False)
        ax2.spines[side].set_visible(False)
    ax1.spines["bottom"].set_color(_CHART_GRID)
    ax1.tick_params(axis="both", length=0)
    ax2.tick_params(axis="both", length=0)

    h1, l1 = ax1.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax1.legend(h1 + h2, l1 + l2, loc="upper left", fontsize=7.5, frameon=False, labelcolor=_CHART_TICK)

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=fig.get_facecolor())
    plt.close(fig)
    return buf.getvalue()


def _render_hbars_chart(items: list[tuple[str, float, float]], title: str, width_in: float = 3.6) -> bytes:
    """Barra horizontal -- mesmo desenho do HBars.tsx (1ª linha destacada em
    --chart-net, resto em --chart-other, valor + % no fim de cada barra).
    items: [(label, net_cost_brl, pct_of_total), ...], já ordenado (maior
    primeiro) por quem chama."""
    plt = _get_plt()

    labels = [i[0] for i in items]
    values = [i[1] for i in items]
    pcts = [i[2] for i in items]
    n = len(items)

    fig, ax = plt.subplots(figsize=(width_in, 0.42 * n + 0.9), dpi=140)
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#ffffff")

    y = range(n)
    colors = [_CHART_NET if i == 0 else _CHART_OTHER for i in range(n)]
    ax.barh(list(y), values, color=colors, height=0.62, zorder=2)
    ax.set_yticks(list(y))
    ax.set_yticklabels(labels, fontsize=9, color=_CHART_TITLE)
    ax.invert_yaxis()  # maior valor no topo, mesma leitura do HBars

    ax.set_title(title, fontsize=10, color=_CHART_TITLE, loc="left")
    ax.set_xticks([])
    for side in ("top", "right", "bottom", "left"):
        ax.spines[side].set_visible(False)
    ax.tick_params(axis="both", length=0)

    max_v = max(values) if values else 1.0
    ax.set_xlim(0, max_v * 1.55)  # espaço pro rótulo de valor+% no fim da barra
    for yi, (v, p) in enumerate(zip(values, pcts)):
        ax.text(v + max_v * 0.025, yi, f"{_brl(v)}  ({_pct(p * 100, 0)})", va="center", fontsize=8.5, color=_CHART_TITLE)

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=fig.get_facecolor())
    plt.close(fig)
    return buf.getvalue()


# ---------------------------------------------------------------- formatacao

def _brl(v: float) -> str:
    """R$ 1.234,56 -- mesmo padrão pt-BR do resto do painel (lib/format.ts).
    Não dá pra confiar em locale do sistema (container não tem pt_BR
    instalado), então troca "," <-> "." na mão."""
    s = f"{v:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"R$ {s}"


def _pct(v: float, digits: int = 1) -> str:
    return f"{v:.{digits}f}%".replace(".", ",")


def _signed_pct(v: float, digits: int = 1) -> str:
    return f"{v:+.{digits}f}%".replace(".", ",")


# ---------------------------------------------------------------- conteudo (HTML)

def _metric_card(label: str, value: str, sub: str | None = None) -> str:
    """1 célula de tabela estilo MetricTile (label uppercase pequeno + valor
    grande mono + sub pequeno). <table> em vez de flexbox/grid -- cliente de
    e-mail não confia em CSS de layout moderno."""
    sub_html = f'<div style="font-size:12px;color:{_MUTED};margin-top:5px">{sub}</div>' if sub else ""
    return f"""<td style="background:{_CARD_BG};border:1px solid {_BORDER};border-radius:5px;padding:14px 16px;vertical-align:top">
      <div style="font:500 10px/1.3 Ubuntu,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:{_MUTED}">{label}</div>
      <div style="font-family:'Ubuntu Mono',ui-monospace,Menlo,monospace;font-weight:700;font-size:22px;letter-spacing:-.02em;color:{_INK};margin-top:6px">{value}</div>
      {sub_html}
    </td>"""


def _metric_grid(cards: list[str], cols: int = 2) -> str:
    rows = []
    for i in range(0, len(cards), cols):
        chunk = cards[i : i + cols]
        pad = "".join('<td style="border:0"></td>' for _ in range(cols - len(chunk)))
        rows.append(f"<tr>{''.join(chunk)}{pad}</tr>")
    gap_rows = f'<tr><td colspan="{cols}" style="height:10px;border:0;padding:0"></td></tr>'.join(rows)
    return f'<table style="width:100%;border-collapse:separate;border-spacing:0"><tbody>{gap_rows}</tbody></table>'


def _badge(ok: bool, text: str) -> str:
    """Mesmo desenho do StatusBadge -- ícone + texto (nunca só cor),
    fundo = cor de status em ~16% de opacidade."""
    rgb = _STATUS_OK_RGB if ok else _STATUS_WARN_RGB
    fg = _STATUS_OK_FG if ok else _STATUS_WARN_FG
    mark = "✓" if ok else "▲"
    return (
        f'<span style="display:inline-block;padding:3px 9px;border-radius:999px;'
        f'font-size:11.5px;font-weight:500;color:{fg};background:rgba({rgb},0.16)">{mark} {text}</span>'
    )


def _section(title: str, cap: str | None, body: str) -> str:
    cap_html = f'<p style="margin:3px 0 0;color:{_MUTED};font-size:12.5px">{cap}</p>' if cap else ""
    return f"""<div style="margin-top:24px">
      <h3 style="margin:0;color:{_INK};font-size:16px;font-weight:500">{title}</h3>
      {cap_html}
      <div style="margin-top:10px">{body}</div>
    </div>"""


def _svc_alt(items: list[m.ServiceCostDTO]) -> str:
    return ", ".join(f"{s.service_description} {_brl(s.net_cost_brl)} ({_pct(s.pct_of_total * 100, 0)})" for s in items)


def _proj_alt(items: list[m.ProjectCostDTO]) -> str:
    return ", ".join(f"{p.project_name} {_brl(p.net_cost_brl)} ({_pct(p.pct_of_total * 100, 0)})" for p in items)


def _render_html(
    scope: str,
    project_name: str | None,
    sc: m.ScorecardDTO,
    last7: list[m.DailyPointDTO],
    prev7_total: float,
    charts: dict[str, bytes],
    top_services_month: list[m.ServiceCostDTO],
    top_services_7d: list[m.ServiceCostDTO],
    top_projects: list[m.ProjectCostDTO],
) -> str:
    titulo = "Conta inteira" if scope == fsdb.ACCOUNT_SCOPE else (project_name or scope)
    total_7d = sum(p.net_cost_brl for p in last7)
    delta7 = total_7d - prev7_total
    delta7_pct = (delta7 / prev7_total) if prev7_total else 0.0
    ok7 = delta7 <= 0
    sem_budget = sc.budget_brl is None

    visao_geral = _metric_grid(
        [
            _metric_card(
                "Orçamento mensal",
                "—" if sem_budget else _brl(sc.budget_brl),
                "sem orçamento cadastrado (aba ADM)" if sem_budget else None,
            ),
            _metric_card(
                "Gasto líquido atual",
                _brl(sc.net_cost_mtd_brl),
                f"{sc.days_elapsed} de {sc.days_in_month} dias do mês",
            ),
            _metric_card(
                "% do orçamento gasto",
                "—" if sem_budget else _pct(sc.budget_used_pct * 100),
                "sem orçamento cadastrado (aba ADM)" if sem_budget else None,
            ),
            _metric_card(
                "Projeção fim de mês",
                _brl(sc.run_rate_eom_brl),
                "sem orçamento cadastrado (aba ADM)" if sem_budget else f"{_pct(sc.run_rate_vs_budget_pct * 100)} do orçamento",
            ),
        ]
    )

    week_card = _metric_grid(
        [
            _metric_card(
                "Custo nos últimos 7 dias",
                _brl(total_7d),
                _badge(ok7, f"{_signed_pct(delta7_pct * 100)} vs. 7 dias anteriores ({_brl(prev7_total)})"),
            )
        ],
        cols=1,
    )
    combo_img = (
        f'<img src="cid:combo_7d" alt="Custo diário e acumulado dos últimos 7 dias, total {_brl(total_7d)}" '
        f'style="width:100%;max-width:608px;margin-top:10px;display:block" />'
    )

    top_svc_cells = []
    if "top_svc_month" in charts:
        top_svc_cells.append(
            f'<td style="width:50%;vertical-align:top;padding-right:6px">'
            f'<img src="cid:top_svc_month" alt="{_svc_alt(top_services_month)}" style="width:100%;display:block" /></td>'
        )
    if "top_svc_7d" in charts:
        top_svc_cells.append(
            f'<td style="width:50%;vertical-align:top;padding-left:6px">'
            f'<img src="cid:top_svc_7d" alt="{_svc_alt(top_services_7d)}" style="width:100%;display:block" /></td>'
        )
    top_svc_html = (
        f'<table style="width:100%;border-collapse:collapse"><tr>{"".join(top_svc_cells)}</tr></table>'
        if top_svc_cells
        else ""
    )

    top_proj_html = ""
    if "top_projects" in charts:
        top_proj_html = (
            f'<img src="cid:top_projects" alt="{_proj_alt(top_projects)}" '
            f'style="max-width:420px;width:100%;display:block" />'
        )

    sections = _section("Visão geral", None, visao_geral)
    sections += _section("Custo nos últimos 7 dias", None, week_card + combo_img)
    if top_svc_html:
        sections += _section("Top serviços", "Mês corrente e últimos 7 dias.", top_svc_html)
    if top_proj_html:
        sections += _section("Top projetos", "Mês corrente — conta inteira.", top_proj_html)

    # Fundo/cores fixos (nunca var()) -- e-mail é sempre um documento "claro",
    # independente do tema do app; o preview no ADM também força um cartão
    # claro por cima (ver Adm.tsx) pra não quebrar no dark mode.
    return f"""
    <div style="font-family:Ubuntu,'Segoe UI',Roboto,sans-serif;color:{_INK};background:{_BG};max-width:640px;padding:4px">
      <div style="border-top:3px solid {_PRIMARY};padding-top:14px">
        <h2 style="margin:0 0 2px;color:{_INK};font-size:20px;font-weight:500">Relatório semanal de custo — {titulo}</h2>
        <p style="margin:0;color:{_MUTED};font-size:12.5px">Gerado automaticamente · painel FinOps</p>
      </div>
      {sections}
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
    last7 = _last_7_days(project)
    prev7_total = _previous_7_days_net_brl(project)

    today = date.today()
    month_start = today.replace(day=1).isoformat()
    today_iso = today.isoformat()
    week_from = (today - timedelta(days=6)).isoformat()

    top_services_month = _top_services_window(project, month_start, today_iso)
    top_services_7d = _top_services_window(project, week_from, today_iso)
    # top projetos só faz sentido na conta inteira -- 1 projeto não compara
    # contra si mesmo.
    top_projects = _top_projects(month_start, today_iso) if scope == fsdb.ACCOUNT_SCOPE else []

    charts: dict[str, bytes] = {"combo_7d": _render_combo_chart(last7)}
    if top_services_month:
        charts["top_svc_month"] = _render_hbars_chart(
            [(s.service_description, s.net_cost_brl, s.pct_of_total) for s in top_services_month],
            f"Top {len(top_services_month)} serviços — mês corrente",
        )
    if top_services_7d:
        charts["top_svc_7d"] = _render_hbars_chart(
            [(s.service_description, s.net_cost_brl, s.pct_of_total) for s in top_services_7d],
            f"Top {len(top_services_7d)} serviços — últimos 7 dias",
        )
    if top_projects:
        charts["top_projects"] = _render_hbars_chart(
            [(p.project_name, p.net_cost_brl, p.pct_of_total) for p in top_projects],
            f"Top {len(top_projects)} projetos — mês corrente",
            width_in=6.2,
        )

    html = _render_html(
        scope, project_name, sc, last7, prev7_total, charts,
        top_services_month, top_services_7d, top_projects,
    )
    return html, charts


def run_weekly_report(only_scope: str | None = None, respect_toggle: bool = False) -> m.SendNowResultDTO:
    """only_scope: manda só 1 budget (linha do ADM) em vez de todos.
    respect_toggle: só o disparo AGENDADO (Cloud Scheduler) passa True --
    filtra pra só os budgets com report_enabled=true. "Enviar agora" (manual,
    linha ou "enviar pra todos") é sempre um disparo explícito, ignora o
    toggle de propósito (ver BudgetConfigDTO.report_enabled)."""
    if mock_active():
        # modo mock: sem Firestore/BigQuery real pra bater -- mesmo idioma de
        # "if mock_active(): return fx...." usado em todo endpoint de routes.py.
        return m.SendNowResultDTO(
            dry_run=True, scopes_sent=[], scopes_failed=[],
            previews={"_mock": "<p>Modo mock — sem dado real pra gerar o relatório.</p>"},
        )

    s = get_settings()
    dry_run = s.environment != "prod"

    budgets = fsdb.list_budgets()
    if only_scope:
        budgets = [b for b in budgets if b["scope"] == only_scope]
    if respect_toggle:
        budgets = [b for b in budgets if b.get("report_enabled")]

    sent, failed, previews = [], [], {}
    for cfg in budgets:
        scope = cfg["scope"]
        emails = [e for e in cfg.get("emails", []) if e]
        if not emails:
            continue
        try:
            html, charts = _generate_for_scope(scope, cfg)
            titulo = "Conta inteira" if scope == fsdb.ACCOUNT_SCOPE else (cfg.get("project_name") or scope)
            previews[scope] = html  # sempre preenchido, dry-run ou envio real
            if dry_run:
                log.info("dry-run: relatório de %s NÃO enviado (environment=%s)", scope, s.environment)
            else:
                msg = _build_mime(emails, f"Relatório semanal de custo — {titulo}", html, charts)
                _send_via_gmail(msg)
            sent.append(scope)
        except Exception:
            log.exception("Falha gerando/enviando relatório do scope %s", scope)
            failed.append(scope)

    fsdb.record_report_run("error" if failed and not sent else ("partial" if failed else "ok"))
    return m.SendNowResultDTO(dry_run=dry_run, scopes_sent=sent, scopes_failed=failed, previews=previews)
