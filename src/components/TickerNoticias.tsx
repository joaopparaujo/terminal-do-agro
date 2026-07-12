"use client";

import { useEffect, useState } from "react";
import type { Noticia } from "@/app/api/noticias/route";

const MAX_ITENS = 12;

export default function TickerNoticias() {
  const [noticias, setNoticias] = useState<Noticia[] | null>(null);

  useEffect(() => {
    let ativo = true;

    fetch("/api/noticias")
      .then((res) => (res.ok ? res.json() : null))
      .then((dados: { noticias: Noticia[] } | null) => {
        if (ativo) setNoticias(dados?.noticias?.slice(0, MAX_ITENS) ?? null);
      })
      .catch(() => {
        if (ativo) setNoticias(null);
      });

    return () => {
      ativo = false;
    };
  }, []);

  if (!noticias || noticias.length === 0) return null;

  // Conteúdo duplicado: quando a primeira metade sai da tela, a segunda
  // está exatamente na mesma posição inicial — loop sem emenda
  const faixa = [...noticias, ...noticias];

  return (
    <div className="mt-4 overflow-hidden border border-border">
      <div className="ticker flex w-max items-center gap-10 py-2">
        {faixa.map((noticia, i) => (
          <a
            key={`${noticia.link}-${i}`}
            href={noticia.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 whitespace-nowrap text-sm hover:underline"
          >
            <span className="text-xs uppercase text-muted">
              [{noticia.etiqueta === "geral" ? "macro" : noticia.etiqueta}]
            </span>
            {noticia.titulo}
            <span className="text-muted">•</span>
          </a>
        ))}
      </div>
    </div>
  );
}
