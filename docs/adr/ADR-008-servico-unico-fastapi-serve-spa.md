# ADR-008 — Serviço único: FastAPI serve o SPA

Data: 2026-09-10 · Status: aceito · Revisa parte da ADR-004

## Contexto

A ADR-004 previa `apps/api/` e `apps/web/` como **dois** Cloud Run v2, ambos atrás de IAP,
com o nginx do web fazendo `proxy_pass` de `/api/` para o Cloud Run da API.

No primeiro deploy real isso não funcionou: o SPA carrega, mas toda chamada `/api/*` volta
**401**. O cookie de sessão do IAP é emitido por recurso (host `billing-web-dev`). O nginx
repassa esse cookie server-side para o host `billing-platform-api-dev`, e o IAP da API o rejeita —
mesmo com o mesmo OAuth client. Proxy server-side não carrega a identidade do IAP.

## Decisão

**Um serviço só.** A imagem da API (`apps/api/Dockerfile`, multi-stage) embute o build do
`apps/web` em `/app/static`; o FastAPI serve os assets e faz fallback de rota para
`index.html` (react-router), além de `/api/*` e `/healthz`. Só `billing-platform-api-{env}` fica atrás
de IAP. `module.web`, `nginx.conf` e o `Dockerfile` do web são removidos.

## Alternativas consideradas

- **API sem IAP + ingress interno + nginx injeta ID token** — precisa de VPC connector no
  web e njs/sidecar para buscar o token. Mais infra.
- **SPA chama a API direto** (`VITE_API_BASE` = URL da API) — dois logins de IAP e briga de
  CORS preflight × IAP.

## Consequências

- `apps-deploy` vira um job só; contexto de build = raiz do repo (`docker build -f
  apps/api/Dockerfile .`) para o Dockerfile enxergar `apps/web` e `apps/api`.
- `apps/web` continua no repo e no `apps-ci` (lint + `vite build` como check); só perde os
  arquivos de container.
- `terraform apply` destrói `billing-web-{env}` (serviço, SA de runtime, binding de IAP).
- `apps/api` ganha `BILLING_API_STATIC_DIR` (vazio em dev local → Vite serve o front).
- Um único brand/backend de IAP para configurar.
