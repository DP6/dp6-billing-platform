import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .adm_routes import router as adm_router
from .bq import mock_active
from .config import get_settings
from .routes import router

logging.basicConfig(level=logging.INFO)

S = get_settings()
app = FastAPI(title="Painel FinOps CI Polaris — API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(S.cors_origins),
    # POST/PUT/DELETE: aba ADM (budget/e-mail/relatório semanal) -- primeira
    # escrita deste app, antes disso era GET-only de propósito.
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
    logging.exception("erro nao tratado")
    return JSONResponse(status_code=500, content={"error": {"code": "internal", "message": str(exc)}})


@app.exception_handler(HTTPException)
async def _http_exc(_: Request, exc: HTTPException) -> JSONResponse:
    # mesmo contrato {"error": {...}} do handler generico acima, pros dois serem
    # indistinguiveis pro cliente (apps/web/src/lib/api.ts le body.error.message).
    detail = exc.detail
    body = detail if isinstance(detail, dict) and "message" in detail else {"code": "http_error", "message": str(detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": body})


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "mode": "mock" if mock_active() else "bigquery"}


app.include_router(router)
app.include_router(adm_router)


@app.middleware("http")
async def _data_freshness_header(request: Request, call_next):
    resp = await call_next(request)
    if request.url.path.startswith("/api") and not mock_active():
        try:
            from .routes import meta

            resp.headers["X-Data-Updated-At"] = meta().data_updated_at
        except Exception:
            pass
    return resp


# SPA: o build do apps/web e copiado para BILLING_API_STATIC_DIR (/app/static na imagem).
# Serve os assets e faz fallback de qualquer rota nao-/api para index.html (react-router).
# Em dev local a var fica vazia e o Vite serve o front.
_static = Path(S.static_dir).resolve() if S.static_dir else None
if _static and (_static / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=_static / "assets"), name="assets")

    # O conteudo estatico e imutavel (copiado para a imagem no build), entao o conjunto de
    # arquivos servveis e fixado aqui no startup. O caminho da URL vira chave de busca neste
    # dict e nunca e concatenado no filesystem -- sem concatenacao nao ha travessia possivel
    # ("%2e%2e%2f", que o uvicorn decodifica para "../" antes de rotear, simplesmente nao casa
    # com nenhuma chave e cai no fallback do index.html).
    _servable = {p.relative_to(_static).as_posix(): p for p in _static.rglob("*") if p.is_file()}

    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa(full_path: str) -> FileResponse:
        if full_path.startswith(("api/", "healthz")):
            raise HTTPException(status_code=404)
        return FileResponse(_servable.get(full_path) or _static / "index.html")
