import { GoogleGenAI, Type } from "@google/genai";
import { unstable_cache } from "next/cache";
import Parser from "rss-parser";
import { z } from "zod";

const FEEDS = [
  { fonte: "Canal Rural", url: "https://www.canalrural.com.br/feed/" },
  {
    fonte: "Money Times",
    url: "https://www.moneytimes.com.br/tag/agronegocio/feed/",
  },
  {
    fonte: "G1 Agronegócios",
    url: "https://g1.globo.com/rss/g1/economia/agronegocios/",
  },
] as const;

const MAX_NOTICIAS = 24;

export type Etiqueta = "soja" | "milho" | "boi" | "geral";

export interface Noticia {
  titulo: string;
  link: string;
  data: string; // ISO
  fonte: string;
  resumo: string | null; // null quando a IA não está disponível
  etiqueta: Etiqueta;
  impacto: Impacto | null; // direção provável do efeito sobre o preço
}

export type Impacto = "alta" | "baixa" | "neutro";

// Modelo do nível gratuito da API do Gemini; ajustável sem mexer no código
const MODELO_IA = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// Validação do que a IA devolve — se vier fora do formato, cai no plano B
const AnaliseSchema = z.object({
  analises: z.array(
    z.object({
      id: z.number(),
      resumo: z.string(),
      etiqueta: z.enum(["soja", "milho", "boi", "geral"]),
      relevante: z.boolean(),
      impacto: z.enum(["alta", "baixa", "neutro"]),
    })
  ),
});

interface ItemBruto {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  descricao: string;
}

async function coletarFeeds(): Promise<ItemBruto[]> {
  const parser = new Parser({
    timeout: 10000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
  });

  // Cada feed pode falhar sem derrubar os outros
  const resultados = await Promise.allSettled(
    FEEDS.map(async ({ fonte, url }) => {
      const feed = await parser.parseURL(url);
      return (feed.items ?? []).slice(0, 10).map((item): ItemBruto => ({
        titulo: item.title?.trim() ?? "",
        link: item.link ?? "",
        data: item.isoDate ?? new Date().toISOString(),
        fonte,
        descricao: (item.contentSnippet ?? "").slice(0, 300),
      }));
    })
  );

  return resultados
    .filter(
      (r): r is PromiseFulfilledResult<ItemBruto[]> => r.status === "fulfilled"
    )
    .flatMap((r) => r.value)
    .filter((n) => n.titulo && n.link)
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, MAX_NOTICIAS);
}

// Plano B sem IA: etiqueta por palavra-chave no título, sem resumo
function etiquetaPorPalavraChave(titulo: string): Etiqueta {
  const t = titulo.toLowerCase();
  if (/soja/.test(t)) return "soja";
  if (/milho/.test(t)) return "milho";
  if (/\bboi\b|boi gordo|pecuári|bovin|carne/.test(t)) return "boi";
  return "geral";
}

async function analisarComIA(itens: ItemBruto[]): Promise<Noticia[]> {
  const ia = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const entrada = itens.map((n, id) => ({
    id,
    titulo: n.titulo,
    descricao: n.descricao,
  }));

  const resposta = await ia.models.generateContent({
    model: MODELO_IA,
    contents: JSON.stringify(entrada),
    config: {
      systemInstruction:
        "Você é o editor de um terminal de mercado do agronegócio brasileiro, " +
        "focado nos preços de soja, milho e boi gordo. Para cada notícia: " +
        "(1) resumo objetivo de 1 a 2 frases em português, focado no que importa " +
        "para quem acompanha preços; " +
        "(2) etiqueta: 'soja', 'milho' ou 'boi' se for principalmente sobre essa " +
        "commodity; 'geral' para o cenário macro do agro (câmbio, clima, política " +
        "agrícola, exportações, logística, crédito rural); " +
        "(3) relevante: true se a notícia afeta ou contextualiza preços de " +
        "commodities ou o cenário macro do agronegócio; false para curiosidades, " +
        "receitas, turismo rural, fauna e temas sem efeito sobre o mercado; " +
        "(4) impacto: direção provável do efeito sobre o preço da commodity " +
        "etiquetada ('alta', 'baixa' ou 'neutro' se incerto/sem direção).",
      responseMimeType: "application/json",
      // Schema que a API do Gemini força na resposta
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analises: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                resumo: { type: Type.STRING },
                etiqueta: {
                  type: Type.STRING,
                  enum: ["soja", "milho", "boi", "geral"],
                },
                relevante: { type: Type.BOOLEAN },
                impacto: {
                  type: Type.STRING,
                  enum: ["alta", "baixa", "neutro"],
                },
              },
              required: ["id", "resumo", "etiqueta", "relevante", "impacto"],
            },
          },
        },
        required: ["analises"],
      },
    },
  });

  // Valida o JSON devolvido; se estiver fora do formato, lança e cai no plano B
  const dados = AnaliseSchema.parse(JSON.parse(resposta.text ?? ""));
  const analises = new Map(dados.analises.map((a) => [a.id, a]));

  return itens
    .map((n, id) => ({ n, analise: analises.get(id) }))
    // Fora curiosidades/receitas/etc.: só o que afeta mercado ou macro do agro
    .filter(({ analise }) => analise?.relevante !== false)
    .map(({ n, analise }) => ({
      titulo: n.titulo,
      link: n.link,
      data: n.data,
      fonte: n.fonte,
      resumo: analise?.resumo ?? null,
      etiqueta: analise?.etiqueta ?? etiquetaPorPalavraChave(n.titulo),
      impacto: analise?.impacto ?? null,
    }));
}

// Cache em tempo de execução (não no build, onde a chave da IA não existe):
// a coleta + IA rodam no máximo a cada 30 min, independente de visitas
const noticiasCacheadas = unstable_cache(
  async () => {
    const itens = await coletarFeeds();

    let noticias: Noticia[] | null = null;
    let ia = false;

    if (process.env.GEMINI_API_KEY && itens.length > 0) {
      try {
        noticias = await analisarComIA(itens);
        ia = true;
      } catch (erro) {
        console.error("Falha na análise por IA; usando plano B:", erro);
      }
    }

    // Sem chave ou com falha na IA: notícias saem sem resumo, com etiqueta
    // por palavra-chave — a aba continua útil
    noticias ??= itens.map((n) => ({
      titulo: n.titulo,
      link: n.link,
      data: n.data,
      fonte: n.fonte,
      resumo: null,
      etiqueta: etiquetaPorPalavraChave(n.titulo),
      impacto: null,
    }));

    return { noticias, ia, geradoEm: new Date().toISOString() };
  },
  ["noticias-v4"],
  { revalidate: 1800 }
);

export async function GET() {
  return Response.json(await noticiasCacheadas());
}
