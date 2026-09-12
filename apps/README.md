# apps/ — painel FinOps (Fase 5, `specs/003`)

App standalone: `api/` (FastAPI fino, lê as views `rpt_*` no BigQuery) + `web/` (React + Vite +
Recharts, DP6 Design System). Cloud Run + IAP na Fase 6.

## Rodar local

**API** (modo mock — sem BigQuery, serve os números da validação de 2026-09-09):

```bash
cd apps/api
uv venv && uv pip install -e ".[dev]"        # ou: pip install -e ".[dev]"
BILLING_API_MOCK=1 uv run uvicorn billing_api.main:app --port 8080
uv run pytest                                 # 23 endpoints -> 200 (✅)
```

Sem `BILLING_API_MOCK`, a API tenta o BigQuery (`billing_platform_reporting.rpt_*`); se não
autenticar, cai para mock sozinha.

**Web:**

```bash
cd apps/web
npm install
npm run dev            # http://localhost:5173, proxy /api -> :8080
npm run typecheck      # tsc --noEmit (✅)
```

## Estado

- **`api/`** — completa: 22 endpoints da `specs/003` + `/healthz`, DTOs Pydantic, cache TTL,
  `recommendations.yaml` curado, testes de fumaça.
- **`web/`** — scaffold + shell (topbar preto, tabs, filtros na URL, toggle de tema) + tela
  **Visão geral completa** (scorecard, área diária, barras por serviço, reconciliação). As
  outras **7 telas são stubs** que já chamam seus endpoints e mostram o payload — construir a
  partir de `mock/canvas/<Artboard>.dc.html`.

## Pendências (a resolver na Fase 6 / decisões da `specs/003`)

- IAP + allowlist (reusar OAuth brand do Atlas?).
- `deploy_count` (custo por deploy) — hoje constante em `config.py`.
- Automação das recomendações (hoje `recommendations.yaml` à mão).
- "Dar baixa" em anomalia — só UI, ou Firestore.
- Gerar `web/src/types.ts` do OpenAPI em vez de manter à mão.
