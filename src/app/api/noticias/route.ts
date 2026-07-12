import { GoogleGenAI, Type } from "@google/genai";
import Parser from "rss-parser";
import { z } from "zod";

// Resposta inteira cacheada por 30 min: a IA roda no máximo 2x por hora,
// independente de quantos visitantes abrirem a aba
export const dynamic = "force-static";
export const revalidate = 1800;

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
}

// Modelo do nível gratuito da API do Gemini; ajustável sem mexer no código
const MODELO_IA = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// Validação do que a IA devolve — se vier fora do formato, cai no plano B
const AnaliseSchema = z.object({
  analises: z.array(
    z.object({
      id: z.number(),
      resumo: z.string(),
      etiqueta: z.enum(["soja", "milho", "boi", "geral"]),
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
        "Você é o editor de um terminal de mercado do agronegócio brasileiro. " +
        "Para cada notícia recebida: (1) escreva um resumo objetivo de 1 a 2 frases " +
        "em português, focado no que importa para quem acompanha preços; " +
        "(2) classifique com a etiqueta 'soja', 'milho' ou 'boi' quando a notícia " +
        "for principalmente sobre essa commodity, ou 'geral' caso contrário.",
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
              },
              required: ["id", "resumo", "etiqueta"],
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

  return itens.map((n, id) => {
    const analise = analises.get(id);
    return {
      titulo: n.titulo,
      link: n.link,
      data: n.data,
      fonte: n.fonte,
      resumo: analise?.resumo ?? null,
      etiqueta: analise?.etiqueta ?? etiquetaPorPalavraChave(n.titulo),
    };
  });
}

export async function GET() {
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
  }));

  return Response.json({
    noticias,
    ia,
    geradoEm: new Date().toISOString(),
  });
}
