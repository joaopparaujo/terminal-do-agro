# Terminal do Agro — API (backend)

Motor de dados e valuation em Python/FastAPI. Serve a camada que o front
Next.js (na raiz do repositório) consome: séries persistidas em Postgres e,
mais adiante, os endpoints de DCF e Monte Carlo.

Estado: **Fase 0 — fundação técnica.** Só o esqueleto e o `/health`. O banco
e o schema entram na próxima etapa.

## Rodar localmente (Windows / PowerShell)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Abra http://localhost:8000/health e http://localhost:8000/docs.

## Endpoints

| Rota      | Descrição                                             |
|-----------|-------------------------------------------------------|
| `GET /`   | identifica o serviço                                  |
| `GET /health` | saúde do serviço + estado do banco (`not_configured` na Fase 0) |
| `GET /docs`   | Swagger UI (automático do FastAPI)                |

## Deploy (quando for a hora)

Serviço FastAPI comum — Render ou Railway (free tier), root directory `backend`.
Comando de start:

```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Variáveis de ambiente: `DATABASE_URL` (Supabase, a partir da próxima etapa).
