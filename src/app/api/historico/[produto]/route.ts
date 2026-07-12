import { NextRequest } from "next/server";

// Páginas do Notícias Agrícolas que republicam os indicadores CEPEA com uma
// tabela dos últimos pregões (data, valor, variação %). Diferente do site do
// CEPEA, o NA aceita requisições vindas de datacenters como o Vercel.
const PAGINAS = {
  soja: {
    url: "https://www.noticiasagricolas.com.br/cotacoes/soja/soja-indicador-cepea-esalq-porto-paranagua",
    indicador: "Indicador da Soja CEPEA/ESALQ - Paranaguá",
  },
  milho: {
    url: "https://www.noticiasagricolas.com.br/cotacoes/milho/indicador-cepea-esalq-milho",
    indicador: "Indicador do Milho ESALQ/B3",
  },
  boi: {
    url: "https://www.noticiasagricolas.com.br/cotacoes/boi-gordo/boi-gordo-indicador-esalq-bmf",
    indicador: "Indicador do Boi Gordo CEPEA/B3",
  },
} as const;

type Produto = keyof typeof PAGINAS;

export interface Pregao {
  data: string; // dd/mm/aaaa
  valor: number;
  variacao: number; // % em relação ao pregão anterior
}

function numeroBr(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", "."));
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

  try {
    const resposta = await fetch(pagina.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      next: { revalidate: 3600 },
    });

    if (!resposta.ok) {
      throw new Error(`Notícias Agrícolas respondeu com status ${resposta.status}`);
    }

    const html = await resposta.text();

    // Linhas da tabela de cotações: <td>data</td><td>valor</td><td>variação</td>
    const linhas = [
      ...html.matchAll(
        /<td>(\d{2}\/\d{2}\/\d{4})<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([+\-]?[\d.,]+)<\/td>/g
      ),
    ];

    if (linhas.length === 0) {
      throw new Error("Formato da página mudou; nenhum pregão encontrado");
    }

    // A página lista do mais recente para o mais antigo; o gráfico quer
    // ordem cronológica
    const pregoes: Pregao[] = linhas
      .map(([, data, valor, variacao]) => ({
        data,
        valor: numeroBr(valor),
        variacao: numeroBr(variacao),
      }))
      .reverse();

    return Response.json({
      produto,
      indicador: pagina.indicador,
      pregoes,
      fonte: "CEPEA/ESALQ via Notícias Agrícolas",
      licenca: "CC BY-NC 4.0",
    });
  } catch (erro) {
    console.error(`Falha ao coletar histórico de ${produto}:`, erro);
    return Response.json(
      { erro: "Não foi possível obter o histórico agora." },
      { status: 502 }
    );
  }
}
