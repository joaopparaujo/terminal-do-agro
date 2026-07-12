# Terminal do Agro 🌾

Um "Terminal Bloomberg" do agronegócio brasileiro: preços, histórico e
notícias de **soja, milho e boi gordo** numa só tela, com uma camada de IA
que resume as notícias e as conecta aos movimentos de preço.

**🔗 Ao vivo:** [terminal-do-agro.vercel.app](https://terminal-do-agro.vercel.app)

## O que ele faz

- **Cotação do dia** dos três principais indicadores CEPEA/ESALQ:
  Soja Paranaguá, Milho ESALQ/B3 e Boi Gordo CEPEA/B3 (base dos contratos
  futuros da B3), com variação diária.
- **Gráfico histórico desde 2016** (~2.600 pregões por commodity), com
  seletor de período (1S · 1M · 6M · 1A · 2A · 5A · MAX).
- **Notícias com IA**: manchetes de Canal Rural, Money Times e G1
  Agronegócios, resumidas em 1–2 frases e etiquetadas por commodity pelo
  Gemini — notícias irrelevantes para o mercado são filtradas.
- **Manchete que explica o movimento**: cada aba mostra a notícia (da
  commodity ou do cenário macro) cuja direção de impacto prevista pela IA
  combina com a variação do dia.
- **Ticker de manchetes** estilo terminal financeiro, com estética
  âmbar-no-preto em fonte monoespaçada.

## Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Estilo | Tailwind CSS |
| Gráficos | Recharts |
| IA | Gemini 2.5 Flash (`@google/genai`), nível gratuito |
| Hospedagem | Vercel (deploy automático a cada push) |

## Arquitetura dos dados

O maior desafio do projeto: **o CEPEA bloqueia requisições de datacenters**
(403 mesmo em região brasileira), então cada dado tem um caminho próprio:

| Dado | Caminho |
|---|---|
| Preço do dia | Widget oficial do CEPEA carregado **no navegador do visitante** (iframe invisível) — o uso para o qual o widget existe; a API Route serve de primeira tentativa em desenvolvimento |
| Pregões recentes | Tabela do Notícias Agrícolas (que republica os indicadores CEPEA e aceita acesso de datacenter), lida pela API Route com cache de 1h |
| Histórico 2016+ | Planilhas exportadas manualmente da consulta de séries do CEPEA (protegida por Cloudflare), convertidas em JSON por `scripts/importa-historico-cepea.mjs` e commitadas |
| Notícias + IA | Feeds RSS coletados na API Route; **uma** chamada ao Gemini resume/etiqueta/filtra todas as manchetes, com JSON garantido por `responseSchema` + validação zod; resultado cacheado 30 min (`unstable_cache`) |

Toda camada degrada com elegância: sem IA as notícias saem com etiquetas por
palavra-chave; sem histórico o painel mostra só o preço; a tela nunca quebra.

## Rodando localmente

```bash
npm install
# crie .env.local com: GEMINI_API_KEY=sua-chave
npm run dev                  # http://localhost:3000
```

A chave (gratuita) é criada no [Google AI Studio](https://aistudio.google.com/apikey).
Sem ela o site funciona em modo degradado (sem resumos de IA).

Para atualizar a base histórica: baixe as planilhas na
[consulta de séries do CEPEA](https://www.cepea.org.br/br/consultas-ao-banco-de-dados-do-site.aspx)
(Soja Paranaguá, Milho, Boi Gordo) e rode:

```bash
node scripts/importa-historico-cepea.mjs <pasta-com-os-xls>
```

## Licenças e atribuições

- Indicadores de preço: **CEPEA/ESALQ**, licenciados sob
  [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)
  (uso não-comercial com atribuição) — este é um projeto educacional de
  portfólio, sem fins comerciais.
- Pregões recentes exibidos via [Notícias Agrícolas](https://www.noticiasagricolas.com.br).
- Manchetes pertencem aos veículos de origem; o terminal apenas resume e
  aponta para elas.
- Nada aqui é recomendação de investimento.
