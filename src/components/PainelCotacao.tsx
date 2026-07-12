"use client";

import { useEffect, useState } from "react";
import GraficoPrecos from "@/components/GraficoPrecos";
import type { Pregao } from "@/app/api/historico/[produto]/route";
import type { Noticia } from "@/app/api/noticias/route";

interface Cotacao {
  produto: string;
  indicador: string;
  data: string;
  valorFormatado: string;
  unidade: string;
  fonte: string;
  licenca: string;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro" }
  | { fase: "ok"; cotacao: Cotacao };

// Qual indicador CEPEA exatamente cada aba mostra — há indicadores
// parecidos (ex.: Soja Paranaguá vs. Soja Paraná), então seja explícito
const DETALHES: Record<string, { titulo: string; detalhe: string }> = {
  soja: {
    titulo: "Indicador da Soja CEPEA/ESALQ — Paranaguá",
    detalhe:
      "Saca de 60 kg no porto de Paranaguá-PR (referência de exportação; difere do indicador Paraná, média do estado)",
  },
  milho: {
    titulo: "Indicador do Milho ESALQ/B3",
    detalhe: "Saca de 60 kg, à vista, região de Campinas-SP",
  },
  boi: {
    titulo: "Indicador do Boi Gordo CEPEA/B3",
    detalhe:
      "Arroba (15 kg), Estado de São Paulo — base dos contratos futuros da B3",
  },
};

const PERIODOS = [
  { rotulo: "1S", dias: 7 },
  { rotulo: "1M", dias: 30 },
  { rotulo: "6M", dias: 183 },
  { rotulo: "1A", dias: 365 },
  { rotulo: "2A", dias: 730 },
  { rotulo: "5A", dias: 1826 },
  { rotulo: "MAX", dias: Infinity },
] as const;

type Periodo = (typeof PERIODOS)[number]["rotulo"];

const MAX_PONTOS_NO_GRAFICO = 380;

function filtrarPeriodo(pregoes: Pregao[], dias: number): Pregao[] {
  if (!Number.isFinite(dias)) return pregoes;
  const corte = new Date(Date.now() - dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return pregoes.filter((p) => p.data >= corte);
}

// Para janelas longas, desenhar todos os pregões deixa o gráfico pesado sem
// ganho visual; mantemos no máximo ~380 pontos, preservando o último
function podarPontos(pregoes: Pregao[]): Pregao[] {
  if (pregoes.length <= MAX_PONTOS_NO_GRAFICO) return pregoes;
  const passo = Math.ceil(pregoes.length / MAX_PONTOS_NO_GRAFICO);
  const podados = pregoes.filter((_, i) => i % passo === 0);
  if (podados[podados.length - 1] !== pregoes[pregoes.length - 1]) {
    podados.push(pregoes[pregoes.length - 1]);
  }
  return podados;
}

const IDS_WIDGET: Record<string, number> = {
  soja: 92,
  milho: 77,
  boi: 2,
};

// Plano B: o servidor do Vercel é bloqueado pelo CEPEA (403 para IPs de
// datacenter), mas o navegador do visitante não é. Carregamos o widget
// oficial num iframe invisível — o uso para o qual ele foi criado — e
// lemos a tabela que ele desenha.
function buscarViaWidget(produto: string): Promise<Cotacao> {
  return new Promise((resolve, reject) => {
    const id = IDS_WIDGET[produto];
    if (!id) return reject(new Error(`produto desconhecido: ${produto}`));

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.srcdoc = `<script src="https://www.cepea.org.br/br/widgetproduto.js.php?id_indicador%5B%5D=${id}"><\/script>`;
    document.body.appendChild(iframe);

    const inicio = Date.now();
    const timer = setInterval(() => {
      const linha = iframe.contentDocument?.querySelector(
        ".imagenet-widget-tabela tbody tr"
      );
      if (linha) {
        clearInterval(timer);
        const celulas = linha.querySelectorAll("td");
        const data = celulas[0]?.textContent?.trim() ?? "";
        const nome = celulas[1]?.querySelector(".maior")?.textContent?.trim();
        const unidade = celulas[1]
          ?.querySelector(".unidade")
          ?.textContent?.trim();
        const valor = celulas[2]?.querySelector(".maior")?.textContent?.trim();
        iframe.remove();

        if (!data || !nome || !unidade || !valor) {
          return reject(new Error("widget em formato inesperado"));
        }
        resolve({
          produto: nome,
          indicador: `Indicador CEPEA/ESALQ — ${nome}`,
          data,
          valorFormatado: `R$ ${valor}`,
          unidade,
          fonte: "CEPEA/ESALQ",
          licenca: "CC BY-NC 4.0",
        });
      } else if (Date.now() - inicio > 10000) {
        clearInterval(timer);
        iframe.remove();
        reject(new Error("widget não carregou a tempo"));
      }
    }, 200);
  });
}

async function buscarCotacao(produto: string): Promise<Cotacao> {
  try {
    const res = await fetch(`/api/cotacao/${produto}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.json();
  } catch {
    return buscarViaWidget(produto);
  }
}

function Variacao({ variacao }: { variacao: number }) {
  const sinal = variacao > 0 ? "▲" : variacao < 0 ? "▼" : "▪";
  const cor =
    variacao > 0
      ? "text-green-400"
      : variacao < 0
        ? "text-red-400"
        : "text-muted";
  return (
    <span className={cor}>
      {sinal} {variacao > 0 ? "+" : ""}
      {variacao.toLocaleString("pt-BR")}%
    </span>
  );
}

type TipoRelacionada =
  | "explica-movimento"
  | "explica-macro"
  | "commodity-recente";

// A manchete só aparece se explicar o movimento do dia (pela commodity ou
// por fator macro com direção congruente) ou se tiver relação direta com
// a commodity; caso contrário, nada é exibido
function escolherRelacionada(
  noticias: Noticia[],
  produto: string,
  variacao: number | undefined
): { noticia: Noticia; tipo: TipoRelacionada } | null {
  const doProduto = noticias.filter((n) => n.etiqueta === produto);
  const direcao = variacao ? (variacao > 0 ? "alta" : "baixa") : null;

  if (direcao) {
    const daCommodity = doProduto.find((n) => n.impacto === direcao);
    if (daCommodity)
      return { noticia: daCommodity, tipo: "explica-movimento" };

    const macro = noticias.find(
      (n) => n.etiqueta === "geral" && n.impacto === direcao
    );
    if (macro) return { noticia: macro, tipo: "explica-macro" };
  }

  if (doProduto.length > 0)
    return { noticia: doProduto[0], tipo: "commodity-recente" };

  return null;
}

const ROTULO_RELACIONADA: Record<TipoRelacionada, string> = {
  "explica-movimento": "📰 Manchete que ajuda a explicar o movimento",
  "explica-macro": "📰 Fator macro que ajuda a explicar o movimento",
  "commodity-recente": "📰 Notícia recente sobre a commodity",
};

export default function PainelCotacao({ produto }: { produto: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [pregoes, setPregoes] = useState<Pregao[] | null>(null);
  const [noticias, setNoticias] = useState<Noticia[] | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("1A");

  useEffect(() => {
    let ativo = true;
    setEstado({ fase: "carregando" });
    setPregoes(null);

    buscarCotacao(produto)
      .then((cotacao) => {
        if (ativo) setEstado({ fase: "ok", cotacao });
      })
      .catch(() => {
        if (ativo) setEstado({ fase: "erro" });
      });

    // Notícias para a manchete relacionada; se falhar, o painel segue sem ela
    fetch("/api/noticias")
      .then((res) => (res.ok ? res.json() : null))
      .then((dados: { noticias: Noticia[] } | null) => {
        if (ativo) setNoticias(dados?.noticias ?? null);
      })
      .catch(() => {
        if (ativo) setNoticias(null);
      });

    // Histórico é camada extra: se falhar, o painel segue só com o preço
    fetch(`/api/historico/${produto}`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((historico: { pregoes: Pregao[] }) => {
        if (ativo) setPregoes(historico.pregoes);
      })
      .catch(() => {
        if (ativo) setPregoes(null);
      });

    return () => {
      ativo = false;
    };
  }, [produto]);

  if (estado.fase === "carregando") {
    return <p className="animate-pulse text-muted">carregando cotação…</p>;
  }

  if (estado.fase === "erro") {
    return (
      <p className="text-muted">
        Não foi possível obter a cotação agora. Tente novamente mais tarde.
      </p>
    );
  }

  const { cotacao } = estado;
  const detalhes = DETALHES[produto];
  const ultimoPregao = pregoes?.[pregoes.length - 1];
  const relacionada = noticias
    ? escolherRelacionada(noticias, produto, ultimoPregao?.variacao)
    : null;
  const pregoesDoPeriodo = pregoes
    ? podarPontos(
        filtrarPeriodo(
          pregoes,
          PERIODOS.find((p) => p.rotulo === periodo)?.dias ?? Infinity
        )
      )
    : null;

  return (
    <div className="w-full max-w-2xl text-center">
      <p className="text-sm uppercase tracking-wider text-muted">
        {detalhes?.titulo ?? cotacao.indicador}
      </p>
      <p className="mt-4 text-5xl font-bold sm:text-6xl">
        {cotacao.valorFormatado}
      </p>
      <p className="mt-2 text-muted">
        {cotacao.unidade}
        {ultimoPregao && (
          <>
            {" · "}
            <Variacao variacao={ultimoPregao.variacao} />
          </>
        )}
      </p>
      {detalhes && (
        <p className="mx-auto mt-2 max-w-xl text-xs text-muted">
          {detalhes.detalhe}
        </p>
      )}
      {pregoesDoPeriodo && pregoesDoPeriodo.length > 1 && (
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted">
              Histórico
            </p>
            <div className="flex gap-1">
              {PERIODOS.map(({ rotulo }) => (
                <button
                  key={rotulo}
                  onClick={() => setPeriodo(rotulo)}
                  className={`border border-border px-2 py-1 text-xs transition-colors ${
                    periodo === rotulo
                      ? "bg-foreground font-bold text-background"
                      : "text-muted hover:bg-border"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
          <GraficoPrecos pregoes={pregoesDoPeriodo} />
        </div>
      )}
      {relacionada && (
        <div className="mt-6 border border-border p-3 text-left">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted">
            {ROTULO_RELACIONADA[relacionada.tipo]}
          </p>
          <a
            href={relacionada.noticia.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold hover:underline"
          >
            {relacionada.noticia.titulo}
          </a>
          {relacionada.noticia.resumo && (
            <p className="mt-1 text-sm text-muted">
              {relacionada.noticia.resumo}
            </p>
          )}
        </div>
      )}
      <p className="mt-6 text-sm text-muted">
        Referência: {cotacao.data} · Fonte: {cotacao.fonte} ({cotacao.licenca})
      </p>
    </div>
  );
}
