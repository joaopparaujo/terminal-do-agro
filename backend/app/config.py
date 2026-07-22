from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração lida de variáveis de ambiente (e do arquivo .env em dev)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # String de conexão do Postgres (Supabase). Vazia na Fase 0: enquanto não
    # houver banco, o /health reporta "not_configured" em vez de quebrar.
    database_url: str = ""

    # Origens liberadas no CORS: o front em dev e o domínio de produção.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "https://terminal-do-agro.vercel.app",
    ]


settings = Settings()
