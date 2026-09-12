# Contexto de build = raiz do repo (o CI faz `docker build -f apps/api/Dockerfile .`).

# ---- build do SPA (apps/web) ----
FROM node:22-slim AS web
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

# ---- API + SPA num servico so (uma porta de IAP) ----
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 BILLING_API_STATIC_DIR=/app/static
WORKDIR /app

# src precisa estar presente antes do install: o build (hatchling) empacota
# src/billing_api. Sem isso o wheel sai vazio e `import billing_api` falha.
COPY apps/api/pyproject.toml ./
COPY apps/api/src ./src
COPY apps/api/recommendations.yaml ./recommendations.yaml
RUN pip install --no-cache-dir uv && uv pip install --system --no-cache .

COPY --from=web /web/dist ./static

ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn billing_api.main:app --host 0.0.0.0 --port ${PORT}"]
