import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .bq import mock_active
from .config import get_settings
from .routes import router

logging.basicConfig(level=logging.INFO)

S = get_settings()
app = FastAPI(title="Painel FinOps CI Polaris — API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(S.cors_origins),
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
    logging.exception("erro nao tratado")
    return JSONResponse(status_code=500, content={"error": {"code": "internal", "message": str(exc)}})


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "mode": "mock" if mock_active() else "bigquery"}


app.include_router(router)


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
_static = Path(S.static_dir) if S.static_dir else None
if _static and (_static / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=_static / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa(full_path: str) -> FileResponse:
        if full_path.startswith(("api/", "healthz")):
            raise HTTPException(status_code=404)
        candidate = _static / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_static / "index.html")
