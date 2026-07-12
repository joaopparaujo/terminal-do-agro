"use client";

import { useEffect, useState } from "react";
import type { Etiqueta, Noticia } from "@/app/api/noticias/route";

type Estado =
  | { fase: "carregando" }
  | { fase: "erro" }
  | { fase: "ok"; noticias: Noticia[]; ia: boolean };

const FILTROS: { rotulo: string; valor: Etiqueta | "todas" }[] = [
  { rotulo: "Todas", valor: "todas" },
  { rotulo: "Soja", valor: "soja" },
  { rotulo: "Milho", valor: "milho" },
  { rotulo: "Boi", valor: "boi" },
  { rotulo: "Geral", valor: "geral" },
];

const COR_ETIQUETA: Record<Etiqueta, string> = {
  soja: "text-green-400 border-green-400",
  milho: "text-yellow-400 border-yellow-400",
  boi: "text-red-400 border-red-400",
  geral: "text-muted border-border",
};

function formatarData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PainelNoticias() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [filtro, setFiltro] = useState<Etiqueta | "todas">("todas");

  useEffect(() => {
    let ativo = true;

    fetch("/api/noticias")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((dados: { noticias: Noticia[]; ia: boolean }) => {
        if (ativo)
          setEstado({ fase: "ok", noticias: dados.noticias, ia: dados.ia });
      })
      .catch(() => {
        if (ativo) setEstado({ fase: "erro" });
      });

    return () => {
      ativo = false;
    };
  }, []);

  if (estado.fase === "carregando") {
    return <p className="animate-pulse text-muted">carregando notícias…</p>;
  }

  if (estado.fase === "erro") {
    return (
      <p className="text-muted">
        Não foi possível carregar as notícias agora. Tente novamente mais
        tarde.
      </p>
    );
  }

  const visiveis =
    filtro === "todas"
      ? estado.noticias
      : estado.noticias.filter((n) => n.etiqueta === filtro);

  return (
    <div className="w-full max-w-2xl self-start">
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTROS.map(({ rotulo, valor }) => (
          <button
            key={valor}
            onClick={() => setFiltro(valor)}
            className={`border border-border px-3 py-1 text-xs uppercase tracking-wider transition-colors ${
              filtro === valor
                ? "bg-foreground font-bold text-background"
                : "text-muted hover:bg-border"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {!estado.ia && (
        <p className="mb-4 text-xs text-muted">
          Resumos por IA indisponíveis no momento — exibindo manchetes.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {visiveis.map((noticia) => (
          <li key={noticia.link} className="border border-border p-3">
            <div className="mb-1 flex items-center gap-2 text-xs">
              <span
                className={`border px-1.5 py-0.5 uppercase ${COR_ETIQUETA[noticia.etiqueta]}`}
              >
                {noticia.etiqueta}
              </span>
              <span className="text-muted">
                {noticia.fonte} · {formatarData(noticia.data)}
              </span>
            </div>
            <a
              href={noticia.link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold hover:underline"
            >
              {noticia.titulo}
            </a>
            {noticia.resumo && (
              <p className="mt-1 text-sm text-muted">{noticia.resumo}</p>
            )}
          </li>
        ))}
        {visiveis.length === 0 && (
          <li className="text-muted">Nenhuma notícia com essa etiqueta.</li>
        )}
      </ul>
    </div>
  );
}
