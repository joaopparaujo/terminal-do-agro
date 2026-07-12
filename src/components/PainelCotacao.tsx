"use client";

import { useEffect, useState } from "react";

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

// Mesmos ids de indicador usados pela API Route (widget oficial do CEPEA)
const IDS_WIDGET: Record<string, number> = {
  soja: 92,
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

export default function PainelCotacao({ produto }: { produto: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  useEffect(() => {
    let ativo = true;
    setEstado({ fase: "carregando" });

    buscarCotacao(produto)
      .then((cotacao) => {
        if (ativo) setEstado({ fase: "ok", cotacao });
      })
      .catch(() => {
        if (ativo) setEstado({ fase: "erro" });
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

  return (
    <div className="text-center">
      <p className="text-sm uppercase tracking-wider text-muted">
        {cotacao.indicador}
      </p>
      <p className="mt-4 text-5xl font-bold sm:text-6xl">
        {cotacao.valorFormatado}
      </p>
      <p className="mt-2 text-muted">{cotacao.unidade}</p>
      <p className="mt-6 text-sm text-muted">
        Referência: {cotacao.data} · Fonte: {cotacao.fonte} ({cotacao.licenca})
      </p>
    </div>
  );
}
