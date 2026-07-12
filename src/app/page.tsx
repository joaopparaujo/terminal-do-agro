"use client";

import { useState } from "react";
import PainelCotacao from "@/components/PainelCotacao";
import PainelNoticias from "@/components/PainelNoticias";

const ABAS = ["Soja", "Milho", "Boi Gordo", "Notícias"] as const;
type Aba = (typeof ABAS)[number];

const PRODUTO_DA_ABA: Partial<Record<Aba, string>> = {
  Soja: "soja",
  Milho: "milho",
  "Boi Gordo": "boi",
};

export default function Home() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>("Soja");

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-8">
      <header className="border border-border p-4">
        <h1 className="text-2xl font-bold tracking-widest uppercase">
          Terminal do Agro
        </h1>
        <p className="mt-1 text-sm text-muted">
          Soja · Milho · Boi Gordo — preços, histórico e notícias
        </p>
      </header>

      <nav className="mt-4 flex gap-2">
        {ABAS.map((aba) => (
          <button
            key={aba}
            onClick={() => setAbaAtiva(aba)}
            className={`border border-border px-4 py-2 text-sm uppercase tracking-wider transition-colors ${
              abaAtiva === aba
                ? "bg-foreground text-background font-bold"
                : "hover:bg-border"
            }`}
          >
            {aba}
          </button>
        ))}
      </nav>

      <main className="mt-4 flex flex-1 items-center justify-center border border-border p-8">
        {abaAtiva === "Notícias" ? (
          <PainelNoticias />
        ) : (
          <PainelCotacao produto={PRODUTO_DA_ABA[abaAtiva]!} />
        )}
      </main>
    </div>
  );
}
