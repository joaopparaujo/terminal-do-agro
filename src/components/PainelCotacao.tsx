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

export default function PainelCotacao({ produto }: { produto: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  useEffect(() => {
    let ativo = true;
    setEstado({ fase: "carregando" });

    fetch(`/api/cotacao/${produto}`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((cotacao: Cotacao) => {
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
