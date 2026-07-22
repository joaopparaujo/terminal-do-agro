from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ganchos de inicialização/desligamento do serviço. Na próxima etapa,
    # aqui abrimos e fechamos o pool de conexões do Postgres.
    yield


app = FastAPI(
    title="Terminal do Agro — API",
    description="Motor de dados e valuation. Fase 0: fundação técnica.",
    version="0.0.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(health.router)


@app.get("/")
def raiz() -> dict:
    return {"servico": "terminal-do-agro-api", "docs": "/docs", "health": "/health"}
