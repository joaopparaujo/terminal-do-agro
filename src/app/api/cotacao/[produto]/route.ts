import { NextRequest } from "next/server";

// Indicadores CEPEA/ESALQ. O id é o mesmo usado pelo widget oficial de
// cotações do CEPEA (https://www.cepea.org.br/br/widget.aspx).
// Semana 2: adicionar milho e boi gordo é acrescentar uma linha aqui.
const INDICADORES = {
  soja: { id: 92, nome: "Indicador da Soja CEPEA/ESALQ - Paranaguá" },
} as const;

type Produto = keyof typeof INDICADORES;

export interface Cotacao {
  produto: string;
  indicador: string;
  data: string;
  valor: number;
  valorFormatado: string;
  unidade: string;
  fonte: string;
  licenca: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ produto: string }> }
) {
  const { produto } = await params;

  if (!(produto in INDICADORES)) {
    return Response.json(
      { erro: `Produto desconhecido: ${produto}` },
      { status: 404 }
    );
  }

  const indicador = INDICADORES[produto as Produto];

  try {
    const resposta = await fetch(
      `https://www.cepea.org.br/br/widgetproduto.js.php?id_indicador%5B%5D=${indicador.id}`,
      {
        headers: {
          // O CEPEA recusa requisições sem identificação de navegador (403)
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
        next: { revalidate: 3600 },
      }
    );

    if (!resposta.ok) {
      throw new Error(`CEPEA respondeu com status ${resposta.status}`);
    }

    const html = await resposta.text();

    // O widget devolve uma tabela HTML dentro de document.write(). A linha de
    // dados tem o formato:
    //   <td>10/07/2026</td>
    //   <td><span class="maior">Soja Paranaguá</span><br /> <span class="unidade">sc de 60kg</span></td>
    //   <td>R$ <span class="maior">140,44</span></td>
    const linha = html.match(
      /<td>(\d{2}\/\d{2}\/\d{4})<\/td>\s*<td><span class="maior">([^<]+)<\/span><br\s*\/?>\s*<span class="unidade">([^<]+)<\/span><\/td>\s*<td>R\$ <span class="maior">([\d.,]+)<\/span>/
    );

    if (!linha) {
      throw new Error("Formato do widget do CEPEA mudou; parser não encontrou os dados");
    }

    const [, data, nomeProduto, unidade, valorTexto] = linha;
    const valor = Number(valorTexto.replace(/\./g, "").replace(",", "."));

    const cotacao: Cotacao = {
      produto: nomeProduto.trim(),
      indicador: indicador.nome,
      data,
      valor,
      valorFormatado: `R$ ${valorTexto}`,
      unidade: unidade.trim(),
      fonte: "CEPEA/ESALQ",
      licenca: "CC BY-NC 4.0",
    };

    return Response.json(cotacao);
  } catch (erro) {
    console.error(`Falha ao coletar cotação de ${produto}:`, erro);
    return Response.json(
      { erro: "Não foi possível obter a cotação no CEPEA agora." },
      { status: 502 }
    );
  }
}
