import { NextRequest } from "next/server";
import seedSoja from "@/data/historico/soja.json";
import seedMilho from "@/data/historico/milho.json";
import seedBoi from "@/data/historico/boi.json";

// Duas fontes complementares, ambas com dados originais do CEPEA:
// - Base histórica: planilhas da consulta de séries do CEPEA (2016 em diante),
//   importadas com scripts/importa-historico-cepea.mjs (download manual —
//   o site do CEPEA tem proteção anti-robô)
// - Pregões recentes: tabela do Notícias Agrícolas, que republica os
//   indicadores CEPEA e aceita requisições de datacenters como o Vercel
const PAGINAS = {
  soja: {
    url: "https://www.noticiasagricolas.com.br/cotacoes/soja/soja-indicador-cepea-esalq-porto-paranagua",
    indicador: "Indicador da Soja CEPEA/ESALQ - Paranaguá",
    seed: seedSoja,
  },
  milho: {
    url: "https://www.noticiasagricolas.com.br/cotacoes/milho/indicador-cepea-esalq-milho",
    indicador: "Indicador do Milho ESALQ/B3",
    seed: seedMilho,
  },
  boi: {
    url: "https://www.noticiasagricolas.com.br/cotacoes/boi-gordo/boi-gordo-indicador-esalq-bmf",
    indicador: "Indicador do Boi Gordo CEPEA/B3",
    seed: seedBoi,
  },
} as const;

type Produto = keyof typeof PAGINAS;

export interface Pregao {
  data: string; // ISO aaaa-mm-dd
  valor: number;
  variacao: number; // % em relação ao pregão anterior
}

function numeroBr(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", "."));
}

function isoDe(dataBr: string): string {
  const [dia, mes, ano] = dataBr.split("/");
  return `${ano}-${mes}-${dia}`;
}

// Busca os pregões mais recentes no Notícias Agrícolas. Se a coleta falhar,
// o terminal segue funcionando só com a base histórica.
async function pregoesRecentes(
  url: string
): Promise<{ data: string; valor: number }[]> {
  try {
    const resposta = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      next: { revalidate: 3600 },
    });
    if (!resposta.ok) throw new Error(`status ${resposta.status}`);

    const html = await resposta.text();
    const linhas = [
      ...html.matchAll(
        /<td>(\d{2}\/\d{2}\/\d{4})<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([+\-]?[\d.,]+)<\/td>/g
      ),
    ];
    return linhas.map(([, data, valor]) => ({
      data: isoDe(data),
      valor: numeroBr(valor),
    }));
  } catch (erro) {
    console.error(`Falha ao coletar pregões recentes de ${url}:`, erro);
    return [];
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ produto: string }> }
) {
  const { produto } = await params;

  if (!(produto in PAGINAS)) {
    return Response.json(
      { erro: `Produto desconhecido: ${produto}` },
      { status: 404 }
    );
  }

  const pagina = PAGINAS[produto as Produto];
  const recentes = await pregoesRecentes(pagina.url);

  // Funde base histórica + recentes (recentes prevalecem em data repetida)
  const porData = new Map<string, number>();
  for (const p of pagina.seed.pregoes) porData.set(p.data, p.valor);
  for (const p of recentes) porData.set(p.data, p.valor);

  const ordenados = [...porData.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const pregoes: Pregao[] = ordenados.map(([data, valor], i) => {
    const anterior = i > 0 ? ordenados[i - 1][1] : valor;
    const variacao =
      anterior > 0 ? Math.round(((valor - anterior) / anterior) * 10000) / 100 : 0;
    return { data, valor, variacao };
  });

  return Response.json({
    produto,
    indicador: pagina.indicador,
    pregoes,
    fonte: "CEPEA/ESALQ (recentes via Notícias Agrícolas)",
    licenca: "CC BY-NC 4.0",
  });
}
