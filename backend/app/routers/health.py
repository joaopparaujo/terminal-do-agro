from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["infra"])


async def checa_db() -> str:
    """Estado da conexão com o banco.

    Na Fase 0 ainda não há Postgres: se DATABASE_URL não estiver definida,
    devolve "not_configured". A checagem real (um SELECT 1 no pool) entra
    junto com o schema, na próxima etapa.
    """
    if not settings.database_url:
        return "not_configured"
    return "pending"


@router.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "servico": "terminal-do-agro-api",
        "versao": "0.0.1",
        "db": await checa_db(),
    }
